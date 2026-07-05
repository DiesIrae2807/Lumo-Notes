import type { Attachment, Folder, Note } from "../types/note";
import type { AppSettings } from "../types/settings";
import {
  createBackup,
  validateBackup,
  type LumoBackup,
} from "../services/fileTransfer";
import {
  getAttachmentBackupPayloads,
  listSyncConflicts,
  markSyncConflictResolutionSynced,
  type AttachmentBackupPayload,
} from "../services/database";
import {
  decryptCloudBackup,
  encryptCloudBackup,
  type EncryptedCloudBackup,
} from "./backupEncryption";
import { getOrCreateDeviceIdentity } from "./deviceIdentity";
import {
  downloadAppDataFileText,
  listAppDataFiles,
  uploadAppDataFile,
  upsertJsonAppDataFile,
} from "./googleDriveClient";
import { getRawSetting, setRawSetting } from "./syncSettings";

export const SYNC_MANIFEST_NAME = "lumo-sync-manifest.json";
const LAST_SYNC_KEY = "sync.googleDriveLastSyncAt";
const SEEN_CHANGE_IDS_KEY = "sync.googleDriveSeenChangeIds";
const CONFLICT_COUNT_KEY = "sync.googleDriveConflictCount";

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error" | "conflict";

export type SyncEntityType = "note" | "folder" | "tag" | "note_tag" | "attachment" | "conflict_resolution";
export type SyncOperation = "upsert" | "delete";

export type SyncChangeRecord = {
  schemaVersion: 1;
  changeId: string;
  deviceId: string;
  deviceName: string;
  createdAt: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: unknown;
};

export type SyncConflictResolutionPayload = {
  conflictId: string;
  originalNoteId: string;
  sourceRemoteChangeId: string;
  selectedResolution: "keep_local" | "keep_remote" | "keep_both";
  resultingNoteId?: string | null;
  resolvingDeviceId: string;
  resolvedAt: string;
  finalNotePayload?: LumoBackup | null;
};

type SyncManifestEntry = {
  changeId: string;
  createdAt: string;
  deviceId: string;
  deviceName: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  fileId: string;
  fileName: string;
};

type SyncManifest = {
  appName: "Lumo Notes";
  manifestVersion: 1;
  updatedAt: string;
  changes: SyncManifestEntry[];
};

export type SyncRuntimeState = {
  lastSyncAt: string | null;
  pendingLocalChanges: number;
  status: SyncStatus;
  conflicts: number;
};

export type SyncRunSummary = {
  uploaded: number;
  downloaded: number;
  applied: number;
  skipped: number;
  conflicts: number;
};

export type ApplyRemoteChange = (record: SyncChangeRecord) => Promise<"applied" | "skipped" | "conflict">;

function isoMin() {
  return "1970-01-01T00:00:00.000Z";
}

function filenameSafe(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function changeFileName(record: SyncChangeRecord) {
  return `changes/lumo-sync-change-${filenameSafe(record.changeId)}.json.enc`;
}

function changeId(entityType: SyncEntityType, entityId: string, updatedAt: string, deviceId: string) {
  return `${entityType}-${filenameSafe(entityId)}-${updatedAt.replace(/[^0-9]/g, "")}-${deviceId}`;
}

async function fingerprint(value: unknown) {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function loadSyncManifest(): Promise<SyncManifest> {
  const files = await listAppDataFiles(`name='${SYNC_MANIFEST_NAME}' and trashed=false`);
  if (!files[0]) {
    return { appName: "Lumo Notes", manifestVersion: 1, updatedAt: new Date().toISOString(), changes: [] };
  }
  const text = await downloadAppDataFileText(files[0].id);
  const manifest = JSON.parse(text) as SyncManifest;
  if (manifest.appName !== "Lumo Notes" || manifest.manifestVersion !== 1 || !Array.isArray(manifest.changes)) {
    throw new Error("Lumo Drive sync manifest is not supported.");
  }
  return manifest;
}

async function seenChangeIds() {
  return new Set((await getRawSetting<string[]>(SEEN_CHANGE_IDS_KEY)) ?? []);
}

async function saveSeenChangeIds(ids: Set<string>) {
  await setRawSetting(SEEN_CHANGE_IDS_KEY, Array.from(ids).slice(-2000));
}

function noteUpdatedAfter(note: Note, since: string) {
  return Date.parse(note.updatedAt) > Date.parse(since);
}

function attachmentCreatedAfter(attachment: AttachmentBackupPayload, since: string) {
  return Date.parse(attachment.createdAt) > Date.parse(since);
}

export async function getCloudSyncState(input: {
  notes: Note[];
  folders: Folder[];
  tags: string[];
  attachments: Attachment[];
}) {
  const lastSyncAt = await getRawSetting<string | null>(LAST_SYNC_KEY);
  const since = lastSyncAt ?? isoMin();
  const pendingLocalChanges =
    input.notes.filter((note) => noteUpdatedAfter(note, since)).length +
    input.attachments.filter((attachment) => Date.parse(attachment.createdAt) > Date.parse(since)).length;
  const conflicts = (await listSyncConflicts({ status: "unresolved" })).length;
  return {
    conflicts,
    lastSyncAt,
    pendingLocalChanges,
    status: conflicts > 0 ? "conflict" : pendingLocalChanges > 0 ? "idle" : "synced",
  } satisfies SyncRuntimeState;
}

async function buildLocalChangeRecords(input: {
  notes: Note[];
  folders: Folder[];
  tags: string[];
  settings: AppSettings;
  since: string;
}) {
  const [device, attachmentPayloads] = await Promise.all([
    getOrCreateDeviceIdentity(),
    getAttachmentBackupPayloads(),
  ]);
  const now = new Date().toISOString();
  const changes: SyncChangeRecord[] = [];
  const changedNotes = input.notes.filter((note) => noteUpdatedAfter(note, input.since));
  const changedNoteIds = new Set(changedNotes.map((note) => note.id));
  const changedAttachments = attachmentPayloads.filter(
    (attachment) => attachmentCreatedAfter(attachment, input.since) || changedNoteIds.has(attachment.noteId),
  );

  for (const note of changedNotes) {
    const backup = createBackup(
      [note],
      input.folders.filter((folder) => folder.id === note.folderId),
      note.tags,
      true,
      changedAttachments.filter((attachment) => attachment.noteId === note.id),
      null,
    );
    changes.push({
      changeId: changeId("note", note.id, note.updatedAt, device.deviceId),
      createdAt: note.updatedAt || now,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      entityId: note.id,
      entityType: "note",
      operation: note.isDeleted ? "delete" : "upsert",
      payload: backup,
      schemaVersion: 1,
    });
  }

  for (const folder of input.folders) {
    const stamp = await fingerprint(folder);
    changes.push({
      changeId: changeId("folder", folder.id, stamp, device.deviceId),
      createdAt: now,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      entityId: folder.id,
      entityType: "folder",
      operation: "upsert",
      payload: {
        metadata: {
          appName: "Lumo Notes",
          backupVersion: 1,
          exportedAt: now,
        },
        notes: [],
        folders: [folder],
        tags: [],
        noteTags: [],
        attachments: [],
        lockMetadata: null,
      } satisfies LumoBackup,
      schemaVersion: 1,
    });
  }

  for (const tag of input.tags) {
    const stamp = await fingerprint(tag);
    changes.push({
      changeId: changeId("tag", tag, stamp, device.deviceId),
      createdAt: now,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      entityId: tag,
      entityType: "tag",
      operation: "upsert",
      payload: {
        metadata: {
          appName: "Lumo Notes",
          backupVersion: 1,
          exportedAt: now,
        },
        notes: [],
        folders: [],
        tags: [tag],
        noteTags: [],
        attachments: [],
        lockMetadata: null,
      } satisfies LumoBackup,
      schemaVersion: 1,
    });
  }

  for (const attachment of changedAttachments) {
    changes.push({
      changeId: changeId("attachment", attachment.id, attachment.createdAt, device.deviceId),
      createdAt: attachment.createdAt || now,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      entityId: attachment.id,
      entityType: "attachment",
      operation: "upsert",
      payload: attachment,
      schemaVersion: 1,
    });
  }

  const resolvedConflicts = await listSyncConflicts({ unsyncedResolutionsOnly: true });
  for (const conflict of resolvedConflicts) {
    if (!conflict.resolution || !conflict.resolvedAt) continue;
    let finalNotePayload: LumoBackup | null = null;
    if (conflict.resolution === "keep_local") {
      finalNotePayload = validateBackup(JSON.parse(conflict.localPayload));
    } else if (conflict.resolution === "keep_remote") {
      finalNotePayload = validateBackup(JSON.parse(conflict.remotePayload));
    } else if (conflict.resolution === "keep_both" && conflict.resultEntityId) {
      const resultNote = input.notes.find((note) => note.id === conflict.resultEntityId);
      if (resultNote) {
        finalNotePayload = createBackup(
          [resultNote],
          input.folders.filter((folder) => folder.id === resultNote.folderId),
          resultNote.tags,
          true,
          attachmentPayloads.filter((attachment) => attachment.noteId === resultNote.id),
          null,
        );
      }
    }
    changes.push({
      changeId: changeId("conflict_resolution", conflict.id, conflict.resolvedAt, device.deviceId),
      createdAt: conflict.resolvedAt,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      entityId: conflict.id,
      entityType: "conflict_resolution",
      operation: "upsert",
      payload: {
        conflictId: conflict.id,
        finalNotePayload,
        originalNoteId: conflict.entityId,
        resolvingDeviceId: device.deviceId,
        resolvedAt: conflict.resolvedAt,
        resultingNoteId: conflict.resultEntityId ?? null,
        selectedResolution: conflict.resolution,
        sourceRemoteChangeId: conflict.remoteChangeId,
      } satisfies SyncConflictResolutionPayload,
      schemaVersion: 1,
    });
  }

  return changes;
}

async function uploadChangeRecord(record: SyncChangeRecord, password: string) {
  const encrypted = await encryptCloudBackup(password, JSON.stringify(record));
  const body = new Blob([JSON.stringify(encrypted)], { type: "application/json" });
  const uploaded = await uploadAppDataFile(changeFileName(record), body, "application/json");
  return {
    changeId: record.changeId,
    createdAt: record.createdAt,
    deviceId: record.deviceId,
    deviceName: record.deviceName,
    entityId: record.entityId,
    entityType: record.entityType,
    fileId: uploaded.id,
    fileName: uploaded.name,
    operation: record.operation,
  } satisfies SyncManifestEntry;
}

async function decryptRemoteChange(entry: SyncManifestEntry, password: string) {
  const text = await downloadAppDataFileText(entry.fileId);
  const encrypted = JSON.parse(text) as EncryptedCloudBackup;
  const plaintext = await decryptCloudBackup(password, encrypted);
  const record = JSON.parse(plaintext) as SyncChangeRecord;
  if (record.schemaVersion !== 1 || !record.changeId || !record.entityType || !record.operation) {
    throw new Error(`Unsupported sync change record: ${entry.changeId}`);
  }
  return record;
}

export function syncChangeToBackup(record: SyncChangeRecord): LumoBackup | null {
  if (record.entityType === "note" || record.entityType === "folder" || record.entityType === "tag") {
    return validateBackup(record.payload);
  }
  if (record.entityType === "attachment") {
    const attachment = record.payload as AttachmentBackupPayload;
    return validateBackup({
      metadata: {
        appName: "Lumo Notes",
        backupVersion: 1,
        exportedAt: record.createdAt,
      },
      notes: [],
      folders: [],
      tags: [],
      noteTags: [],
      attachments: [attachment],
      lockMetadata: null,
    });
  }
  return null;
}

export async function runGoogleDriveSync(input: {
  notes: Note[];
  folders: Folder[];
  tags: string[];
  attachments: Attachment[];
  settings: AppSettings;
  password: string;
  applyRemoteChange: ApplyRemoteChange;
}) {
  const device = await getOrCreateDeviceIdentity();
  const lastSyncAt = (await getRawSetting<string | null>(LAST_SYNC_KEY)) ?? isoMin();
  const seen = await seenChangeIds();
  const manifest = await loadSyncManifest();
  const localChanges = await buildLocalChangeRecords({ ...input, since: lastSyncAt });
  const existingChangeIds = new Set(manifest.changes.map((entry) => entry.changeId));
  const entriesToAdd: SyncManifestEntry[] = [];

  for (const record of localChanges) {
    if (existingChangeIds.has(record.changeId)) {
      if (record.entityType === "conflict_resolution") {
        await markSyncConflictResolutionSynced(record.entityId, new Date().toISOString());
      }
      continue;
    }
    const entry = await uploadChangeRecord(record, input.password);
    entriesToAdd.push(entry);
    seen.add(record.changeId);
    if (record.entityType === "conflict_resolution") {
      await markSyncConflictResolutionSynced(record.entityId, new Date().toISOString());
    }
  }

  const nextManifest = {
    ...manifest,
    updatedAt: new Date().toISOString(),
    changes: [...entriesToAdd, ...manifest.changes].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
  } satisfies SyncManifest;
  if (entriesToAdd.length > 0) {
    await upsertJsonAppDataFile(SYNC_MANIFEST_NAME, nextManifest);
  }

  const remoteEntries = nextManifest.changes.filter(
    (entry) => entry.deviceId !== device.deviceId && !seen.has(entry.changeId),
  );
  const summary: SyncRunSummary = { applied: 0, conflicts: 0, downloaded: 0, skipped: 0, uploaded: entriesToAdd.length };

  for (const entry of remoteEntries) {
    summary.downloaded += 1;
    const record = await decryptRemoteChange(entry, input.password);
    const result = await input.applyRemoteChange(record);
    seen.add(entry.changeId);
    if (result === "applied") summary.applied += 1;
    else if (result === "conflict") summary.conflicts += 1;
    else summary.skipped += 1;
  }

  const syncedAt = new Date().toISOString();
  await Promise.all([
    setRawSetting(LAST_SYNC_KEY, syncedAt),
    setRawSetting(CONFLICT_COUNT_KEY, summary.conflicts),
    saveSeenChangeIds(seen),
  ]);
  return { ...summary, syncedAt };
}
