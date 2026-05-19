# Lumo Notes Security Checklist

Use this checklist before local release builds that include locked notes or encrypted attachments.

## Locked Note Plaintext

- Create a locked note with a unique phrase, for example `LOCKNOTE_SECRET_YYYYMMDD`.
- Close and reopen Lumo Notes so the note is locked again.
- Inspect the SQLite database under `%APPDATA%\com.lumo.notes\`.
- Confirm the unique phrase does not appear in the `notes.content` or `notes.preview` columns.
- Confirm the unique phrase does not appear in `notes_fts` or any other FTS/search table.
- Search app data files recursively:

```powershell
Select-String -Path "$env:APPDATA\com.lumo.notes\**\*" -Pattern "LOCKNOTE_SECRET_YYYYMMDD" -Recurse
```

- Expected result: no plaintext match.

## Locked Attachment Plaintext

- Attach a text or image file with a unique marker, for example `LOCKATTACH_SECRET_YYYYMMDD`, to an unlocked locked note.
- Close and reopen Lumo Notes.
- Confirm raw files under `%APPDATA%\com.lumo.notes\attachments\` cannot be opened as the original attachment.
- Search app data files recursively:

```powershell
Select-String -Path "$env:APPDATA\com.lumo.notes\**\*" -Pattern "LOCKATTACH_SECRET_YYYYMMDD" -Recurse
```

- Expected result: no plaintext match.

## Backup Privacy

- Export a full JSON backup containing locked notes and locked attachments.
- Search the backup JSON for unique locked note text and unique locked attachment content.
- Confirm locked note content is present only as encrypted payload/metadata.
- Confirm locked attachment file bytes are present only as encrypted backup payloads.
- Confirm unlocked notes remain readable as expected in normal backups.

## Password And Session Behavior

- Verify a wrong lock password fails and does not reveal note content or attachments.
- Change the Lock Password.
- Verify the old password fails after the password change.
- Verify the new password unlocks locked notes and encrypted attachments.
- Verify Lock All clears the decrypted session.
- Verify app restart locks notes again and requires the Lock Password.
- Verify password recovery is not available or implied anywhere in the UI.

## Export And Temporary Files

- Try exporting a locked note while it is locked and confirm plaintext Markdown export is blocked.
- Unlock a locked note and export it to Markdown.
- Confirm the UI warns that exported unlocked locked notes become plaintext.
- Open an encrypted attachment from an unlocked locked note.
- Confirm temporary decrypted attachment files are cleaned up when locked sessions are closed or the app restarts.

## Search And Preview Privacy

- Search for text that exists only inside a locked note body while the note is locked.
- Confirm search does not reveal locked note body text or previews.
- Confirm note cards, related notes, backlinks, and graph views do not show locked body excerpts while locked.
- Confirm visible metadata behavior is intentional: titles, folders, tags, and attachment filenames may remain visible.
