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
  createdAt: string;
  updatedAt: string;
};

export type Folder = {
  id: string;
  name: string;
  colorClass: string;
};

export type SidebarView = "all" | "favorites" | "recent" | "trash" | "graph";
