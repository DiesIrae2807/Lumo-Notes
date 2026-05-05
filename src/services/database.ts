import { invoke } from "@tauri-apps/api/core";
import type { Folder, Note } from "../types/note";

export type DatabaseSnapshot = {
  notes: Note[];
  folders: Folder[];
  tags: string[];
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
