# Changelog

## 0.2.0 - 2026-05-22

### Added

- Added optional Google Drive `appDataFolder` backup and restore foundation.
- Added Google Drive connection controls in Settings > Sync.
- Added manual encrypted Drive backup upload, backup listing, and restore.
- Added Cloud Backup Password flow for encrypting Drive backup packages before upload.
- Added stable local device identity metadata for cloud backup records.
- Added Google Cloud OAuth setup documentation.
- Added restore summaries with added, updated, and skipped counts.
- Fresh installs now start empty instead of creating demo notes automatically.

### Changed

- Local and Google Drive restores now use shared non-destructive merge behavior.
- Restoring the same backup twice is now idempotent where possible and should not duplicate notes, folders, tags, note/tag relationships, or attachment metadata.
- Restore now preserves backup IDs and updates existing records when the backup item is newer.
- Attachment restore skips existing attachment records and restores missing files without duplicating metadata.
- Search index refresh now runs once after restore.
- Import or restore from the empty state now opens the file picker directly, starting from the user's Documents folder.
- Fresh local databases now start with only the required Uncategorized folder.

### Fixed

- Fixed duplicate data created by repeated local backup restore.
- Fixed duplicate data created by repeated Google Drive backup restore.
- Fixed restore crashes caused by duplicate folder IDs on fresh databases.
- Fixed foreign key errors when creating notes after fresh restore/startup.
- Fixed Google OAuth desktop flow issues around missing response type and local callback handling.
- Fixed Drive API error handling and messaging for disabled Google Drive API projects.
- Replaced browser/native JavaScript password prompts with in-app modal flows for backup password entry.

### Security and Privacy

- Drive backup files are encrypted before upload to hidden Google Drive app-specific storage.
- Locked note bodies and locked attachment contents remain encrypted at rest and are not decrypted for restore merging.
- Locked note plaintext remains excluded from persisted search indexing.
- Google sign-in remains optional; local-only usage is unchanged.

### Known Limitations

- Google Drive support is manual backup/restore only, not background sync or live multi-device sync.
- There is no conflict resolution UI yet.
- Cloud Backup Password changes apply to future backups unless old backups are manually recreated.
- Existing duplicates created by older restore builds are not automatically deleted.
