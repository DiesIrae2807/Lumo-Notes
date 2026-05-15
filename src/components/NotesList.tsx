import { useEffect, useRef, useState, type MouseEvent } from "react";
import { NoteCard } from "./NoteCard";
import { SectionHeader } from "./SectionHeader";
import { useNotes } from "../store/notesStore";
import { useSettings } from "../store/settingsStore";
import type { Folder, Note } from "../types/note";
import { formatRelativeTime, isSameDay, isThisWeek, isYesterday } from "../utils/date";
import { confirmDialog } from "../utils/confirm";
import { noteToMarkdown, sanitizeFilename, saveTextFile } from "../services/fileTransfer";
import { notify, notifyError } from "../utils/toast";

function NoteGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader title={title} />
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const isToday = (date: string) => isSameDay(new Date(date), new Date());

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="px-4 py-6 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <p className="mx-auto mt-2 max-w-48 text-xs leading-5 text-slate-600">{body}</p>
      {actionLabel && onAction ? (
        <button
          className="mt-4 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.07] hover:text-white active:scale-95"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function renderCards(
  notes: Note[],
  folders: Folder[],
  selectedNoteId: string | null,
  selectNote: (id: string) => void,
  toggleFavorite: (id: string) => void,
  togglePinned: (id: string) => void,
  searchQuery: string,
  searchSnippets: Record<string, string>,
  onContextMenu: (event: MouseEvent<HTMLElement>, note: Note) => void,
) {
  const folderColors = new Map(folders.map((folder) => [folder.id, folder.colorClass]));

  return notes.map((note) => (
    <NoteCard
      key={note.id}
      folderColorClass={folderColors.get(note.folderId)}
      isActive={note.id === selectedNoteId}
      note={note}
      onContextMenu={(event) => onContextMenu(event, note)}
      onSelect={() => selectNote(note.id)}
      onToggleFavorite={() => toggleFavorite(note.id)}
      onTogglePinned={() => togglePinned(note.id)}
      searchQuery={searchQuery}
      searchSnippet={searchSnippets[note.id]}
    />
  ));
}

export function NotesList() {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const {
    activeView,
    activeFolderId,
    activeTag,
    archiveNote,
    createNote,
    filteredNotes,
    folders,
    forceSaveSelectedNote,
    lockSelectedNote,
    moveToTrash,
    notes,
    permanentlyDeleteNote,
    permanentlyDeleteTrashedNotes,
    restoreNote,
    isSearchLoading,
    searchQuery,
    searchSnippets,
    selectNote,
    selectedNoteId,
    setSearchQuery,
    toggleFavorite,
    togglePinned,
    unarchiveNote,
  } = useNotes();
  const { settings } = useSettings();
  const [contextMenu, setContextMenu] = useState<{
    left: number;
    note: Note;
    top: number;
  } | null>(null);

  const pinned = filteredNotes.filter((note) => note.isPinned && !note.isDeleted && !note.isArchived);
  const unpinned = filteredNotes.filter((note) => !note.isPinned || note.isDeleted || note.isArchived);
  const today = unpinned.filter((note) => isToday(note.updatedAt));
  const yesterday = unpinned.filter((note) => isYesterday(note.updatedAt));
  const thisWeek = unpinned.filter(
    (note) => !isToday(note.updatedAt) && !isYesterday(note.updatedAt) && isThisWeek(note.updatedAt),
  );
  const older = unpinned.filter(
    (note) =>
      !isToday(note.updatedAt) && !isYesterday(note.updatedAt) && !isThisWeek(note.updatedAt),
  );
  const hasAnyNotes = notes.some((note) => {
    if (activeView === "trash") return note.isDeleted;
    if (activeView === "archive") return note.isArchived && !note.isDeleted;
    return !note.isDeleted && !note.isArchived;
  });
  const hasSearch = searchQuery.trim().length > 0;
  const trashedCount = notes.filter((note) => note.isDeleted).length;
  const activeFolderName = folders.find((folder) => folder.id === activeFolderId)?.name;
  const newestNote = filteredNotes[0];

  useEffect(() => {
    const focusSearch = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };

    window.addEventListener("lumo-focus-search", focusSearch);
    return () => window.removeEventListener("lumo-focus-search", focusSearch);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  const confirmEmptyTrash = async () => {
    if (
      !settings.confirmPermanentDelete ||
      await confirmDialog({
        confirmLabel: "Empty Trash",
        message: "Permanently delete all notes in Trash? This cannot be undone.",
        title: "Empty Trash",
        variant: "danger",
      })
    ) {
      permanentlyDeleteTrashedNotes();
    }
  };

  const openContextMenu = (event: MouseEvent<HTMLElement>, note: Note) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 190;
    const menuHeight = note.isDeleted || (note.isLocked && !note.isUnlocked) ? 136 : 184;
    setContextMenu({
      left: Math.min(event.clientX, window.innerWidth - menuWidth - 10),
      note,
      top: Math.min(event.clientY, window.innerHeight - menuHeight - 10),
    });
  };

  const exportNote = async (note: Note) => {
    try {
      if (note.isLocked) {
        notify({ kind: "info", title: "Unlock this note before exporting Markdown" });
        return;
      }
      forceSaveSelectedNote();
      const path = await saveTextFile(
        "Export note",
        `${sanitizeFilename(note.title || "Untitled Note")}.md`,
        noteToMarkdown(note, settings.markdownExportFrontmatter),
      );
      if (path) notify({ kind: "success", title: "Note exported" });
    } catch (error) {
      notifyError("Export failed", error);
    }
  };

  const deleteNote = async (note: Note) => {
    if (note.isDeleted) {
      if (
        !settings.confirmPermanentDelete ||
        await confirmDialog({
          confirmLabel: "Delete Permanently",
          message: "Permanently delete this note? This cannot be undone.",
          title: "Delete note permanently",
          variant: "danger",
        })
      ) {
        permanentlyDeleteNote(note.id);
        notify({ kind: "success", title: "Note permanently deleted" });
      }
      return;
    }

    if (
      await confirmDialog({
        confirmLabel: "Move to Trash",
        message: "Move this note to Trash? You can restore it later from Trash.",
        title: "Move note to Trash",
        variant: "danger",
      })
    ) {
      moveToTrash(note.id);
      notify({ kind: "info", title: "Moved note to Trash" });
    }
  };

  const editNote = (note: Note) => {
    forceSaveSelectedNote();
    selectNote(note.id);
    window.setTimeout(() => window.dispatchEvent(new Event("lumo-focus-note-title")), 0);
  };

  const lockNote = async (note: Note) => {
    selectNote(note.id);
    await lockSelectedNote(note.id);
  };

  const emptyState = (() => {
    if (hasSearch) {
      return {
        title: `No results for "${searchQuery.trim()}"`,
        body: "Try a different title, tag, folder, or phrase.",
        actionLabel: "Clear Search",
        onAction: () => setSearchQuery(""),
      };
    }

    if (activeView === "trash") {
      return {
        title: "Trash is empty",
        body: "Deleted notes will appear here before permanent removal.",
      };
    }

    if (activeView === "archive") {
      return {
        title: "No archived notes",
        body: "Archive notes you want out of active views without deleting them.",
      };
    }

    if (activeView === "favorites") {
      return {
        title: "No favorite notes",
        body: "Mark important notes as favorites to collect them here.",
        actionLabel: "New Note",
        onAction: createNote,
      };
    }

    if (activeFolderName) {
      return {
        title: `${activeFolderName} is empty`,
        body: "Create a note or move an existing note into this folder.",
        actionLabel: "New Note",
        onAction: () => createNote(undefined, { folderId: activeFolderId, keepCurrentView: true }),
      };
    }

    if (activeTag) {
      return {
        title: `No notes tagged ${activeTag}`,
        body: "Add this tag to a note to make it appear here.",
      };
    }

    if (hasAnyNotes) {
      return {
        title: "No notes here",
        body: "Try another view, folder, or tag.",
      };
    }

    return {
      title: "No notes yet",
      body: "Create a note to start writing locally.",
      actionLabel: "New Note",
      onAction: createNote,
    };
  })();

  return (
    <aside className="column-panel flex min-h-0 flex-col overflow-hidden">
      <div className="flex gap-2 border-b border-white/[0.08] p-3">
        <div className="min-w-0 flex-1">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-slate-500" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-10 w-full rounded-xl border border-white/10 bg-night-950/55 pl-8 pr-16 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-lumo-teal/40 focus:bg-night-950"
              placeholder="Search notes..."
              aria-label="Search notes"
            />
            {hasSearch ? (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-xs text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
                onClick={() => setSearchQuery("")}
                title="Clear search"
              >
                Clear
              </button>
            ) : (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-xs text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
                onClick={() => window.dispatchEvent(new Event("lumo-open-command-palette"))}
                title="Open command palette"
              >
                Ctrl K
              </button>
            )}
          </div>
          {hasSearch ? (
            <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-slate-500">
              <span>{isSearchLoading ? "Searching..." : `${filteredNotes.length} result${filteredNotes.length === 1 ? "" : "s"}`}</span>
              <span className="truncate pl-3">Local SQLite search</span>
            </div>
          ) : null}
        </div>
        <button
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-slate-400 transition hover:text-white active:scale-95"
          onClick={() => createNote()}
          title="New note"
        >
          +
        </button>
        {activeView === "trash" && trashedCount > 0 ? (
          <button
            className="h-10 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 text-xs text-rose-200 transition hover:border-rose-300/40 hover:bg-rose-400/[0.1] active:scale-95"
            onClick={() => void confirmEmptyTrash()}
          >
            Empty
          </button>
        ) : null}
      </div>

      <div className="scroll-area flex-1 space-y-5 overflow-y-auto p-3">
        {filteredNotes.length === 0 ? (
          <EmptyState
            title={emptyState.title}
            body={emptyState.body}
            actionLabel={emptyState.actionLabel}
            onAction={emptyState.onAction}
          />
        ) : (
          <>
            {pinned.length > 0 ? (
              <NoteGroup title="Pinned">
                {renderCards(pinned, folders, selectedNoteId, selectNote, toggleFavorite, togglePinned, searchQuery, searchSnippets, openContextMenu)}
              </NoteGroup>
            ) : null}

            {today.length > 0 ? (
              <NoteGroup title="Today">
                {renderCards(today, folders, selectedNoteId, selectNote, toggleFavorite, togglePinned, searchQuery, searchSnippets, openContextMenu)}
              </NoteGroup>
            ) : null}

            {yesterday.length > 0 ? (
              <NoteGroup title="Yesterday">
                {renderCards(yesterday, folders, selectedNoteId, selectNote, toggleFavorite, togglePinned, searchQuery, searchSnippets, openContextMenu)}
              </NoteGroup>
            ) : null}

            {thisWeek.length > 0 ? (
              <NoteGroup title="This Week">
                {renderCards(thisWeek, folders, selectedNoteId, selectNote, toggleFavorite, togglePinned, searchQuery, searchSnippets, openContextMenu)}
              </NoteGroup>
            ) : null}

            {older.length > 0 ? (
              <NoteGroup title="Older">
                {renderCards(older, folders, selectedNoteId, selectNote, toggleFavorite, togglePinned, searchQuery, searchSnippets, openContextMenu)}
              </NoteGroup>
            ) : null}
          </>
        )}
      </div>

      {contextMenu ? (
        <div
          className="fixed z-[95] w-48 rounded-xl border border-white/10 bg-night-900/95 p-1.5 text-sm shadow-[0_18px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl"
          style={{ left: contextMenu.left, top: contextMenu.top }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            className="w-full rounded-lg px-3 py-2 text-left text-slate-200 transition hover:bg-white/[0.06] hover:text-white"
            onClick={() => {
              editNote(contextMenu.note);
              setContextMenu(null);
            }}
          >
            Edit note
          </button>
          <button
            className="w-full rounded-lg px-3 py-2 text-left text-slate-200 transition hover:bg-white/[0.06] hover:text-white"
            onClick={() => {
              void exportNote(contextMenu.note);
              setContextMenu(null);
            }}
          >
            Export Markdown
          </button>
          {!contextMenu.note.isDeleted && !(contextMenu.note.isLocked && !contextMenu.note.isUnlocked) ? (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-slate-200 transition hover:bg-white/[0.06] hover:text-white"
              onClick={() => {
                void lockNote(contextMenu.note);
                setContextMenu(null);
              }}
            >
              Lock note
            </button>
          ) : null}
          {contextMenu.note.isDeleted ? (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-slate-200 transition hover:bg-white/[0.06] hover:text-white"
              onClick={() => {
                restoreNote(contextMenu.note.id);
                notify({ kind: "success", title: "Note restored" });
                setContextMenu(null);
              }}
            >
              Restore
            </button>
          ) : (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-slate-200 transition hover:bg-white/[0.06] hover:text-white"
              onClick={() => {
                if (contextMenu.note.isArchived) {
                  unarchiveNote(contextMenu.note.id);
                  notify({ kind: "success", title: "Note unarchived" });
                } else {
                  archiveNote(contextMenu.note.id);
                  notify({ kind: "info", title: "Note archived" });
                }
                setContextMenu(null);
              }}
            >
              {contextMenu.note.isArchived ? "Unarchive" : "Archive"}
            </button>
          )}
          <button
            className="w-full rounded-lg px-3 py-2 text-left text-rose-300 transition hover:bg-rose-400/10 hover:text-rose-100"
            onClick={() => {
              void deleteNote(contextMenu.note);
              setContextMenu(null);
            }}
          >
            {contextMenu.note.isDeleted ? "Delete permanently" : "Move to Trash"}
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-slate-400">
        <span>{hasSearch ? `${filteredNotes.length} results` : `${filteredNotes.length} notes`}</span>
        <span>{newestNote ? `Updated ${formatRelativeTime(newestNote.updatedAt)}` : "No updates"}</span>
      </div>
    </aside>
  );
}
