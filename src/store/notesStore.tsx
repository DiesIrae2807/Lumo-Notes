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
import { useSettings } from "./settingsStore";
import type { LumoBackup, ParsedMarkdownNote } from "../services/fileTransfer";
import type { Attachment, Folder, Note, SidebarView } from "../types/note";
import { getPlainTextPreview, markdownToPlainText } from "../utils/markdown";
import { notify, notifyError } from "../utils/toast";

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
  attachments: Attachment[];
  selectedNoteAttachments: Attachment[];
  filteredNotes: Note[];
  databaseError: string | null;
  isDatabaseLoading: boolean;
  saveStatus: "idle" | "dirty" | "saving" | "saved" | "error";
  isSearchLoading: boolean;
  searchSnippets: Record<string, string>;
  createNote: (title?: string) => void;
  importMarkdownNotes: (imports: ParsedMarkdownNote[]) => Promise<number>;
  restoreBackupMerge: (backup: LumoBackup) => Promise<number>;
  attachFileToSelectedNote: () => Promise<Attachment | null>;
  openAttachment: (id: string) => Promise<void>;
  removeAttachment: (id: string) => Promise<void>;
  selectNote: (id: string) => void;
  forceSaveSelectedNote: () => void;
  updateSelectedNote: (changes: Partial<Pick<Note, "title" | "content" | "preview">>) => void;
  toggleFavorite: (id: string) => void;
  togglePinned: (id: string) => void;
  moveToTrash: (id: string) => void;
  restoreNote: (id: string) => void;
  permanentlyDeleteNote: (id: string) => void;
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

const uniqueByLower = (values: string[]) =>
  Array.from(new Map(values.filter(Boolean).map((value) => [value.toLowerCase(), value])).values());

const noteId = () => `note-${crypto.randomUUID()}`;
const autosaveDelayMs = { fast: 350, normal: 700, relaxed: 1200 } as const;

const folderId = (name: string) => slugify(name) || `folder-${crypto.randomUUID()}`;

const uniqueFolderId = (name: string, existingFolders: Folder[]) => {
  const preferred = folderId(name);
  return existingFolders.some((folder) => folder.id === preferred)
    ? `folder-${crypto.randomUUID()}`
    : preferred;
};

export function NotesProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>(fallbackFolders);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [databaseTags, setDatabaseTags] = useState<string[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeView, setActiveViewState] = useState<SidebarView>("all");
  const [activeFolderId, setActiveFolderIdState] = useState<string | null>(null);
  const [activeTag, setActiveTagState] = useState<string | null>(null);
  const [isDatabaseLoading, setIsDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    includeDeleted: boolean;
    query: string;
    results: database.SearchResult[];
  } | null>(null);
  const pendingNoteSaves = useRef(new Map<string, Note>());
  const pendingNoteVersions = useRef(new Map<string, number>());
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const activeSaveVersions = useRef(new Set<string>());
  const saveVersion = useRef(0);

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;
  const selectedNoteAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.noteId === selectedNoteId),
    [attachments, selectedNoteId],
  );

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
        notifyError("Note save failed", error);
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
      }, autosaveDelayMs[settings.autosaveDelay]);

      saveTimers.current.set(note.id, timer);
    },
    [persistNoteNow, selectedNoteId, settleSaveStatus, settings.autosaveDelay],
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
        setAttachments(snapshot.attachments);
        setDatabaseTags(snapshot.tags);
        setSelectedNoteId(
          settings.startupBehavior === "allNotes"
            ? null
            : snapshot.notes.find((note) => !note.isDeleted)?.id ?? snapshot.notes[0]?.id ?? null,
        );
        setDatabaseError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setDatabaseError(error instanceof Error ? error.message : String(error));
        notifyError("Could not open local database", error);
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

  const searchDataVersion = useMemo(
    () =>
      [
        notes
          .map((note) =>
            [
              note.id,
              note.title,
              note.preview,
              note.content,
              note.folderId,
              note.folderName,
              note.tags.join(","),
              note.isDeleted,
              note.updatedAt,
            ].join(":"),
          )
          .join("|"),
        attachments
          .map((attachment) => [attachment.id, attachment.noteId, attachment.filename].join(":"))
          .join("|"),
      ].join("::"),
    [attachments, notes],
  );

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults(null);
      setIsSearchLoading(false);
      return;
    }

    let isStale = false;
    const includeDeleted = activeView === "trash";
    setIsSearchLoading(true);
    const timer = window.setTimeout(() => {
      database
        .searchNotes(query, includeDeleted)
        .then((results) => {
          if (isStale) return;
          setSearchResults({ includeDeleted, query, results });
          setIsSearchLoading(false);
        })
        .catch(() => {
          if (isStale) return;
          setSearchResults(null);
          setIsSearchLoading(false);
        });
    }, 120);

    return () => {
      isStale = true;
      window.clearTimeout(timer);
    };
  }, [activeView, searchDataVersion, searchQuery]);

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

    const activeSearchResults =
      query &&
      searchResults?.query.toLowerCase() === query &&
      searchResults.includeDeleted === (activeView === "trash")
        ? searchResults.results
        : null;

    if (query && activeSearchResults) {
      const order = new Map(activeSearchResults.map((result, index) => [result.noteId, index]));
      next = next
        .filter((note) => order.has(note.id))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return next;
    }

    if (query) {
      next = next.filter((note) => {
        const haystack = [
          note.title,
          markdownToPlainText(note.content),
          note.preview,
          note.folderName,
          ...attachments
            .filter((attachment) => attachment.noteId === note.id)
            .map((attachment) => attachment.filename),
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
  }, [activeFolderId, activeTag, activeView, attachments, notes, searchQuery, searchResults]);

  const searchSnippets = useMemo(() => {
    if (
      !searchResults ||
      searchResults.query !== searchQuery.trim() ||
      searchResults.includeDeleted !== (activeView === "trash")
    ) {
      return {};
    }
    return Object.fromEntries(
      searchResults.results
        .filter((result) => result.snippet)
        .map((result) => [result.noteId, result.snippet]),
    );
  }, [activeView, searchQuery, searchResults]);

  const createNote = useCallback((title = "Untitled Note") => {
    flushNoteSave(selectedNoteId);
    const now = new Date().toISOString();
    const defaultFolder = folders[0];
    const defaultTitle =
      settings.newNoteTitleBehavior === "dateTime"
        ? new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date())
        : "Untitled Note";
    const noteTitle = title.trim() || defaultTitle;
    const newNote: Note = {
      id: noteId(),
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
      notifyError("Could not create note", error);
    });
    setNotes((current) => [newNote, ...current]);
    setSelectedNoteId(newNote.id);
    setActiveViewState("all");
    setActiveFolderIdState(null);
    setActiveTagState(null);
    setSearchQuery("");
  }, [flushNoteSave, folders, selectedNoteId, settings.newNoteTitleBehavior]);

  const importMarkdownNotes = useCallback(
    async (imports: ParsedMarkdownNote[]) => {
      flushNoteSave(selectedNoteId);

      if (imports.length === 0) return 0;

      const now = new Date().toISOString();
      const localFolders = [...folders];
      const foldersToCreate: Folder[] = [];
      const tagsToCreate = uniqueByLower(imports.flatMap((item) => item.tags));

      const ensureFolder = (name?: string) => {
        const folderName = name?.trim() || "Uncategorized";
        const existing = localFolders.find(
          (folder) => folder.name.toLowerCase() === folderName.toLowerCase(),
        );
        if (existing) return existing;

        const folder: Folder = {
          id: uniqueFolderId(folderName, localFolders),
          name: folderName,
          colorClass: nextFolderColor(localFolders.length),
        };
        localFolders.push(folder);
        foldersToCreate.push(folder);
        return folder;
      };

      const notesToCreate = imports.map((item) => {
        const folder = ensureFolder(item.folderName);
        const createdAt = item.createdAt || now;
        const updatedAt = item.updatedAt || now;
        const content = item.content;

        return {
          id: noteId(),
          title: item.title.trim() || "Imported Note",
          content,
          preview: getPlainTextPreview(content),
          folderId: folder.id,
          folderName: folder.name,
          tags: uniqueByLower(item.tags),
          isPinned: item.isPinned,
          isFavorite: item.isFavorite,
          isDeleted: false,
          createdAt,
          updatedAt,
        } satisfies Note;
      });

      for (const folder of foldersToCreate) {
        await database.createFolder(folder, now, now);
      }

      for (const tag of tagsToCreate) {
        if (!availableTags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
          await database.createTag(tag, now, now);
        }
      }

      for (const note of notesToCreate) {
        await database.createNote(note);
      }

      setFolders(localFolders);
      setDatabaseTags((current) => uniqueByLower([...current, ...tagsToCreate]).sort((a, b) => a.localeCompare(b)));
      setNotes((current) => [...notesToCreate, ...current]);
      setSelectedNoteId(notesToCreate[0]?.id ?? selectedNoteId);
      setActiveViewState("all");
      setActiveFolderIdState(null);
      setActiveTagState(null);
      setSearchQuery("");
      notify({ kind: "success", title: `${notesToCreate.length} Markdown note${notesToCreate.length === 1 ? "" : "s"} imported` });
      return notesToCreate.length;
    },
    [availableTags, flushNoteSave, folders, selectedNoteId],
  );

  const restoreBackupMerge = useCallback(
    async (backup: LumoBackup) => {
      flushNoteSave(selectedNoteId);

      const now = new Date().toISOString();
      const localFolders = [...folders];
      const foldersToCreate: Folder[] = [];

      const ensureFolder = (incoming: Folder | null, fallbackName: string) => {
        const name = incoming?.name?.trim() || fallbackName || "Uncategorized";
        const existing = localFolders.find(
          (folder) => folder.name.toLowerCase() === name.toLowerCase(),
        );
        if (existing) return existing;

        const idAlreadyUsed = localFolders.some((folder) => folder.id === incoming?.id);
        const folder: Folder = {
          id: incoming && !idAlreadyUsed ? incoming.id : folderId(name),
          name,
          colorClass: incoming?.colorClass || nextFolderColor(localFolders.length),
        };
        localFolders.push(folder);
        foldersToCreate.push(folder);
        return folder;
      };

      for (const folder of backup.folders) {
        ensureFolder(folder, folder.name);
      }

      const existingNoteIds = new Set(notes.map((note) => note.id));
      const notesToCreate = backup.notes.map((incoming) => {
        const backupFolder =
          backup.folders.find((folder) => folder.id === incoming.folderId) ?? null;
        const folder = ensureFolder(backupFolder, incoming.folderName);
        const id = existingNoteIds.has(incoming.id) ? noteId() : incoming.id;
        existingNoteIds.add(id);
        const relationshipTags = backup.noteTags
          .filter((item) => item.noteId === incoming.id)
          .map((item) => item.tag);

        return {
          ...incoming,
          id,
          folderId: folder.id,
          folderName: folder.name,
          preview: incoming.preview || getPlainTextPreview(incoming.content),
          tags: uniqueByLower([...incoming.tags, ...relationshipTags]),
        } satisfies Note;
      });
      const tagsToCreate = uniqueByLower([
        ...backup.tags,
        ...backup.noteTags.map((item) => item.tag),
        ...notesToCreate.flatMap((note) => note.tags),
      ]);

      for (const folder of foldersToCreate) {
        await database.createFolder(folder, now, now);
      }

      for (const tag of tagsToCreate) {
        if (!availableTags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
          await database.createTag(tag, now, now);
        }
      }

      for (const note of notesToCreate) {
        await database.createNote(note);
      }

      setFolders(localFolders);
      setDatabaseTags((current) => uniqueByLower([...current, ...tagsToCreate]).sort((a, b) => a.localeCompare(b)));
      setNotes((current) => [...notesToCreate, ...current]);
      setSelectedNoteId(notesToCreate[0]?.id ?? selectedNoteId);
      setActiveViewState("all");
      setActiveFolderIdState(null);
      setActiveTagState(null);
      setSearchQuery("");
      notify({ kind: "success", title: `${notesToCreate.length} backup note${notesToCreate.length === 1 ? "" : "s"} restored` });
      return notesToCreate.length;
    },
    [availableTags, flushNoteSave, folders, notes, selectedNoteId],
  );

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
      if (
        settings.newNoteTitleBehavior === "firstLine" &&
        changes.content !== undefined &&
        selectedNote.title === "Untitled Note"
      ) {
        const firstLine = content.split(/\r?\n/).find((line) => line.trim())?.trim();
        if (firstLine) {
          updatedNote.title = firstLine.slice(0, 80);
        }
      }

      setNotes((current) =>
        current.map((note) => (note.id === updatedNote.id ? updatedNote : note)),
      );
      queueNoteSave(updatedNote);
    },
    [queueNoteSave, selectedNote, settings.newNoteTitleBehavior],
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

  const attachFileToSelectedNote = useCallback(async () => {
    if (!selectedNote) return null;
    flushNoteSave(selectedNote.id);

    const createdAt = new Date().toISOString();
    const attachment = await database.attachFileToNote(selectedNote.id, createdAt);
    if (!attachment) return null;

    const markdownReference = attachment.mimeType.startsWith("image/")
      ? `![${attachment.filename}](attachment://${attachment.id})`
      : `[${attachment.filename}](attachment://${attachment.id})`;
    const separator = selectedNote.content.trim() ? "\n\n" : "";
    const nextContent = `${selectedNote.content}${separator}${markdownReference}`;
    const updatedNote: Note = {
      ...selectedNote,
      content: nextContent,
      preview: getPlainTextPreview(nextContent),
      updatedAt: new Date().toISOString(),
    };

    setAttachments((current) => [attachment, ...current]);
    setNotes((current) =>
      current.map((note) => (note.id === selectedNote.id ? updatedNote : note)),
    );
    queueNoteSave(updatedNote);
    notify({ kind: "success", title: "Attachment added", message: attachment.filename });
    return attachment;
  }, [flushNoteSave, queueNoteSave, selectedNote]);

  const openAttachment = useCallback(async (id: string) => {
    try {
      await database.openAttachment(id);
    } catch (error) {
      notifyError("Could not open attachment", error);
      throw error;
    }
  }, []);

  const removeAttachment = useCallback(async (id: string) => {
    const target = attachments.find((attachment) => attachment.id === id);
    await database.removeAttachment(id);
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
    notify({ kind: "success", title: "Attachment removed", message: target?.filename });
  }, [attachments]);

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
    setAttachments((current) => current.filter((attachment) => attachment.noteId !== deletedId));
    setSelectedNoteId(nextTrashedNote?.id ?? null);
    void database.permanentlyDeleteNote(deletedId).catch((error) => {
      setDatabaseError(error instanceof Error ? error.message : String(error));
    });
  }, [flushNoteSave, notes, selectedNote]);

  const permanentlyDeleteNote = useCallback(
    (id: string) => {
      const target = notes.find((note) => note.id === id);
      if (!target?.isDeleted) return;

      flushNoteSave(id);
      const nextTrashedNote =
        notes
          .filter((note) => note.isDeleted && note.id !== id)
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          )[0] ?? null;

      setNotes((current) => current.filter((note) => note.id !== id));
      setAttachments((current) => current.filter((attachment) => attachment.noteId !== id));
      setSelectedNoteId((current) => (current === id ? nextTrashedNote?.id ?? null : current));
      void database.permanentlyDeleteNote(id).catch((error) => {
        setDatabaseError(error instanceof Error ? error.message : String(error));
      });
    },
    [flushNoteSave, notes],
  );

  const permanentlyDeleteTrashedNotes = useCallback(() => {
    const trashedIds = new Set(notes.filter((note) => note.isDeleted).map((note) => note.id));
    if (trashedIds.size === 0) {
      return;
    }

    setNotes((current) => current.filter((note) => !note.isDeleted));
    setAttachments((current) => current.filter((attachment) => !trashedIds.has(attachment.noteId)));
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
      attachments,
      selectedNoteAttachments,
      filteredNotes,
      databaseError,
      isDatabaseLoading,
      saveStatus,
      isSearchLoading,
      searchSnippets,
      createNote,
      importMarkdownNotes,
      restoreBackupMerge,
      attachFileToSelectedNote,
      openAttachment,
      removeAttachment,
      selectNote,
      forceSaveSelectedNote,
      updateSelectedNote,
      toggleFavorite,
      togglePinned,
      moveToTrash,
      restoreNote,
      permanentlyDeleteNote,
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
      attachments,
      availableTags,
      attachFileToSelectedNote,
      createNote,
      createFolder,
      createTag,
      databaseError,
      deleteFolder,
      deleteTag,
      filteredNotes,
      folders,
      isDatabaseLoading,
      isSearchLoading,
      importMarkdownNotes,
      moveToTrash,
      openAttachment,
      permanentlyDeleteNote,
      permanentlyDeleteSelectedNote,
      permanentlyDeleteTrashedNotes,
      removeAttachment,
      removeTagFromSelectedNote,
      renameFolder,
      renameTag,
      notes,
      restoreNote,
      restoreBackupMerge,
      searchQuery,
      searchSnippets,
      saveStatus,
      selectedNote,
      selectedNoteAttachments,
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
