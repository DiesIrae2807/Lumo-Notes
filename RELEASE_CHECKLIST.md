# Lumo Notes Release Checklist

## Build Command

```bash
npm install
npm run typecheck
npm run build:frontend
npm run tauri:build
```

Generated files:

- Executable: `src-tauri/target/release/lumo-notes.exe`
- NSIS installer: `src-tauri/target/release/bundle/nsis/`

## Smoke Test Checklist

- Launch `npm run tauri:dev`.
- Create a note, edit rich text, add tags, move folders, and restart the app.
- Confirm notes, folders, tags, settings, attachments, search, backlinks, graph view, command palette, focus mode, titlebar controls, File/Edit menu, and theme customization still work.
- Confirm Settings > About shows the local backup reminder.
- Confirm no dev-only debug UI is visible.
- Confirm no hardcoded local paths are shown in the UI.

## Installer Test Checklist

- Run `npm run tauri:build`.
- Install the NSIS installer from `src-tauri/target/release/bundle/nsis/`.
- Confirm the Start Menu entry, executable name, taskbar icon, installer icon, and window icon use Lumo Notes branding.
- Launch the installed app.
- Create a note and attach a small file.
- Close and reopen the installed app.
- Confirm the note, attachment, settings, search, and theme persist.

## Backup and Restore Test

- Use Export Backup and save a JSON backup to a known folder.
- Create or modify notes after the backup.
- Use Restore Backup.
- Confirm restored notes are merged and existing notes are not deleted.
- Confirm attachments listed in the backup do not imply cloud storage; attachment files remain local.

## Locked Notes Test

- Set a Lock Password from Settings > Privacy / Locked Notes.
- Lock a note, close and reopen the app, and confirm the body is hidden.
- Open `%APPDATA%\com.lumo.notes\lumo-notes.db` with a SQLite viewer and confirm the locked note body is not readable in `notes.content` or `notes.preview`.
- Unlock with a wrong password and confirm it fails.
- Unlock with the correct password, edit the note, wait for autosave, close and reopen, then unlock again.
- Search for text that only exists inside the locked note body and confirm it does not appear while locked.
- Export a backup and confirm locked notes are preserved as encrypted payloads, not plaintext body content.
- Archive, trash, restore, and permanently delete a locked note.
- Confirm locking a note with attachments warns that attachments are not encrypted yet.

## Fresh Install Test

- On a clean Windows profile or VM, install Lumo Notes.
- Launch the app.
- Confirm the SQLite database is created under `%APPDATA%\com.lumo.notes\`.
- Confirm attachments are stored under `%APPDATA%\com.lumo.notes\attachments\` after attaching a file.

## Upgrade Install Test

- Install a previous local build and create test notes.
- Install the new build over it.
- Launch the app.
- Confirm existing SQLite data, attachments, settings, search, backlinks, and graph behavior remain intact.
- Confirm no mock or starter data is added to an existing user database.

## Uninstall Behavior Note

The installer removes app binaries. Local user data under `%APPDATA%\com.lumo.notes\` may remain so notes can survive reinstall or update flows. Treat that folder as user-owned data.

## Known Limitations

- Local-first only; no cloud sync, authentication, collaboration, telemetry, analytics, AI, mobile app, or locked notes.
- Backups are manual and are saved only to the destination selected during Export Backup.
- The current Windows icon uses `src-tauri/icons/icon.ico` as the production placeholder until a final branded icon set is supplied.
