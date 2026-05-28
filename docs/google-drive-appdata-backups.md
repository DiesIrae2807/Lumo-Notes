# Google Drive appDataFolder Backup and Sync

Lumo Notes can optionally store encrypted user-owned backups and manual sync change records in Google Drive
`appDataFolder`. Local SQLite remains the source of truth, and Google sign-in is not required to use Lumo
locally.

## Google Cloud setup

1. Create or select a Google Cloud project.
2. Enable the Google Drive API for the project.
3. Configure the OAuth consent screen.
4. Create an OAuth client for a desktop app.
5. Add the Drive app data scope:
   `https://www.googleapis.com/auth/drive.appdata`
6. Set the OAuth client id for the frontend build:

```powershell
$env:VITE_GOOGLE_CLIENT_ID="your-google-oauth-client-id.apps.googleusercontent.com"
npm run tauri:dev
```

Google Desktop OAuth clients may also include a generated client secret, and Google's token endpoint can
require it for the authorization-code exchange. If your token exchange fails with
`client_secret is missing`, set the desktop OAuth client secret too:

```powershell
$env:VITE_GOOGLE_CLIENT_ID="your-google-oauth-client-id.apps.googleusercontent.com"
$env:VITE_GOOGLE_CLIENT_SECRET="your-google-desktop-oauth-client-secret"
npm run tauri:dev
```

For packaged builds, provide `VITE_GOOGLE_CLIENT_ID` and, if required by Google, `VITE_GOOGLE_CLIENT_SECRET`
at build time. Do not commit secrets. A desktop OAuth client secret cannot be kept truly confidential in a
distributed desktop app, but Google may still require it as part of the installed-app OAuth credential.
The desktop OAuth flow uses a temporary localhost redirect URI, so the Google OAuth client must allow
loopback redirects for an installed/desktop app.

## Backup vs sync

- **Drive backup** is a full encrypted snapshot created when the user clicks **Back up now**.
- **Drive sync v1** is a manual incremental exchange of encrypted change records created when the user clicks
  **Sync now**.
- Both use hidden Google Drive `appDataFolder` storage rather than a visible Drive folder.
- Neither uploads raw SQLite database files.
- Sync v1 is not a background daemon, live collaboration, or real-time multi-device editor.

## Privacy model

- Backups are uploaded only after the user connects Google Drive and clicks **Back up now**.
- Sync records are uploaded only after the user connects Google Drive and clicks **Sync now**.
- Backup files are stored in hidden Google Drive `appDataFolder` storage, not in a visible Drive folder.
- Lumo encrypts the whole backup package and each sync change record before upload with the Cloud Encryption Password.
- The Cloud Encryption Password protects both Drive backups and sync v1 records.
- The Cloud Encryption Password is not stored directly. If it is forgotten, existing Drive backups and sync records cannot be restored.
- Locked notes and locked attachments remain encrypted in the local backup payload, and the whole cloud package is encrypted again before upload.
- Locked note content is not decrypted just to merge a sync record.
- Lumo remains offline-capable and local-first. Drive is only used for optional manual backup, restore, and sync.

## appDataFolder layout

Lumo uses logical file prefixes inside Google Drive `appDataFolder`:

```text
lumo-backup-manifest.json
lumo-backup-YYYYMMDD-HHMMSS-deviceid.json.enc
lumo-sync-manifest.json
changes/lumo-sync-change-changeid.json.enc
```

The sync manifest contains change ids, device ids, timestamps, entity type, operation, and encrypted file ids.
It does not contain note content.

## Sync v1 conflict behavior

Sync v1 intentionally avoids complex rich-text merging.

- If a remote note is newer or missing locally, it is merged into the local database.
- If a local note is newer than the remote note, Lumo keeps the local note and creates a conflict copy named
  `Original Title (conflict from DEVICE - DATE)`.
- Folder and tag data are merged through the existing non-destructive restore path.
- Attachment records are restored idempotently; existing attachment ids are skipped.
- Missing or corrupted remote records are reported as sync errors.

## Current phase

Implemented:

- Google OAuth with `drive.appdata`.
- Manual encrypted backup upload to Drive `appDataFolder`.
- Manifest-backed backup listing.
- Manual encrypted merge restore.
- Stable local device id/name metadata.
- Manual encrypted sync change upload/download.
- Sync status, last sync time, and pending local change count in Settings > Sync.
- Safe conflict-copy behavior for note conflicts.

Not implemented yet:

- Background sync.
- Multi-device live sync.
- Conflict resolution UI.
- Collaboration.
