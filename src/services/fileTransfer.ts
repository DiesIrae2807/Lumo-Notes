import { invoke } from "@tauri-apps/api/core";
import type { Attachment, Folder, Note } from "../types/note";
import type { LockBackupMetadata } from "./database";
import type { AttachmentBackupPayload } from "./database";
import { getPlainTextPreview } from "../utils/markdown";

export type ExportFile = {
  filename: string;
  content: string;
};

export type ImportedTextFile = {
  name: string;
  path: string;
  content: string;
};

export type LumoBackup = {
  metadata: {
    appName: "Lumo Notes";
    backupVersion: 1;
    exportedAt: string;
  };
  notes: Note[];
  folders: Folder[];
  tags: string[];
  noteTags: Array<{ noteId: string; tag: string }>;
  attachments?: AttachmentBackupPayload[];
  lockMetadata?: LockBackupMetadata | null;
};

export type ParsedMarkdownNote = {
  title: string;
  content: string;
  folderName?: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
  isPinned: boolean;
  isFavorite: boolean;
  isArchived: boolean;
};

const frontmatterKeys = [
  "title",
  "folder",
  "tags",
  "createdAt",
  "updatedAt",
  "isPinned",
  "isFavorite",
  "isArchived",
];

export function sanitizeFilename(value: string, fallback = "Untitled Note") {
  const clean = (value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);

  return clean || fallback;
}

function quoteFrontmatter(value: string) {
  return JSON.stringify(value);
}

function uniqueFilenames(notes: Note[]) {
  const seen = new Map<string, number>();

  return notes.map((note) => {
    const base = sanitizeFilename(note.title || getPlainTextPreview(note.content, 36));
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return `${base}${count > 0 ? `-${count + 1}` : ""}-${note.id.slice(-6)}.md`;
  });
}

export function noteToMarkdown(note: Note, includeFrontmatter = true) {
  if (!includeFrontmatter) {
    return note.content;
  }
  const tags = note.tags.map((tag) => `  - ${quoteFrontmatter(tag)}`).join("\n");
  return [
    "---",
    `title: ${quoteFrontmatter(note.title || "Untitled Note")}`,
    `folder: ${quoteFrontmatter(note.folderName || "Uncategorized")}`,
    "tags:",
    tags || "  []",
    `createdAt: ${quoteFrontmatter(note.createdAt)}`,
    `updatedAt: ${quoteFrontmatter(note.updatedAt)}`,
    `isPinned: ${note.isPinned}`,
    `isFavorite: ${note.isFavorite}`,
    `isArchived: ${note.isArchived}`,
    "---",
    note.content,
  ].join("\n");
}

export function notesToMarkdownFiles(notes: Note[]) {
  const filenames = uniqueFilenames(notes);
  return notes.map((note, index) => ({
    filename: filenames[index],
    content: noteToMarkdown(note),
  }));
}

export function createBackup(
  notes: Note[],
  folders: Folder[],
  tags: string[],
  includeTrash = true,
  attachments: AttachmentBackupPayload[] = [],
  lockMetadata: LockBackupMetadata | null = null,
): LumoBackup {
  const backupNotes = notes
    .filter((note) => includeTrash || !note.isDeleted)
    .map((note) =>
      note.isLocked
        ? {
            ...note,
            content: "",
            preview: "",
          }
        : note,
    );
  const backupNoteIds = new Set(backupNotes.map((note) => note.id));
  return {
    metadata: {
      appName: "Lumo Notes",
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
    },
    notes: backupNotes,
    folders,
    tags,
    noteTags: backupNotes.flatMap((note) => note.tags.map((tag) => ({ noteId: note.id, tag }))),
    attachments: attachments.filter((attachment) => backupNoteIds.has(attachment.noteId)),
    lockMetadata,
  };
}

function unquote(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
}

function parseFrontmatter(raw: string) {
  const metadata: Record<string, string | string[]> = {};
  const lines = raw.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const keyMatch = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!keyMatch) continue;

    const [, key, rawValue] = keyMatch;
    if (!frontmatterKeys.includes(key)) continue;

    if (key === "tags") {
      const tags: string[] = [];
      const inlineTags = rawValue.trim();
      if (inlineTags.startsWith("[") && inlineTags.endsWith("]")) {
        metadata.tags = inlineTags
          .slice(1, -1)
          .split(",")
          .map(unquote)
          .filter(Boolean);
        continue;
      }

      while (index + 1 < lines.length && /^\s*-\s+/.test(lines[index + 1])) {
        index += 1;
        tags.push(unquote(lines[index].replace(/^\s*-\s+/, "")));
      }
      metadata.tags = tags.filter(Boolean);
      continue;
    }

    metadata[key] = unquote(rawValue);
  }

  return metadata;
}

export function parseMarkdownImport(file: ImportedTextFile): ParsedMarkdownNote {
  const frontmatterMatch = file.content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const fallbackTitle = sanitizeFilename(file.name.replace(/\.md$/i, ""), "Imported Note");

  if (!frontmatterMatch) {
    return {
      title: fallbackTitle,
      content: file.content,
      tags: [],
      isPinned: false,
      isFavorite: false,
      isArchived: false,
    };
  }

  const metadata = parseFrontmatter(frontmatterMatch[1]);
  const body = file.content.slice(frontmatterMatch[0].length);
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];

  return {
    title: String(metadata.title || fallbackTitle),
    content: body,
    folderName: metadata.folder ? String(metadata.folder) : undefined,
    tags,
    createdAt: metadata.createdAt ? String(metadata.createdAt) : undefined,
    updatedAt: metadata.updatedAt ? String(metadata.updatedAt) : undefined,
    isPinned: String(metadata.isPinned).toLowerCase() === "true",
    isFavorite: String(metadata.isFavorite).toLowerCase() === "true",
    isArchived: false,
  };
}

export function validateBackup(value: unknown): LumoBackup {
  if (!value || typeof value !== "object") {
    throw new Error("Backup file is not a valid object.");
  }

  const backup = value as LumoBackup;
  if (backup.metadata?.appName !== "Lumo Notes" || backup.metadata?.backupVersion !== 1) {
    throw new Error("This is not a supported Lumo Notes backup.");
  }

  if (
    !Array.isArray(backup.notes) ||
    !Array.isArray(backup.folders) ||
    !Array.isArray(backup.tags) ||
    !Array.isArray(backup.noteTags)
  ) {
    throw new Error("Backup is missing notes, folders, tags, or note tag relationships.");
  }

  return backup;
}

export async function saveTextFile(title: string, defaultFilename: string, content: string) {
  return invoke<string | null>("save_text_file", { title, defaultFilename, content });
}

export async function chooseFolderAndWriteFiles(title: string, files: ExportFile[]) {
  return invoke<string | null>("choose_folder_and_write_files", { title, files });
}

export async function openTextFiles(title: string, extensions: string[], multiple: boolean) {
  return invoke<ImportedTextFile[]>("open_text_files", { title, extensions, multiple });
}
