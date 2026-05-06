import { useEffect, useRef } from "react";
import { NoteCard } from "./NoteCard";
import { SectionHeader } from "./SectionHeader";
import { useNotes } from "../store/notesStore";
import type { Note } from "../types/note";
import { formatRelativeTime, isSameDay, isThisWeek, isYesterday } from "../utils/date";

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
  selectedNoteId: string | null,
  selectNote: (id: string) => void,
  toggleFavorite: (id: string) => void,
  togglePinned: (id: string) => void,
) {
  return notes.map((note) => (
    <NoteCard
      key={note.id}
      isActive={note.id === selectedNoteId}
      note={note}
      onSelect={() => selectNote(note.id)}
      onToggleFavorite={() => toggleFavorite(note.id)}
      onTogglePinned={() => togglePinned(note.id)}
    />
  ));
}

export function NotesList() {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const {
    activeView,
    activeFolderId,
    activeTag,
    createNote,
    filteredNotes,
    folders,
    notes,
    permanentlyDeleteTrashedNotes,
    searchQuery,
    selectNote,
    selectedNoteId,
    setSearchQuery,
    toggleFavorite,
    togglePinned,
  } = useNotes();

  const pinned = filteredNotes.filter((note) => note.isPinned && !note.isDeleted);
  const unpinned = filteredNotes.filter((note) => !note.isPinned || note.isDeleted);
  const today = unpinned.filter((note) => isToday(note.updatedAt));
  const yesterday = unpinned.filter((note) => isYesterday(note.updatedAt));
  const thisWeek = unpinned.filter(
    (note) => !isToday(note.updatedAt) && !isYesterday(note.updatedAt) && isThisWeek(note.updatedAt),
  );
  const older = unpinned.filter(
    (note) =>
      !isToday(note.updatedAt) && !isYesterday(note.updatedAt) && !isThisWeek(note.updatedAt),
  );
  const hasAnyNotes = notes.some((note) => (activeView === "trash" ? note.isDeleted : !note.isDeleted));
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

  const confirmEmptyTrash = () => {
    if (window.confirm("Permanently delete all notes in Trash? This cannot be undone.")) {
      permanentlyDeleteTrashedNotes();
    }
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
        onAction: createNote,
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
        <div className="relative flex-1">
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
            onClick={confirmEmptyTrash}
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
                {renderCards(pinned, selectedNoteId, selectNote, toggleFavorite, togglePinned)}
              </NoteGroup>
            ) : null}

            {today.length > 0 ? (
              <NoteGroup title="Today">
                {renderCards(today, selectedNoteId, selectNote, toggleFavorite, togglePinned)}
              </NoteGroup>
            ) : null}

            {yesterday.length > 0 ? (
              <NoteGroup title="Yesterday">
                {renderCards(yesterday, selectedNoteId, selectNote, toggleFavorite, togglePinned)}
              </NoteGroup>
            ) : null}

            {thisWeek.length > 0 ? (
              <NoteGroup title="This Week">
                {renderCards(thisWeek, selectedNoteId, selectNote, toggleFavorite, togglePinned)}
              </NoteGroup>
            ) : null}

            {older.length > 0 ? (
              <NoteGroup title="Older">
                {renderCards(older, selectedNoteId, selectNote, toggleFavorite, togglePinned)}
              </NoteGroup>
            ) : null}
          </>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-slate-400">
        <span>{filteredNotes.length} notes</span>
        <span>{newestNote ? `Updated ${formatRelativeTime(newestNote.updatedAt)}` : "No updates"}</span>
      </div>
    </aside>
  );
}
