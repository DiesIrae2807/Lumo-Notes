# Google Drive appDataFolder Backups

Lumo Notes can optionally store encrypted user-owned backups in Google Drive `appDataFolder`.
This is not live sync: local SQLite remains the source of truth, and Google sign-in is not required
to use Lumo locally.

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

## Privacy model

- Backups are uploaded only after the user connects Google Drive and clicks **Back up now**.
- Backup files are stored in hidden Google Drive `appDataFolder` storage, not in a visible Drive folder.
- Lumo encrypts the whole backup package before upload with a separate Cloud Backup Password.
- The Cloud Backup Password is not stored directly. If it is forgotten, existing Drive backups cannot be restored.
- Locked notes and locked attachments remain encrypted in the local backup payload, and the whole cloud package is encrypted again before upload.
- Lumo remains offline-capable and local-first. Drive is only used for manual backup and restore in this phase.

## Current phase

Implemented:

- Google OAuth with `drive.appdata`.
- Manual encrypted backup upload to Drive `appDataFolder`.
- Manifest-backed backup listing.
- Manual encrypted merge restore.
- Stable local device id/name metadata.

Not implemented yet:

- Background sync.
- Multi-device live sync.
- Conflict resolution.
- Delta attachment sync.
- Collaboration.
