import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { folders as fallbackFolders } from "../data/initialNotes";
import * as database from "../services/database";
import type { Folder, Note, SidebarView } from "../types/note";
import { getPlainTextPreview, markdownToPlainText } from "../utils/markdown";

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
  saveStatus: "idle" | "dirty" | "saving" | "saved" | "error";
  createNote: (title?: string) => void;
  selectNote: (id: string) => void;
  forceSaveSelectedNote: () => void;
  updateSelectedNote: (changes: Partial<Pick<Note, "title" | "content" | "preview">>) => void;
  toggleFavorite: (id: string) => void;
  togglePinned: (id: string) => void;
  moveToTrash: (id: string) => void;
  restoreNote: (id: string) => void;
  permanentlyDeleteSelectedNote: () => void;
  permanentlyDeleteTrashedNotes: () => void;
  createFolder: (name: string) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  setSelectedNoteFolder: (folderId: string) => void;
  createTag: (name: string) => void;
  renameTag: (oldName: string, newName: string) => void;
  deleteTag: (name: string) => void;
  addTagToSelectedNote: (name: string) => void;
  removeTagFromSelectedNote: (name: string) => void;
  setSearchQuery: (query: string) => void;
  setActiveView: (view: SidebarView) => void;
  setActiveFolderId: (folderId: string) => void;
  setActiveTag: (tag: string) => void;
};

const NotesContext = createContext<NotesContextValue | null>(null);

const sortByUpdated = (notes: Note[]) =>
  [...notes].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

const sortPinnedThenUpdated = (notes: Note[]) =>
  [...notes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const uncategorizedFolder: Folder = {
  id: "uncategorized",
  name: "Uncategorized",
  colorClass: "bg-slate-400",
};

const nextFolderColor = (index: number) =>
  [
    "bg-lumo-violet",
    "bg-lumo-teal",
    "bg-emerald-300",
    "bg-violet-400",
    "bg-indigo-200",
    "bg-rose-400",
    "bg-amber-300",
  ][index % 7];

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
  const [saveStatus, setSaveStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const pendingNoteSaves = useRef(new Map<string, Note>());
  const pendingNoteVersions = useRef(new Map<string, number>());
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const activeSaveVersions = useRef(new Set<string>());
  const saveVersion = useRef(0);

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;

  const settleSaveStatus = useCallback(() => {
    if (
      pendingNoteSaves.current.size === 0 &&
      saveTimers.current.size === 0 &&
      activeSaveVersions.current.size === 0
    ) {
      setSaveStatus("saved");
    } else {
      setSaveStatus("saving");
    }
  }, []);

  const persistNoteNow = useCallback((note: Note, version: number) => {
    const saveKey = `${note.id}:${version}`;
    activeSaveVersions.current.add(saveKey);
    setSaveStatus("saving");
    return database
      .updateNote(note)
      .then(() => {
        if (pendingNoteVersions.current.get(note.id) === version) {
          pendingNoteSaves.current.delete(note.id);
          pendingNoteVersions.current.delete(note.id);
        }
        activeSaveVersions.current.delete(saveKey);
        settleSaveStatus();
      })
      .catch((error) => {
        activeSaveVersions.current.delete(saveKey);
        if (pendingNoteVersions.current.get(note.id) === version) {
          setSaveStatus("error");
        } else {
          settleSaveStatus();
        }
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
  }, [settleSaveStatus]);

  const flushNoteSave = useCallback(
    (id: string | null) => {
      if (!id) {
        return;
      }

      const timer = saveTimers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        saveTimers.current.delete(id);
      }

      const pending = pendingNoteSaves.current.get(id);
      const version = pendingNoteVersions.current.get(id);
      if (pending && version !== undefined) {
        void persistNoteNow(pending, version);
      } else if (selectedNoteId === id) {
        settleSaveStatus();
      }
    },
    [persistNoteNow, selectedNoteId, settleSaveStatus],
  );

  const queueNoteSave = useCallback(
    (note: Note) => {
      const version = saveVersion.current + 1;
      saveVersion.current = version;
      pendingNoteSaves.current.set(note.id, note);
      pendingNoteVersions.current.set(note.id, version);
      setSaveStatus("dirty");

      const existingTimer = saveTimers.current.get(note.id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        saveTimers.current.delete(note.id);
        const pending = pendingNoteSaves.current.get(note.id);
        const pendingVersion = pendingNoteVersions.current.get(note.id);
        if (pending && pendingVersion !== undefined) {
          void persistNoteNow(pending, pendingVersion);
        } else if (selectedNoteId === note.id) {
          settleSaveStatus();
        }
      }, 700);

      saveTimers.current.set(note.id, timer);
    },
    [persistNoteNow, selectedNoteId, settleSaveStatus],
  );

  const flushAllPendingSaves = useCallback(() => {
    for (const id of pendingNoteSaves.current.keys()) {
      flushNoteSave(id);
    }
  }, [flushNoteSave]);

  useEffect(() => {
    const flushBeforeUnload = () => {
      flushAllPendingSaves();
    };

    window.addEventListener("beforeunload", flushBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", flushBeforeUnload);
      flushAllPendingSaves();
    };
  }, [flushAllPendingSaves]);

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
          markdownToPlainText(note.content),
          note.preview,
          note.folderName,
          ...note.tags,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      });
    }

    return activeView === "recent" || activeView === "trash"
      ? sortByUpdated(next)
      : sortPinnedThenUpdated(next);
  }, [activeFolderId, activeTag, activeView, notes, searchQuery]);

  const createNote = useCallback((title = "Untitled Note") => {
    flushNoteSave(selectedNoteId);
    const now = new Date().toISOString();
    const defaultFolder = folders[0];
    const noteTitle = title.trim() || "Untitled Note";
    const newNote: Note = {
      id: `note-${crypto.randomUUID()}`,
      title: noteTitle,
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
  }, [flushNoteSave, folders, selectedNoteId]);

  const updateSelectedNote = useCallback(
    (changes: Partial<Pick<Note, "title" | "content" | "preview">>) => {
      if (!selectedNote) {
        return;
      }

      const content = changes.content ?? selectedNote.content;
      const nextPreview =
        changes.content !== undefined
          ? getPlainTextPreview(content)
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
      queueNoteSave(updatedNote);
    },
    [queueNoteSave, selectedNote],
  );

  const selectNote = useCallback(
    (id: string) => {
      flushNoteSave(selectedNoteId);
      setSelectedNoteId(id);
    },
    [flushNoteSave, selectedNoteId],
  );

  const forceSaveSelectedNote = useCallback(() => {
    flushNoteSave(selectedNoteId);
  }, [flushNoteSave, selectedNoteId]);

  const updateNoteById = useCallback((id: string, updater: (note: Note) => Note) => {
    setNotes((current) => current.map((note) => (note.id === id ? updater(note) : note)));
  }, []);

  const toggleFavorite = useCallback(
    (id: string) => {
      flushNoteSave(id);
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
    [flushNoteSave, notes, updateNoteById],
  );

  const togglePinned = useCallback(
    (id: string) => {
      flushNoteSave(id);
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
    [flushNoteSave, notes, updateNoteById],
  );

  const moveToTrash = useCallback(
    (id: string) => {
      flushNoteSave(id);
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
    [flushNoteSave, updateNoteById],
  );

  const restoreNote = useCallback(
    (id: string) => {
      flushNoteSave(id);
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
    [flushNoteSave, updateNoteById],
  );

  const permanentlyDeleteSelectedNote = useCallback(() => {
    if (!selectedNote?.isDeleted) {
      return;
    }

    flushNoteSave(selectedNote.id);
    const deletedId = selectedNote.id;
    const nextTrashedNote =
      notes
        .filter((note) => note.isDeleted && note.id !== deletedId)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )[0] ?? null;

    setNotes((current) => current.filter((note) => note.id !== deletedId));
    setSelectedNoteId(nextTrashedNote?.id ?? null);
    void database.permanentlyDeleteNote(deletedId).catch((error) => {
      setDatabaseError(error instanceof Error ? error.message : String(error));
    });
  }, [flushNoteSave, notes, selectedNote]);

  const permanentlyDeleteTrashedNotes = useCallback(() => {
    const trashedIds = new Set(notes.filter((note) => note.isDeleted).map((note) => note.id));
    if (trashedIds.size === 0) {
      return;
    }

    setNotes((current) => current.filter((note) => !note.isDeleted));
    if (selectedNoteId && trashedIds.has(selectedNoteId)) {
      setSelectedNoteId(null);
    }
    void database.permanentlyDeleteTrashedNotes().catch((error) => {
      setDatabaseError(error instanceof Error ? error.message : String(error));
    });
  }, [notes, selectedNoteId]);

  const createFolder = useCallback(
    (rawName: string) => {
      const name = rawName.trim();
      if (!name) return;
      if (folders.some((folder) => folder.name.toLowerCase() === name.toLowerCase())) return;

      const now = new Date().toISOString();
      const folder: Folder = {
        id: slugify(name) || `folder-${crypto.randomUUID()}`,
        name,
        colorClass: nextFolderColor(folders.length),
      };

      setFolders((current) => [...current, folder]);
      void database.createFolder(folder, now, now).catch((error) => {
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
    },
    [folders],
  );

  const renameFolder = useCallback(
    (id: string, rawName: string) => {
      const name = rawName.trim();
      if (!name) return;
      if (folders.some((folder) => folder.id !== id && folder.name.toLowerCase() === name.toLowerCase())) return;

      const existing = folders.find((folder) => folder.id === id);
      if (!existing) return;
      const updatedAt = new Date().toISOString();

      setFolders((current) =>
        current.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
      );
      setNotes((current) =>
        current.map((note) =>
          note.folderId === id ? { ...note, folderName: name, updatedAt } : note,
        ),
      );
      void database.updateFolder(id, name, existing.colorClass, updatedAt).catch((error) => {
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
    },
    [folders],
  );

  const deleteFolder = useCallback(
    (id: string) => {
      if (id === uncategorizedFolder.id) return;
      const updatedAt = new Date().toISOString();

      setFolders((current) => {
        const remaining = current.filter((folder) => folder.id !== id);
        return remaining.some((folder) => folder.id === uncategorizedFolder.id)
          ? remaining
          : [...remaining, uncategorizedFolder];
      });
      setNotes((current) =>
        current.map((note) =>
          note.folderId === id
            ? {
                ...note,
                folderId: uncategorizedFolder.id,
                folderName: uncategorizedFolder.name,
                updatedAt,
              }
            : note,
        ),
      );
      if (activeFolderId === id) {
        setActiveFolderIdState(null);
      }
      void database.deleteFolder(id, updatedAt).catch((error) => {
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
    },
    [activeFolderId],
  );

  const setSelectedNoteFolder = useCallback(
    (folderId: string) => {
      if (!selectedNote) return;
      const folder = folders.find((item) => item.id === folderId) ?? uncategorizedFolder;
      const updatedAt = new Date().toISOString();
      const updatedNote: Note = {
        ...selectedNote,
        folderId: folder.id,
        folderName: folder.name,
        updatedAt,
      };

      setNotes((current) =>
        current.map((note) => (note.id === selectedNote.id ? updatedNote : note)),
      );
      void database
        .setNoteFolder(selectedNote.id, folder.id, folder.name, updatedAt)
        .catch((error) => {
          setDatabaseError(error instanceof Error ? error.message : String(error));
        });
    },
    [folders, selectedNote],
  );

  const createTag = useCallback(
    (rawName: string) => {
      const name = rawName.trim();
      if (!name) return;
      if (availableTags.some((tag) => tag.toLowerCase() === name.toLowerCase())) return;

      const now = new Date().toISOString();
      setDatabaseTags((current) => [...current, name].sort((a, b) => a.localeCompare(b)));
      void database.createTag(name, now, now).catch((error) => {
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
    },
    [availableTags],
  );

  const renameTag = useCallback(
    (oldName: string, rawNewName: string) => {
      const newName = rawNewName.trim();
      if (!newName) return;
      if (
        availableTags.some(
          (tag) => tag.toLowerCase() === newName.toLowerCase() && tag.toLowerCase() !== oldName.toLowerCase(),
        )
      ) {
        return;
      }

      const updatedAt = new Date().toISOString();
      setDatabaseTags((current) =>
        current.map((tag) => (tag === oldName ? newName : tag)).sort((a, b) => a.localeCompare(b)),
      );
      setNotes((current) =>
        current.map((note) => ({
          ...note,
          tags: note.tags.map((tag) => (tag === oldName ? newName : tag)),
          updatedAt: note.tags.includes(oldName) ? updatedAt : note.updatedAt,
        })),
      );
      if (activeTag === oldName) {
        setActiveTagState(newName);
      }
      void database.updateTag(oldName, newName, updatedAt).catch((error) => {
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
    },
    [activeTag, availableTags],
  );

  const deleteTag = useCallback(
    (name: string) => {
      setDatabaseTags((current) => current.filter((tag) => tag !== name));
      setNotes((current) =>
        current.map((note) => ({
          ...note,
          tags: note.tags.filter((tag) => tag !== name),
        })),
      );
      if (activeTag === name) {
        setActiveTagState(null);
      }
      void database.deleteTag(name).catch((error) => {
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
    },
    [activeTag],
  );

  const addTagToSelectedNote = useCallback(
    (rawName: string) => {
      if (!selectedNote) return;
      const name = rawName.trim();
      if (!name || selectedNote.tags.some((tag) => tag.toLowerCase() === name.toLowerCase())) return;

      const updatedAt = new Date().toISOString();
      setDatabaseTags((current) =>
        current.some((tag) => tag.toLowerCase() === name.toLowerCase())
          ? current
          : [...current, name].sort((a, b) => a.localeCompare(b)),
      );
      setNotes((current) =>
        current.map((note) =>
          note.id === selectedNote.id
            ? { ...note, tags: [...note.tags, name], updatedAt }
            : note,
        ),
      );
      void database.addTagToNote(selectedNote.id, name, updatedAt).catch((error) => {
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
    },
    [selectedNote],
  );

  const removeTagFromSelectedNote = useCallback(
    (name: string) => {
      if (!selectedNote) return;
      const updatedAt = new Date().toISOString();
      setNotes((current) =>
        current.map((note) =>
          note.id === selectedNote.id
            ? { ...note, tags: note.tags.filter((tag) => tag !== name), updatedAt }
            : note,
        ),
      );
      void database.removeTagFromNote(selectedNote.id, name, updatedAt).catch((error) => {
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
    },
    [selectedNote],
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
      saveStatus,
      createNote,
      selectNote,
      forceSaveSelectedNote,
      updateSelectedNote,
      toggleFavorite,
      togglePinned,
      moveToTrash,
      restoreNote,
      permanentlyDeleteSelectedNote,
      permanentlyDeleteTrashedNotes,
      createFolder,
      renameFolder,
      deleteFolder,
      setSelectedNoteFolder,
      createTag,
      renameTag,
      deleteTag,
      addTagToSelectedNote,
      removeTagFromSelectedNote,
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
      createFolder,
      createTag,
      databaseError,
      deleteFolder,
      deleteTag,
      filteredNotes,
      folders,
      isDatabaseLoading,
      moveToTrash,
      permanentlyDeleteSelectedNote,
      permanentlyDeleteTrashedNotes,
      removeTagFromSelectedNote,
      renameFolder,
      renameTag,
      notes,
      restoreNote,
      searchQuery,
      saveStatus,
      selectedNote,
      selectedNoteId,
      selectNote,
      setSelectedNoteFolder,
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
