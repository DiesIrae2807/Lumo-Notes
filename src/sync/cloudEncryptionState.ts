import {
  createCloudBackupPasswordMetadata,
  decryptCloudBackup,
  verifyCloudBackupPassword,
  type CloudBackupPasswordMetadata,
  type EncryptedCloudBackup,
} from "./backupEncryption";
import { downloadAppDataFileText, listAppDataFiles, MANIFEST_NAME, type DriveFile } from "./googleDriveClient";
import { SYNC_MANIFEST_NAME } from "./cloudSync";
import { getRawSetting, setRawSetting } from "./syncSettings";

export const CLOUD_PASSWORD_KEY = "sync.cloudBackupPassword";

export type RemoteCloudStateKind = "empty" | "existingEncrypted" | "unknown";

export type RemoteCloudState = {
  kind: RemoteCloudStateKind;
  encryptedFiles: DriveFile[];
  lumoFiles: DriveFile[];
  verificationFile?: DriveFile | null;
  error?: string;
};

export type CloudEncryptionStatus = "configured" | "notConfigured" | "needsExistingPassword" | "unknown";

export async function getLocalCloudEncryptionMetadata() {
  return getRawSetting<CloudBackupPasswordMetadata | null>(CLOUD_PASSWORD_KEY);
}

function isLumoCloudFile(file: DriveFile) {
  return (
    file.name === MANIFEST_NAME ||
    file.name === SYNC_MANIFEST_NAME ||
    file.name.startsWith("lumo-backup-") ||
    file.name.startsWith("changes/lumo-sync-change-") ||
    file.name.startsWith("devices/")
  );
}

function isEncryptedLumoFile(file: DriveFile) {
  return file.name.endsWith(".enc") && (file.name.startsWith("lumo-backup-") || file.name.startsWith("changes/lumo-sync-change-"));
}

export async function inspectRemoteCloudState(): Promise<RemoteCloudState> {
  try {
    const files = await listAppDataFiles("trashed=false");
    const lumoFiles = files.filter(isLumoCloudFile);
    const encryptedFiles = lumoFiles.filter(isEncryptedLumoFile);
    if (lumoFiles.length === 0) {
      return { encryptedFiles: [], kind: "empty", lumoFiles: [], verificationFile: null };
    }
    return {
      encryptedFiles,
      kind: encryptedFiles.length > 0 ? "existingEncrypted" : "unknown",
      lumoFiles,
      verificationFile: encryptedFiles[0] ?? null,
      error: encryptedFiles.length > 0 ? undefined : "Lumo cloud metadata exists, but no encrypted verification package was found.",
    };
  } catch (error) {
    return {
      encryptedFiles: [],
      kind: "unknown",
      lumoFiles: [],
      verificationFile: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function cloudEncryptionStatus(
  localMetadata: CloudBackupPasswordMetadata | null,
  remoteState: RemoteCloudState | null,
): CloudEncryptionStatus {
  if (localMetadata?.salt && localMetadata.verifier) return "configured";
  if (!remoteState) return "unknown";
  if (remoteState.kind === "existingEncrypted") return "needsExistingPassword";
  if (remoteState.kind === "empty") return "notConfigured";
  return "unknown";
}

export async function saveNewCloudEncryptionPassword(password: string) {
  if (password.length < 8) {
    throw new Error("Use at least 8 characters for the Cloud Encryption Password.");
  }
  const metadata = await createCloudBackupPasswordMetadata(password);
  await setRawSetting(CLOUD_PASSWORD_KEY, metadata);
  return metadata;
}

export async function verifyLocalCloudEncryptionPassword(password: string, metadata: CloudBackupPasswordMetadata) {
  await verifyCloudBackupPassword(password, metadata);
}

export async function verifyRemoteCloudEncryptionPassword(password: string, remoteState: RemoteCloudState) {
  const verificationFile = remoteState.verificationFile;
  if (!verificationFile) {
    throw new Error("Existing Lumo cloud data was found, but no encrypted package is available to verify the password.");
  }
  let encrypted: EncryptedCloudBackup;
  try {
    encrypted = JSON.parse(await downloadAppDataFileText(verificationFile.id)) as EncryptedCloudBackup;
  } catch {
    throw new Error("Could not read the remote encrypted verification package.");
  }
  await decryptCloudBackup(password, encrypted);
  return saveNewCloudEncryptionPassword(password);
}
