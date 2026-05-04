import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { folders, starterNotes } from "../data/initialNotes";
import type { Note, SidebarView } from "../types/note";

type NotesContextValue = {
  notes: Note[];
  selectedNote: Note | null;
  selectedNoteId: string | null;
  searchQuery: string;
  activeFolderId: string | null;
  activeTag: string | null;
  activeView: SidebarView;
  folders: typeof folders;
  availableTags: string[];
  filteredNotes: Note[];
  createNote: () => void;
  selectNote: (id: string) => void;
  updateSelectedNote: (changes: Partial<Pick<Note, "title" | "content" | "preview">>) => void;
  toggleFavorite: (id: string) => void;
  togglePinned: (id: string) => void;
  moveToTrash: (id: string) => void;
  restoreNote: (id: string) => void;
  setSearchQuery: (query: string) => void;
  setActiveView: (view: SidebarView) => void;
  setActiveFolderId: (folderId: string) => void;
  setActiveTag: (tag: string) => void;
};

const NotesContext = createContext<NotesContextValue | null>(null);

const makePreview = (content: string) => {
  const clean = content.replace(/\s+/g, " ").trim();
  if (!clean) {
    return "";
  }

  return clean.length > 92 ? `${clean.slice(0, 92)}...` : clean;
};

const sortByUpdated = (notes: Note[]) =>
  [...notes].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

export function NotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>(starterNotes);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    starterNotes[0]?.id ?? null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [activeView, setActiveViewState] = useState<SidebarView>("all");
  const [activeFolderId, setActiveFolderIdState] = useState<string | null>(null);
  const [activeTag, setActiveTagState] = useState<string | null>(null);

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;

  const availableTags = useMemo(
    () =>
      Array.from(new Set(notes.flatMap((note) => note.tags))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [notes],
  );

  const filteredNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let next = notes.filter((note) => {
      if (activeView === "trash") {
        return note.isDeleted;
      }

      return !note.isDeleted;
    });

    if (activeView === "favorites") {
      next = next.filter((note) => note.isFavorite);
    }

    if (activeView === "recent") {
      next = sortByUpdated(next).slice(0, 12);
    }

    if (activeFolderId) {
      next = next.filter((note) => note.folderId === activeFolderId);
    }

    if (activeTag) {
      next = next.filter((note) => note.tags.includes(activeTag));
    }

    if (query) {
      next = next.filter((note) => {
        const haystack = [
          note.title,
          note.content,
          note.preview,
          note.folderName,
          ...note.tags,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      });
    }

    return sortByUpdated(next);
  }, [activeFolderId, activeTag, activeView, notes, searchQuery]);

  const createNote = useCallback(() => {
    const now = new Date().toISOString();
    const defaultFolder = folders[0];
    const newNote: Note = {
      id: `note-${crypto.randomUUID()}`,
      title: "Untitled Note",
      content: "",
      preview: "",
      folderId: defaultFolder.id,
      folderName: defaultFolder.name,
      tags: [],
      isPinned: false,
      isFavorite: false,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };

    setNotes((current) => [newNote, ...current]);
    setSelectedNoteId(newNote.id);
    setActiveViewState("all");
    setActiveFolderIdState(null);
    setActiveTagState(null);
    setSearchQuery("");
  }, []);

  const updateSelectedNote = useCallback(
    (changes: Partial<Pick<Note, "title" | "content" | "preview">>) => {
      if (!selectedNoteId) {
        return;
      }

      setNotes((current) =>
        current.map((note) => {
          if (note.id !== selectedNoteId) {
            return note;
          }

          const content = changes.content ?? note.content;
          const nextPreview =
            changes.content !== undefined ? makePreview(content) : changes.preview ?? note.preview;

          return {
            ...note,
            ...changes,
            content,
            preview: nextPreview,
            updatedAt: new Date().toISOString(),
          };
        }),
      );
    },
    [selectedNoteId],
  );

  const updateNoteById = useCallback((id: string, updater: (note: Note) => Note) => {
    setNotes((current) => current.map((note) => (note.id === id ? updater(note) : note)));
  }, []);

  const toggleFavorite = useCallback(
    (id: string) => {
      updateNoteById(id, (note) => ({
        ...note,
        isFavorite: !note.isFavorite,
        updatedAt: new Date().toISOString(),
      }));
    },
    [updateNoteById],
  );

  const togglePinned = useCallback(
    (id: string) => {
      updateNoteById(id, (note) => ({
        ...note,
        isPinned: !note.isPinned,
        updatedAt: new Date().toISOString(),
      }));
    },
    [updateNoteById],
  );

  const moveToTrash = useCallback(
    (id: string) => {
      updateNoteById(id, (note) => ({
        ...note,
        isDeleted: true,
        isPinned: false,
        updatedAt: new Date().toISOString(),
      }));
      setActiveViewState("trash");
    },
    [updateNoteById],
  );

  const restoreNote = useCallback(
    (id: string) => {
      updateNoteById(id, (note) => ({
        ...note,
        isDeleted: false,
        updatedAt: new Date().toISOString(),
      }));
      setActiveViewState("all");
    },
    [updateNoteById],
  );

  const setActiveView = useCallback((view: SidebarView) => {
    setActiveViewState(view);
    setActiveFolderIdState(null);
    setActiveTagState(null);
  }, []);

  const setActiveFolderId = useCallback((folderId: string) => {
    setActiveViewState("all");
    setActiveFolderIdState(folderId);
    setActiveTagState(null);
  }, []);

  const setActiveTag = useCallback((tag: string) => {
    setActiveViewState("all");
    setActiveFolderIdState(null);
    setActiveTagState(tag);
  }, []);

  const value = useMemo<NotesContextValue>(
    () => ({
      notes,
      selectedNote,
      selectedNoteId,
      searchQuery,
      activeFolderId,
      activeTag,
      activeView,
      folders,
      availableTags,
      filteredNotes,
      createNote,
      selectNote: setSelectedNoteId,
      updateSelectedNote,
      toggleFavorite,
      togglePinned,
      moveToTrash,
      restoreNote,
      setSearchQuery,
      setActiveView,
      setActiveFolderId,
      setActiveTag,
    }),
    [
      activeFolderId,
      activeTag,
      activeView,
      availableTags,
      createNote,
      filteredNotes,
      moveToTrash,
      notes,
      restoreNote,
      searchQuery,
      selectedNote,
      selectedNoteId,
      setActiveFolderId,
      setActiveTag,
      setActiveView,
      toggleFavorite,
      togglePinned,
      updateSelectedNote,
    ],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const context = useContext(NotesContext);

  if (!context) {
    throw new Error("useNotes must be used inside NotesProvider");
  }

  return context;
}
