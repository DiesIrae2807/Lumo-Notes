import type { AppSettings } from "../types/settings";
import type { Folder, Note } from "../types/note";
import {
  createBackup,
  validateBackup,
  type LumoBackup,
} from "../services/fileTransfer";
import {
  getAttachmentBackupPayloads,
  getLockBackupMetadata,
  type AttachmentBackupPayload,
} from "../services/database";
import { encryptCloudBackup, decryptCloudBackup, type EncryptedCloudBackup } from "./backupEncryption";
import { getOrCreateDeviceIdentity, type DeviceIdentity } from "./deviceIdentity";
import {
  MANIFEST_NAME,
  downloadAppDataFileText,
  listAppDataFiles,
  uploadAppDataFile,
  upsertJsonAppDataFile,
  type DriveFile,
} from "./googleDriveClient";
import { getRawSetting, setRawSetting } from "./syncSettings";

export type CloudBackupManifestEntry = {
  id: string;
  createdAt: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
  backupVersion: number;
  backupType: "google-drive-appdata";
  packageFileId: string;
  packageFileName: string;
  size: number;
  checksum: string;
};

export type CloudBackupManifest = {
  appName: "Lumo Notes";
  manifestVersion: 1;
  updatedAt: string;
  backups: CloudBackupManifestEntry[];
};

type CloudBackupPackage = {
  metadata: {
    appName: "Lumo Notes";
    backupVersion: 1;
    createdAt: string;
    deviceId: string;
    deviceName: string;
    appVersion: string;
    backupType: "google-drive-appdata";
  };
  backup: LumoBackup;
  settings?: Pick<AppSettings, "backupIncludeTrash" | "markdownExportFrontmatter" | "defaultExportAction">;
};

const LAST_BACKUP_KEY = "sync.googleDriveLastBackupAt";
const LAST_RESTORE_KEY = "sync.googleDriveLastRestoreAt";

function timestampForFilename(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");
}

function packageId(createdAt: string, deviceId: string) {
  return `backup-${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}-${deviceId}`;
}

function packageFilename(createdAt: string, deviceId: string) {
  return `lumo-backup-${timestampForFilename(new Date(createdAt))}-${deviceId}.json.enc`;
}

async function loadManifestFromDrive(): Promise<CloudBackupManifest> {
  const files = await listAppDataFiles(`name='${MANIFEST_NAME}' and trashed=false`);
  if (!files[0]) {
    return { appName: "Lumo Notes", manifestVersion: 1, updatedAt: new Date().toISOString(), backups: [] };
  }
  const text = await downloadAppDataFileText(files[0].id);
  const manifest = JSON.parse(text) as CloudBackupManifest;
  if (manifest.appName !== "Lumo Notes" || manifest.manifestVersion !== 1 || !Array.isArray(manifest.backups)) {
    throw new Error("Lumo Drive backup manifest is not supported.");
  }
  return manifest;
}

export async function getCloudBackupStatus() {
  const [lastBackupAt, lastRestoreAt] = await Promise.all([
    getRawSetting<string | null>(LAST_BACKUP_KEY),
    getRawSetting<string | null>(LAST_RESTORE_KEY),
  ]);
  return { lastBackupAt, lastRestoreAt };
}

export async function listCloudBackups() {
  try {
    const manifest = await loadManifestFromDrive();
    return manifest.backups.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch {
    const files = await listAppDataFiles(`name contains 'lumo-backup-' and trashed=false`);
    return files.map(fileToEntryFallback).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
}

function fileToEntryFallback(file: DriveFile): CloudBackupManifestEntry {
  return {
    id: file.id,
    createdAt: file.modifiedTime ?? new Date().toISOString(),
    deviceId: "unknown-device",
    deviceName: "Unknown device",
    appVersion: "Unknown",
    backupVersion: 1,
    backupType: "google-drive-appdata",
    packageFileId: file.id,
    packageFileName: file.name,
    size: Number(file.size ?? 0),
    checksum: "",
  };
}

export async function uploadEncryptedCloudBackup(input: {
  appVersion: string;
  folders: Folder[];
  notes: Note[];
  tags: string[];
  settings: AppSettings;
  password: string;
}) {
  const [device, attachments, lockMetadata] = await Promise.all([
    getOrCreateDeviceIdentity(),
    getAttachmentBackupPayloads(),
    getLockBackupMetadata(),
  ]);
  const createdAt = new Date().toISOString();
  const backup = createBackup(
    input.notes,
    input.folders,
    input.tags,
    input.settings.backupIncludeTrash,
    attachments as AttachmentBackupPayload[],
    lockMetadata,
  );
  const cloudPackage: CloudBackupPackage = {
    metadata: {
      appName: "Lumo Notes",
      backupVersion: 1,
      createdAt,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      appVersion: input.appVersion || "Unknown",
      backupType: "google-drive-appdata",
    },
    backup,
    settings: {
      backupIncludeTrash: input.settings.backupIncludeTrash,
      markdownExportFrontmatter: input.settings.markdownExportFrontmatter,
      defaultExportAction: input.settings.defaultExportAction,
    },
  };
  const encrypted = await encryptCloudBackup(input.password, JSON.stringify(cloudPackage));
  const filename = packageFilename(createdAt, device.deviceId);
  const body = new Blob([JSON.stringify(encrypted)], { type: "application/json" });
  const uploaded = await uploadAppDataFile(filename, body, "application/json");
  const manifest = await loadManifestFromDrive().catch(
    () =>
      ({
        appName: "Lumo Notes",
        manifestVersion: 1,
        updatedAt: createdAt,
        backups: [],
      }) satisfies CloudBackupManifest,
  );
  const entry: CloudBackupManifestEntry = {
    id: packageId(createdAt, device.deviceId),
    createdAt,
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    appVersion: input.appVersion || "Unknown",
    backupVersion: 1,
    backupType: "google-drive-appdata",
    packageFileId: uploaded.id,
    packageFileName: filename,
    size: body.size,
    checksum: encrypted.checksum,
  };
  await upsertJsonAppDataFile(MANIFEST_NAME, {
    ...manifest,
    updatedAt: new Date().toISOString(),
    backups: [entry, ...manifest.backups.filter((item) => item.id !== entry.id)],
  } satisfies CloudBackupManifest);
  await setRawSetting(LAST_BACKUP_KEY, createdAt);
  return entry;
}

export async function downloadAndDecryptCloudBackup(entry: CloudBackupManifestEntry, password: string) {
  const text = await downloadAppDataFileText(entry.packageFileId);
  let encrypted: EncryptedCloudBackup;
  try {
    encrypted = JSON.parse(text) as EncryptedCloudBackup;
  } catch {
    throw new Error(`Downloaded backup file is not valid JSON (${entry.packageFileName}).`);
  }
  if (
    encrypted.format !== "lumo-cloud-backup-v1" ||
    !encrypted.salt ||
    !encrypted.nonce ||
    !encrypted.ciphertextBase64 ||
    !encrypted.checksum
  ) {
    throw new Error(`Downloaded backup file is not a supported encrypted Lumo package (${entry.packageFileName}).`);
  }
  const plaintext = await decryptCloudBackup(password, encrypted);
  let cloudPackage: CloudBackupPackage;
  try {
    cloudPackage = JSON.parse(plaintext) as CloudBackupPackage;
  } catch {
    throw new Error(`Decrypted backup package is not valid JSON (${entry.packageFileName}).`);
  }
  if (
    cloudPackage.metadata?.appName !== "Lumo Notes" ||
    cloudPackage.metadata?.backupVersion !== 1 ||
    cloudPackage.metadata?.backupType !== "google-drive-appdata"
  ) {
    throw new Error("This is not a supported Lumo Drive backup.");
  }
  return validateBackup(cloudPackage.backup);
}

export async function markCloudRestoreComplete() {
  await setRawSetting(LAST_RESTORE_KEY, new Date().toISOString());
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Unknown size";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
