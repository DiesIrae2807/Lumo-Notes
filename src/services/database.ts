import { invoke } from "@tauri-apps/api/core";
import type { Attachment, Folder, Note } from "../types/note";

export type DatabaseSnapshot = {
  notes: Note[];
  folders: Folder[];
  tags: string[];
  attachments: Attachment[];
  lockPasswordConfigured: boolean;
};

export type SearchResult = {
  noteId: string;
  score: number;
  snippet: string;
};

export type LockMetadata = {
  configured: boolean;
  kdfAlgorithm?: string | null;
  kdfParams?: string | null;
  encryptionAlgorithm?: string | null;
};

export type LockBackupMetadata = {
  salt: string;
  verifier: string;
  kdfAlgorithm: string;
  kdfParams: string;
  encryptionAlgorithm: string;
};

export type AttachmentBackupPayload = Attachment & {
  dataBase64: string;
};

export type PasswordChangeResult = {
  changedNotes: number;
  changedAttachments: number;
};

export async function initializeDatabase() {
  return invoke<DatabaseSnapshot>("initialize_database");
}

export async function getNotes() {
  return invoke<Note[]>("get_notes");
}

export async function getFolders() {
  return invoke<Folder[]>("get_folders");
}

export async function getTags() {
  return invoke<string[]>("get_tags");
}

export async function createNote(note: Note) {
  return invoke<void>("create_note", { note });
}

export async function updateNote(note: Note) {
  return invoke<void>("update_note", { note });
}

export async function softDeleteNote(id: string, updatedAt: string) {
  return invoke<void>("soft_delete_note", { id, updatedAt });
}

export async function restoreNote(id: string, updatedAt: string) {
  return invoke<void>("restore_note", { id, updatedAt });
}

export async function archiveNote(id: string, updatedAt: string) {
  return invoke<void>("archive_note", { id, updatedAt });
}

export async function unarchiveNote(id: string, updatedAt: string) {
  return invoke<void>("unarchive_note", { id, updatedAt });
}

export async function permanentlyDeleteNote(id: string) {
  return invoke<void>("permanently_delete_note", { id });
}

export async function permanentlyDeleteTrashedNotes() {
  return invoke<void>("permanently_delete_trashed_notes");
}

export async function toggleFavorite(id: string, isFavorite: boolean, updatedAt: string) {
  return invoke<void>("toggle_favorite", { id, isFavorite, updatedAt });
}

export async function togglePinned(id: string, isPinned: boolean, updatedAt: string) {
  return invoke<void>("toggle_pinned", { id, isPinned, updatedAt });
}

export async function createFolder(folder: Folder, createdAt: string, updatedAt: string) {
  return invoke<void>("create_folder", { folder, createdAt, updatedAt });
}

export async function updateFolder(
  id: string,
  name: string,
  colorClass: string,
  updatedAt: string,
) {
  return invoke<void>("update_folder", { id, name, colorClass, updatedAt });
}

export async function deleteFolder(id: string, updatedAt: string) {
  return invoke<void>("delete_folder", { id, updatedAt });
}

export async function setNoteFolder(
  noteId: string,
  folderId: string,
  folderName: string,
  updatedAt: string,
) {
  return invoke<void>("set_note_folder", { noteId, folderId, folderName, updatedAt });
}

export async function createTag(name: string, createdAt: string, updatedAt: string) {
  return invoke<void>("create_tag", { name, createdAt, updatedAt });
}

export async function updateTag(oldName: string, newName: string, updatedAt: string) {
  return invoke<void>("update_tag", { oldName, newName, updatedAt });
}

export async function deleteTag(name: string) {
  return invoke<void>("delete_tag", { name });
}

export async function addTagToNote(noteId: string, tagName: string, updatedAt: string) {
  return invoke<void>("add_tag_to_note", { noteId, tagName, updatedAt });
}

export async function removeTagFromNote(noteId: string, tagName: string, updatedAt: string) {
  return invoke<void>("remove_tag_from_note", { noteId, tagName, updatedAt });
}

export async function searchNotes(query: string, includeDeleted: boolean, includeArchived: boolean) {
  return invoke<SearchResult[]>("search_notes", { query, includeDeleted, includeArchived });
}

export async function rebuildSearchIndex() {
  return invoke<void>("rebuild_search_index");
}

export async function getLockMetadata() {
  return invoke<LockMetadata>("get_lock_metadata");
}

export async function getLockBackupMetadata() {
  return invoke<LockBackupMetadata | null>("get_lock_backup_metadata");
}

export async function restoreLockBackupMetadata(metadata: LockBackupMetadata) {
  return invoke<void>("restore_lock_backup_metadata", { metadata });
}

export async function setupLockPassword(password: string) {
  return invoke<LockMetadata>("setup_lock_password", { password });
}

export async function unlockLockSession(password: string) {
  return invoke<void>("unlock_lock_session", { password });
}

export async function lockAllNotes() {
  return invoke<void>("lock_all_notes");
}

export async function lockNote(note: Note) {
  return invoke<void>("lock_note", { note });
}

export async function unlockNote(id: string) {
  return invoke<Note>("unlock_note", { id });
}

export async function encryptNoteAttachments(noteId: string) {
  return invoke<Attachment[]>("encrypt_note_attachments", { noteId });
}

export async function changeLockPassword(currentPassword: string, newPassword: string) {
  return invoke<PasswordChangeResult>("change_lock_password", { currentPassword, newPassword });
}

export async function attachFileToNote(noteId: string, createdAt: string) {
  return invoke<Attachment | null>("attach_file_to_note", { noteId, createdAt });
}

export async function getAttachments() {
  return invoke<Attachment[]>("get_attachments");
}

export async function getAttachmentBackupPayloads() {
  return invoke<AttachmentBackupPayload[]>("get_attachment_backup_payloads");
}

export async function restoreBackupAttachments(attachments: AttachmentBackupPayload[]) {
  return invoke<Attachment[]>("restore_backup_attachments", { attachments });
}

export async function removeAttachment(id: string) {
  return invoke<void>("remove_attachment", { id });
}

export async function openAttachment(id: string) {
  return invoke<void>("open_attachment", { id });
}

export async function openExternalUrl(url: string) {
  return invoke<void>("open_external_url", { url });
}

export async function saveAttachmentAs(id: string) {
  return invoke<string | null>("save_attachment_as", { id });
}

export async function getAttachmentDataUrl(id: string) {
  return invoke<string>("get_attachment_data_url", { id });
}
