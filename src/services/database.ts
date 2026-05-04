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
