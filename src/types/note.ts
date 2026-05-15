export type Note = {
  id: string;
  title: string;
  content: string;
  preview: string;
  folderId: string;
  folderName: string;
  tags: string[];
  isPinned: boolean;
  isFavorite: boolean;
  isDeleted: boolean;
  isArchived: boolean;
  isLocked: boolean;
  isUnlocked?: boolean;
  encryptedContent?: string | null;
  encryptedPreview?: string | null;
  encryptionNonce?: string | null;
  lockedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Folder = {
  id: string;
  name: string;
  colorClass: string;
};

export type Attachment = {
  id: string;
  noteId: string;
  filename: string;
  originalPath?: string | null;
  storedPath: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
};

export type SidebarView =
  | "all"
  | "favorites"
  | "recent"
  | "archive"
  | "trash"
  | "graph"
  | "settings";
