# Lumo Sync Contract

This document describes the current desktop implementation as inspected in `src/sync`, `src/store`, `src/services`, and `src-tauri/src/db.rs`. It is a contract for interoperating with the existing app, not a design for future behavior.

## Storage Overview

The desktop app stores local data in SQLite at the Tauri app data path as `lumo-notes.db`. The schema is created and migrated in `src-tauri/src/db.rs`.

The active synchronization protocol uses Google Drive `appDataFolder`:

- `lumo-sync-manifest.json` is a plaintext JSON manifest for incremental sync changes.
- Each incremental change is a separate encrypted JSON file named `changes/lumo-sync-change-{changeId}.json.enc`.
- Full encrypted backups use a separate manifest, `lumo-backup-manifest.json`, and package files named `lumo-backup-{yyyyMMddTHHmmss}-{deviceId}.json.enc`.

The app does not use a remote SQL database, Google Drive changes API cursor, vector clocks, or server-side revisions.

## Timestamps

Most frontend-created timestamps are JavaScript `new Date().toISOString()`: UTC ISO 8601 strings with millisecond precision, for example `2026-07-05T12:34:56.789Z`.

Some Rust-created timestamps are not ISO 8601:

- `chrono_like_now()` returns `{unixEpochMilliseconds}Z`, for example `1783254896789Z`.
- `now_iso()` returns just `{unixEpochMilliseconds}`, with no `Z`.

These are used for some lock metadata, lock events, attachment IDs, and device identity creation. Sync comparisons call `Date.parse(...)`; Android should preserve received timestamp strings exactly and should prefer ISO 8601 UTC milliseconds for new cross-platform records. Behavior for non-ISO millisecond strings in `Date.parse` is JavaScript-specific and should be treated as inconsistent desktop behavior.

## Local Entities

### Notes

Local table: `notes`. Sync entity type: `note`.

Identifier format:

- Desktop-created notes use `note-${crypto.randomUUID()}`.
- Conflict duplicates use `note-conflict-${crypto.randomUUID()}`.
- Imported/restored notes keep the incoming ID.

Fields serialized in TypeScript as camelCase:

| Field | Type | Nullability/default |
| --- | --- | --- |
| `id` | string | non-null primary key |
| `title` | string | non-null, default `"Untitled Note"` for UI creation |
| `content` | string | non-null, `""`; blanked when locked in normal reads/backups |
| `preview` | string | non-null, `""`; blanked when locked in normal reads/backups |
| `folderId` | string | non-null, default `uncategorized` |
| `folderName` | string | non-null, default `Uncategorized` |
| `tags` | string[] | non-null, default `[]`; derived from `note_tags` |
| `isPinned` | boolean | non-null, default `false` |
| `isFavorite` | boolean | non-null, default `false` |
| `isDeleted` | boolean | non-null, default `false` |
| `isArchived` | boolean | non-null, default `false` |
| `isLocked` | boolean | non-null, default `false` |
| `isUnlocked` | boolean | UI-only optional, not stored or synced |
| `encryptedContent` | string \| null | nullable |
| `encryptedPreview` | string \| null | nullable |
| `encryptionNonce` | string \| null | nullable; locked notes store `contentNonce:previewNonce` |
| `lockedAt` | string \| null | nullable |
| `createdAt` | string | non-null |
| `updatedAt` | string | non-null |

Create/update/delete behavior:

- Create inserts a row and note-tag relationships.
- Text/title edits update `updatedAt`.
- Pin/favorite/archive/folder/tag changes update `updatedAt`; archiving and soft deletion also clear `isPinned`.
- Soft delete sets `isDeleted=true`, clears `isPinned`, and updates `updatedAt`.
- Restore sets `isDeleted=false` and updates `updatedAt`.
- Permanent delete physically deletes the note only if `isDeleted=true`, deletes note tags and attachments, and removes attachment files. It does not create or upload a tombstone.
- Restore from sync/backup updates an existing note only if incoming `updatedAt` is lexicographically greater than the stored value; otherwise tags are still replaced and the note is reported as skipped.

Deletion sync:

- Soft-deleted notes are synchronized as a `note` change with `operation: "delete"` and a payload containing the note backup.
- Applying remote changes does not branch on `operation`; it restores/merges the backup payload. The deletion effect comes from `isDeleted=true` inside the note.
- Permanent deletion is not synchronized because the note no longer appears in local `notes` and no tombstone writer exists.

### Folders

Local table: `folders`. Sync entity type: `folder`.

Identifier format:

- `uncategorized` is the built-in folder.
- User-created folders prefer `slugify(name)` using lowercase alphanumerics and hyphens.
- If an imported/restored folder ID collides during merge, a new `folder-${crypto.randomUUID()}` may be generated.

Fields:

| Field | Type | Nullability/default |
| --- | --- | --- |
| `id` | string | non-null primary key |
| `name` | string | non-null |
| `colorClass` | string | non-null; stored as DB column `color` |

The database also stores `created_at` and `updated_at`, but `FolderDto` and sync payloads do not serialize those fields.

Behavior:

- Create uses `INSERT OR IGNORE`.
- Rename/color update changes folder row and denormalized `folderName` on all notes in that folder; affected notes get the same `updatedAt`.
- Delete physically removes the folder, ensures `uncategorized` exists, and moves affected notes to `uncategorized` with an updated `updatedAt`.
- Folder deletions are not directly synchronized as deletes. A deleted folder simply stops producing folder records; affected note changes may synchronize their new folder.

### Tags and Note Tags

Local tables: `tags`, `note_tags`. Sync entity types: `tag`; `note_tag` exists in the TypeScript union but no active code creates `note_tag` change records.

Identifier format:

- Tag row `id` is `trim(name).toLowerCase()`.
- Serialized standalone tags are strings.
- Note-tag relationships in backups are objects: `{ "noteId": string, "tag": string }`.

Tag fields in DB:

| Field | Type | Nullability/default |
| --- | --- | --- |
| `id` | string | non-null primary key, lowercase name |
| `name` | string | non-null unique |
| `created_at` | string | non-null, not serialized as tag |
| `updated_at` | string | non-null, not serialized as tag |

Behavior:

- Creating a tag inserts `id`, `name`, `created_at`, and `updated_at`.
- Adding a tag to a note inserts the tag if needed, inserts `note_tags`, and updates the note `updatedAt`.
- Removing a tag from a note deletes the relationship and updates the note `updatedAt`.
- Renaming a tag changes `tags.name` but not `tags.id`; affected notes are updated in React state and search index, but local DB note rows do not get an `updated_at` update except through UI state. Sync of note tag renames therefore depends on current in-memory notes or standalone tag records.
- Deleting a tag physically deletes relationships and the tag row. There is no synced tag tombstone.

### Attachments

Local table: `attachments`. Sync entity type: `attachment`.

Identifier format:

- Desktop-created attachment IDs are `attachment-${unixEpochMilliseconds}`.
- Conflict cloned attachment IDs are `attachment-conflict-${crypto.randomUUID()}`.

Fields:

| Field | Type | Nullability/default |
| --- | --- | --- |
| `id` | string | non-null primary key |
| `noteId` | string | non-null foreign key |
| `filename` | string | non-null, sanitized and max 90 chars |
| `originalPath` | string \| null | nullable; set locally on attach, restored attachments use null |
| `storedPath` | string | non-null local filesystem path |
| `mimeType` | string | non-null; extension-based |
| `fileSize` | number | non-null integer byte count |
| `isEncrypted` | boolean | non-null, default false |
| `encryptionNonce` | string \| null | nullable |
| `encryptedAt` | string \| null | nullable |
| `createdAt` | string | non-null |
| `dataBase64` | string | only in backup/sync attachment payloads |

File naming:

- Plain attachments are stored as `{id}-{filename}` under the app data `attachments` directory.
- Encrypted attachments are stored as `{id}-{filename}.lumoenc`.
- Decrypted temporary files are written under the app cache `decrypted-attachments` directory as `{id}-{filename}` and are cleaned on app initialization or lock-all.

Behavior:

- Attachments can be added only to active, non-deleted notes.
- Adding an attachment to a locked note encrypts file bytes immediately.
- Removing an attachment physically deletes the DB row, stored file, and cached decrypted file. There is no attachment tombstone or delete sync record.
- Attachment sync uploads attachments created after the last sync, plus attachments for notes changed after the last sync.
- Applying attachment sync restores attachment files from `dataBase64` if the note exists. Existing attachment IDs are skipped if the file exists, or file data is restored if the DB row exists but file is missing.

### Settings

Local table: `app_settings`. Incremental sync does not currently upload app settings as first-class sync entities, even though `settings` is passed into `runGoogleDriveSync`.

Fields:

| Field | Type | Nullability/default |
| --- | --- | --- |
| `key` | string | non-null primary key |
| `value` | string | non-null JSON string |
| `updatedAt` | string | non-null |

Known app settings are defined by `AppSettings`:

- `theme`: `"dark" | "light" | "system"`, default `"dark"`
- `accent`: `"teal" | "blue" | "green" | "rose" | "amber" | "indigo" | "custom"`, default `"teal"`
- `customAccentPrimary`: string hex, default `"#9c7cf4"`
- `customAccentSecondary`: string hex, default `"#59d5ca"`
- `customThemeDark`, `customThemeLight`: objects with `appBg`, `workspaceBg`, `sidebarBg`, `panelBg`, `cardBg`, `textPrimary`, `textSecondary`, `border`
- `defaultEditorMode`: `"edit" | "preview" | "split"`, default `"edit"`
- `editorFontSize`: `"small" | "medium" | "large"`, default `"medium"`
- `editorLineHeight`: `"compact" | "comfortable" | "spacious"`, default `"comfortable"`
- `autosaveDelay`: `"fast" | "normal" | "relaxed"`, default `"normal"`
- `startupBehavior`: `"lastNote" | "allNotes"`, default `"lastNote"`
- `confirmPermanentDelete`: boolean, default true
- `newNoteTitleBehavior`: `"untitled" | "dateTime" | "firstLine"`, default `"untitled"`
- `markdownExportFrontmatter`: boolean, default true
- `backupIncludeTrash`: boolean, default true
- `defaultExportAction`: `"markdownSelected" | "jsonBackup"`, default `"markdownSelected"`
- `profileName`: string, default `"Hamza"`
- `profileImageDataUrl`: string, default `""`

Sync-related settings keys are also stored here:

- `sync.deviceId`, `sync.deviceName`, `sync.deviceCreatedAt`
- `sync.googleDriveSession`
- `sync.cloudBackupPassword`
- `sync.googleDriveLastSyncAt`
- `sync.googleDriveSeenChangeIds`
- `sync.googleDriveConflictCount`
- `sync.googleDriveLastBackupAt`
- `sync.googleDriveLastRestoreAt`
- Lock keys: `lock.salt`, `lock.verifier`, `lock.kdf`, `lock.kdfParams`, `lock.algorithm`

Full cloud backups include only `backupIncludeTrash`, `markdownExportFrontmatter`, and `defaultExportAction` in the package metadata, but restore currently returns only the `backup` object and does not apply those package settings.

### Devices

Device identity is stored as app settings, not a table.

Fields:

| Field | Type | Nullability/default |
| --- | --- | --- |
| `deviceId` | string | non-null; `device-${randomBase64(18) without / + =}` |
| `deviceName` | string | non-null; `"Windows PC"`, `"Mac"`, `"Linux PC"`, or `"Lumo device"` |
| `createdAt` | string | non-null; currently unix milliseconds string from Rust |

`deviceId` and `deviceName` are copied into every sync change record and manifest entry.

### Tombstones

Local table: `sync_tombstones`.

Fields:

| Field | Type | Nullability/default |
| --- | --- | --- |
| `entity_type` | string | non-null, part of primary key |
| `entity_id` | string | non-null, part of primary key |
| `operation` | string | non-null |
| `deleted_at` | string | non-null |
| `device_id` | string \| null | nullable |
| `payload` | string \| null | nullable |

No code currently writes, reads, or uploads this table. It is schema-only/dormant. Android should not rely on tombstones being produced by desktop.

### Sync Cursors and Revisions

There is no server cursor or per-entity remote revision.

Tracked local sync state:

- `sync.googleDriveLastSyncAt`: JSON string or null. Used as the local cutoff for outgoing note and attachment changes.
- `sync.googleDriveSeenChangeIds`: JSON array of strings, capped to the last 2000 entries. Used to avoid reapplying remote changes already seen locally.
- `sync.googleDriveConflictCount`: JSON number. Informational.

Dormant schema columns are added to `notes`, `folders`, `tags`, and `attachments`:

- `sync_status TEXT NOT NULL DEFAULT 'pending'`
- `local_version INTEGER NOT NULL DEFAULT 0`
- `last_synced_at TEXT`
- `device_id TEXT`
- `deleted_at TEXT`

No active code reads or writes these columns after migration.

### Conflicts

Local table: `sync_conflicts`. Sync entity type for resolution propagation: `conflict_resolution`.

Fields:

| Field | Type | Nullability/default |
| --- | --- | --- |
| `id` | string | non-null primary key; desktop uses `sync-conflict-${remoteChangeId}` |
| `entityType` | string | non-null; currently only note conflicts are created |
| `entityId` | string | non-null |
| `localPayload` | string | non-null JSON string containing `LumoBackup` |
| `remotePayload` | string | non-null JSON string containing `LumoBackup` |
| `localDeviceId` | string \| null | nullable |
| `remoteDeviceId` | string \| null | nullable |
| `remoteChangeId` | string | non-null unique |
| `detectedAt` | string | non-null |
| `status` | `"unresolved" | "resolved"` | non-null |
| `resolution` | `"keep_local" | "keep_remote" | "keep_both" | null` | nullable |
| `resolvedAt` | string \| null | nullable |
| `resultEntityId` | string \| null | nullable |
| `resolutionSyncedAt` | string \| null | nullable |

Conflict detection:

- Before sync, the UI records note IDs whose `updatedAt` is greater than `lastSyncAt`.
- When a remote note change arrives, a conflict is created only if the same note ID was dirty at sync start and the comparable local and incoming note payloads differ.
- Comparable note fields are title, content/preview unless locked, folder ID/name, sorted tags, booleans, encrypted fields, nonce, and `lockedAt`.
- Folder, tag, attachment, setting, and deletion conflicts are not detected.

Conflict resolution:

- `keep_local` marks the conflict resolved but does not immediately modify the local note.
- `keep_remote` replaces or inserts the local note from the remote payload and restores remote attachments.
- `keep_both` clones the remote note to `note-conflict-${uuid}`, clones remote attachments to `attachment-conflict-${uuid}`, rewrites `attachment://` references, and restores the cloned note.
- Resolved conflicts with `resolutionSyncedAt IS NULL` are uploaded as `conflict_resolution` change records.
- Applying a remote `conflict_resolution` applies `finalNotePayload` when present, then attempts to mark the local conflict resolved. If the conflict row does not exist locally, the error is ignored.

## Serialized Sync Format

### Manifest

`lumo-sync-manifest.json`:

```json
{
  "appName": "Lumo Notes",
  "manifestVersion": 1,
  "updatedAt": "2026-07-05T12:34:56.789Z",
  "changes": [
    {
      "changeId": "note-note-...-20260705123456789-device-...",
      "createdAt": "2026-07-05T12:34:56.789Z",
      "deviceId": "device-...",
      "deviceName": "Linux PC",
      "entityType": "note",
      "entityId": "note-...",
      "operation": "upsert",
      "fileId": "google-drive-file-id",
      "fileName": "changes/lumo-sync-change-note-note-...json.enc"
    }
  ]
}
```

Entries are sorted ascending by `createdAt` when written. The manifest is not encrypted.

### Change Record

The plaintext encrypted inside each change file:

```json
{
  "schemaVersion": 1,
  "changeId": "note-note-...-20260705123456789-device-...",
  "deviceId": "device-...",
  "deviceName": "Linux PC",
  "createdAt": "2026-07-05T12:34:56.789Z",
  "entityType": "note",
  "entityId": "note-...",
  "operation": "upsert",
  "payload": {}
}
```

Allowed `entityType` values in code are `"note"`, `"folder"`, `"tag"`, `"note_tag"`, `"attachment"`, and `"conflict_resolution"`. Active upload code creates all except `"note_tag"`.

Allowed `operation` values are `"upsert"` and `"delete"`. Active code uses `"delete"` only for soft-deleted notes.

`changeId` format is:

```text
{entityType}-{filenameSafe(entityId)}-{stamp with non-digits removed}-{deviceId}
```

For notes, `stamp` is `note.updatedAt`. For attachments, it is `attachment.createdAt`. For folders and tags, it is the first 16 hex chars of a SHA-256 fingerprint of `JSON.stringify(value)`, but then non-digits are stripped, so letters are discarded. This is an implementation detail and can create weak stamps.

### Backup Payload

Note, folder, and tag sync payloads are `LumoBackup` objects:

```json
{
  "metadata": {
    "appName": "Lumo Notes",
    "backupVersion": 1,
    "exportedAt": "2026-07-05T12:34:56.789Z"
  },
  "notes": [],
  "folders": [],
  "tags": [],
  "noteTags": [],
  "attachments": [],
  "lockMetadata": null
}
```

For a note change, `notes` contains one note, `folders` contains that note's folder, `tags` contains that note's tags, `noteTags` contains that note's tag relationships, and `attachments` contains changed attachments for that note. Locked notes have `content` and `preview` blanked while encrypted fields remain.

For a folder change, `folders` contains one folder and the other entity arrays are empty.

For a tag change, `tags` contains one string and the other entity arrays are empty.

For an attachment change, `payload` is an `AttachmentBackupPayload` directly in the change record, but `syncChangeToBackup` wraps it in a `LumoBackup` before applying.

### Conflict Resolution Payload

```json
{
  "conflictId": "sync-conflict-...",
  "originalNoteId": "note-...",
  "sourceRemoteChangeId": "note-note-...",
  "selectedResolution": "keep_local",
  "resultingNoteId": null,
  "resolvingDeviceId": "device-...",
  "resolvedAt": "2026-07-05T12:34:56.789Z",
  "finalNotePayload": null
}
```

`selectedResolution` may be `"keep_local"`, `"keep_remote"`, or `"keep_both"`. `finalNotePayload` is a `LumoBackup` when the resolving device can provide the final note payload.

### Encrypted Package Wrapper

Every sync change file and full backup file stores JSON of this object:

```json
{
  "format": "lumo-cloud-backup-v1",
  "kdfAlgorithm": "argon2id",
  "kdfParams": "m=19456,t=2,p=1",
  "encryptionAlgorithm": "XChaCha20-Poly1305",
  "salt": "base64-16-random-bytes",
  "passwordVerifier": "base64-sha256-verifier",
  "nonce": "base64-24-random-bytes",
  "ciphertextBase64": "base64-ciphertext-and-tag",
  "checksum": "base64-sha256-ciphertext"
}
```

Encryption details:

- KDF: Argon2id version 0x13, memory 19,456 KiB, iterations 2, parallelism 1, output length 32 bytes.
- Salt: 16 random bytes, base64.
- Cipher: XChaCha20-Poly1305.
- Nonce: 24 random bytes, base64.
- `passwordVerifier`: `base64(SHA-256("lumo-notes-lock-verifier-v1" || key))`.
- `checksum`: `base64(SHA-256(ciphertextBytes))`; checked before decrypt.
- Plaintext is UTF-8 JSON.

The local cloud password metadata stored at `sync.cloudBackupPassword` has `salt`, `verifier`, `kdfAlgorithm`, `kdfParams`, and `encryptionAlgorithm`. Each encrypted sync package still uses a new random salt and nonce.

## Local Note and Attachment Lock Encryption

This is separate from cloud package encryption but its metadata is synchronized through note and attachment payloads.

- Lock metadata is stored in app settings as `lock.salt`, `lock.verifier`, `lock.kdf`, `lock.kdfParams`, and `lock.algorithm`.
- The same Argon2id and XChaCha20-Poly1305 algorithms are used.
- A locked note stores blank plaintext `content` and `preview`, `isLocked=true`, `encryptedContent`, `encryptedPreview`, and `encryptionNonce` as `contentNonce:previewNonce`.
- Unlocking requires an in-memory lock session key derived from the lock password.
- Encrypted attachment files store ciphertext bytes directly at `{id}-{filename}.lumoenc`; their nonce is stored in `attachments.encryption_nonce`.
- Changing the lock password re-encrypts all locked notes and encrypted attachments with a new key and updates metadata. It does not update note `updated_at`.

## Change Detection

Local outgoing changes:

- Notes are uploaded when `Date.parse(note.updatedAt) > Date.parse(lastSyncAt)`.
- Attachments are uploaded when `Date.parse(attachment.createdAt) > Date.parse(lastSyncAt)` or their note changed in the same run.
- Folders and tags are uploaded on every sync run, regardless of `lastSyncAt`, using generated fingerprint-based change IDs to avoid duplicate manifest entries.
- Conflict resolutions are uploaded when `status='resolved'` and `resolutionSyncedAt IS NULL`.

Remote incoming changes:

- The app loads the manifest, filters entries where `entry.deviceId !== localDeviceId` and `changeId` is not in `sync.googleDriveSeenChangeIds`, downloads/decrypts each file, applies it, and records the change ID as seen.
- After a run, `sync.googleDriveLastSyncAt` is set to the run completion time, not the max remote `createdAt`.

## Platform-Neutral Android Contract

An Android implementation that interoperates with current desktop sync should:

- Use the exact Google Drive appData file names and JSON shapes above.
- Preserve all unknown fields in payloads when possible, especially note encryption metadata and attachment metadata.
- Create timestamps as ISO 8601 UTC strings with millisecond precision for cross-platform data.
- Generate note IDs as `note-${UUID}` and device IDs as `device-{URL/file-safe random string}`; exact desktop base64 generation does not need to be duplicated if IDs remain unique and filename-safe.
- Treat note soft deletion as a normal note payload with `isDeleted=true` and `operation:"delete"`.
- Not expect permanent deletes, folder deletes, tag deletes, attachment deletes, tombstones, or settings changes to propagate from desktop.
- Implement the encrypted package wrapper exactly: Argon2id `m=19456,t=2,p=1`, 32-byte key, XChaCha20-Poly1305, 24-byte nonce, base64 fields, SHA-256 ciphertext checksum, and the verifier prefix string `lumo-notes-lock-verifier-v1`.
- Apply remote note changes through the `LumoBackup` merge semantics: add missing notes, update existing notes only when incoming `updatedAt` string is greater than local, and preserve locked-note blank plaintext behavior.
- Track seen change IDs locally and ignore records from the same device ID.
- Detect conflicts at least for dirty same-ID notes using the comparable fields listed above. Other entity conflicts are not currently part of the desktop contract.
- Keep local attachment files in platform-appropriate storage, but serialize `dataBase64`, `filename`, `mimeType`, `fileSize`, encryption fields, and `createdAt` exactly.

## Unclear, Inconsistent, or Not Implemented

- `sync_tombstones` exists but is unused.
- Per-entity `sync_status`, `local_version`, `last_synced_at`, `device_id`, and `deleted_at` columns exist but are unused.
- `note_tag` is listed as a sync entity type but never uploaded.
- App settings are not incrementally synchronized.
- Permanent deletion is local-only and can cause deleted records to remain on other devices.
- Folder, tag, and attachment deletions are not represented as sync deletes.
- Folder and tag sync records are uploaded every run if their generated change IDs are not already in the manifest.
- Folder and tag change IDs use a SHA-256 fingerprint but strip non-digits from the hex stamp, reducing uniqueness.
- Device identity `createdAt`, lock timestamps, and attachment IDs use unix-millisecond strings rather than ISO timestamps.
- Lock password changes do not update note `updatedAt`, so re-encrypted locked notes may not be uploaded unless another note change occurs or a full backup is used.
- Remote manifest updates are read-modify-write without compare-and-swap; concurrent clients can overwrite manifest changes.
- The Google Drive file listing uses page size 100 and does not handle pagination.
- Applying remote records ignores `operation` except insofar as the payload has `isDeleted=true`.
- `restoreBackupMerge` notifies the UI for every applied remote backup, which is desktop-specific behavior and not part of a neutral protocol.
