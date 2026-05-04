import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { folders as fallbackFolders } from "../data/initialNotes";
import * as database from "../services/database";
import type { Folder, Note, SidebarView } from "../types/note";

type NotesContextValue = {
  notes: Note[];
  selectedNote: Note | null;
  selectedNoteId: string | null;
  searchQuery: string;
  activeFolderId: string | null;
  activeTag: string | null;
  activeView: SidebarView;
  folders: Folder[];
  availableTags: string[];
  filteredNotes: Note[];
  databaseError: string | null;
  isDatabaseLoading: boolean;
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
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>(fallbackFolders);
  const [databaseTags, setDatabaseTags] = useState<string[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeView, setActiveViewState] = useState<SidebarView>("all");
  const [activeFolderId, setActiveFolderIdState] = useState<string | null>(null);
  const [activeTag, setActiveTagState] = useState<string | null>(null);
  const [isDatabaseLoading, setIsDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;

  useEffect(() => {
    let isMounted = true;

    async function loadDatabase() {
      try {
        const snapshot = await database.initializeDatabase();

        if (!isMounted) {
          return;
        }

        setNotes(snapshot.notes);
        setFolders(snapshot.folders.length > 0 ? snapshot.folders : fallbackFolders);
        setDatabaseTags(snapshot.tags);
        setSelectedNoteId(snapshot.notes.find((note) => !note.isDeleted)?.id ?? snapshot.notes[0]?.id ?? null);
        setDatabaseError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setDatabaseError(error instanceof Error ? error.message : String(error));
      } finally {
        if (isMounted) {
          setIsDatabaseLoading(false);
        }
      }
    }

    void loadDatabase();

    return () => {
      isMounted = false;
    };
  }, []);

  const availableTags = useMemo(
    () =>
      Array.from(new Set([...databaseTags, ...notes.flatMap((note) => note.tags)])).sort((a, b) =>
        a.localeCompare(b),
      ),
    [databaseTags, notes],
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

    void database.createNote(newNote).catch((error) => {
      setDatabaseError(error instanceof Error ? error.message : String(error));
    });
    setNotes((current) => [newNote, ...current]);
    setSelectedNoteId(newNote.id);
    setActiveViewState("all");
    setActiveFolderIdState(null);
    setActiveTagState(null);
    setSearchQuery("");
  }, [folders]);

  const updateSelectedNote = useCallback(
    (changes: Partial<Pick<Note, "title" | "content" | "preview">>) => {
      if (!selectedNote) {
        return;
      }

      const content = changes.content ?? selectedNote.content;
      const nextPreview =
        changes.content !== undefined
          ? makePreview(content)
          : changes.preview ?? selectedNote.preview;
      const updatedNote: Note = {
        ...selectedNote,
        ...changes,
        content,
        preview: nextPreview,
        updatedAt: new Date().toISOString(),
      };

      setNotes((current) =>
        current.map((note) => (note.id === updatedNote.id ? updatedNote : note)),
      );
      void database.updateNote(updatedNote).catch((error) => {
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
    },
    [selectedNote],
  );

  const updateNoteById = useCallback((id: string, updater: (note: Note) => Note) => {
    setNotes((current) => current.map((note) => (note.id === id ? updater(note) : note)));
  }, []);

  const toggleFavorite = useCallback(
    (id: string) => {
      const target = notes.find((note) => note.id === id);
      if (!target) return;
      const updatedAt = new Date().toISOString();
      const isFavorite = !target.isFavorite;

      updateNoteById(id, (note) => ({
        ...note,
        isFavorite,
        updatedAt,
      }));
      void database.toggleFavorite(id, isFavorite, updatedAt).catch((error) => {
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
    },
    [notes, updateNoteById],
  );

  const togglePinned = useCallback(
    (id: string) => {
      const target = notes.find((note) => note.id === id);
      if (!target) return;
      const updatedAt = new Date().toISOString();
      const isPinned = !target.isPinned;

      updateNoteById(id, (note) => ({
        ...note,
        isPinned,
        updatedAt,
      }));
      void database.togglePinned(id, isPinned, updatedAt).catch((error) => {
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
    },
    [notes, updateNoteById],
  );

  const moveToTrash = useCallback(
    (id: string) => {
      const updatedAt = new Date().toISOString();
      updateNoteById(id, (note) => ({
        ...note,
        isDeleted: true,
        isPinned: false,
        updatedAt,
      }));
      void database.softDeleteNote(id, updatedAt).catch((error) => {
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
      setActiveViewState("trash");
    },
    [updateNoteById],
  );

  const restoreNote = useCallback(
    (id: string) => {
      const updatedAt = new Date().toISOString();
      updateNoteById(id, (note) => ({
        ...note,
        isDeleted: false,
        updatedAt,
      }));
      void database.restoreNote(id, updatedAt).catch((error) => {
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
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
      databaseError,
      isDatabaseLoading,
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
      databaseError,
      filteredNotes,
      folders,
      isDatabaseLoading,
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

  if (isDatabaseLoading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-night-950 text-slate-300">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-6 py-5 text-sm">
          Opening local notes...
        </div>
      </div>
    );
  }

  if (databaseError && notes.length === 0) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-night-950 px-6 text-slate-300">
        <div className="max-w-md rounded-2xl border border-rose-400/25 bg-rose-400/[0.06] p-6">
          <p className="font-medium text-white">Could not open local database</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">{databaseError}</p>
        </div>
      </div>
    );
  }

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const context = useContext(NotesContext);

  if (!context) {
    throw new Error("useNotes must be used inside NotesProvider");
  }

  return context;
}
