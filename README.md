# Lumo Notes

Lumo Notes is a local-first Windows desktop note-taking app built with Tauri, React, TypeScript, Tailwind CSS, and SQLite. Notes, attachments, settings, and backups are owned by the user and stored locally by default.

Current release: `0.2.0`

## Features

- Local-first notes backed by SQLite.
- Rich-text editing with links, images, task lists, block quotes, headings, and inline formatting.
- Folders, tags, favorites, pinned notes, archive, trash, backlinks, graph view, search, command palette, focus mode, and File/Edit menu actions.
- File attachments stored in the app data directory.
- Locked notes with encrypted note body text, previews, and locked attachment contents.
- Local JSON backup/export and non-destructive restore.
- Optional encrypted Google Drive `appDataFolder` backup/restore foundation.
- Fresh installs start empty; no starter/demo notes are created automatically.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for the release changelog.

## Local Development

Install dependencies:

```bash
npm install
```

Run the Tauri desktop app:

```bash
npm run tauri:dev
```

Run only the Vite frontend:

```bash
npm run dev
```

Typecheck and build the frontend:

```bash
npm run typecheck
npm run build:frontend
```

Build the Windows app and installer:

```bash
npm run tauri:build
```

Release artifacts are written under `src-tauri/target/release/`. The app executable is generated in `src-tauri/target/release/`, and the Windows installer is generated under `src-tauri/target/release/bundle/nsis/`.

## Local Data Paths

Lumo Notes stores app data with Tauri's app data directory for the bundle identifier `com.lumo.notes`. On Windows this is expected to resolve to:

```text
%APPDATA%\com.lumo.notes\
```

The local SQLite database is stored at:

```text
%APPDATA%\com.lumo.notes\lumo-notes.db
```

Attachments are copied into:

```text
%APPDATA%\com.lumo.notes\attachments\
```

Settings are stored in the SQLite database, in the `app_settings` table.

Local backups are not stored automatically. Export Backup asks for a destination and writes the selected JSON backup wherever you choose.

Optional Google Drive backups use hidden Drive `appDataFolder` storage and encrypt the whole backup package before upload.
Setup details are in [docs/google-drive-appdata-backups.md](docs/google-drive-appdata-backups.md).

Local and Google Drive restore are non-destructive merge operations. Restoring the same backup more than once should not duplicate notes, folders, tags, note/tag relationships, or attachment metadata.

## Resetting Local Dev Data

Only reset local data when you intentionally want a clean local database.

1. Close Lumo Notes.
2. Export a backup first if there is anything you may want later.
3. Open `%APPDATA%\com.lumo.notes\`.
4. Move `lumo-notes.db` and the `attachments` folder somewhere safe, or delete them only if you are sure the data is disposable.
5. Start the app again.

Do not delete `%APPDATA%\com.lumo.notes\` on a real user's machine unless they explicitly want to remove their local notes, attachments, and settings.

## Production Notes

- App name/product name: `Lumo Notes`
- Version: `0.2.0`
- Bundle identifier: `com.lumo.notes`
- Publisher placeholder: `Lumo Notes Publisher`
- Description: `Local-first note-taking app`
- Windows bundling target: NSIS installer
- Icon: `src-tauri/icons/icon.ico`

The app does not include mandatory authentication, live cloud sync, telemetry, analytics, AI, collaboration, or mobile support.

Google sign-in is optional and only used for encrypted backup files in the user's hidden Google Drive app data storage. Lumo Notes remains usable without signing in.

## Locked Notes

Locked notes use a local Lock Password. The password is not stored directly; Lumo Notes derives an encryption key with Argon2id and encrypts note body text/previews with XChaCha20-Poly1305 in the Tauri backend.

Locked note titles, folders, tags, and attachment filenames remain visible. Locked note content and previews are cleared from the plaintext SQLite columns and from the persisted search index. Backups preserve encrypted note payloads, encrypted attachment payloads, and lock metadata so restored locked notes still require the same Lock Password.

Attachments on locked notes are encrypted at rest. Opening an encrypted attachment decrypts a temporary copy under the app cache so Windows can hand it to the default application. Temporary decrypted copies are cleared when locked sessions are closed or when the app starts again.

Changing the Lock Password re-encrypts locked note content and encrypted attachments, then closes the current unlocked session. The new password is required to unlock notes afterward.

## Google Drive Backups

Google Drive backup/restore is a manual backup foundation, not live multi-device sync. Lumo Notes uses the least-privilege Drive scope:

```text
https://www.googleapis.com/auth/drive.appdata
```

Drive backups are encrypted before upload. Google Drive does not receive plaintext note contents or plaintext attachment contents. The Cloud Backup Password protects the encrypted backup package and is separate from the Lock Password. If the Cloud Backup Password is forgotten, existing Drive backups cannot be restored by Lumo Notes.

The Google OAuth client ID is configured through local environment/config, for example:

```text
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
```

Do not commit Google OAuth secrets or local `.env` files.
