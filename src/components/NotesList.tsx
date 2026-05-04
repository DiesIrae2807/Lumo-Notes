import { NoteCard } from "./NoteCard";
import { SectionHeader } from "./SectionHeader";
import { useNotes } from "../store/notesStore";
import type { Note } from "../types/note";

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

const isToday = (date: string) => new Date(date).toDateString() === new Date().toDateString();

const isThisWeek = (date: string) => {
  const delta = Date.now() - new Date(date).getTime();
  return delta >= 1000 * 60 * 60 * 24 && delta < 1000 * 60 * 60 * 24 * 7;
};

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.025] px-4 py-8 text-center">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-48 text-xs leading-5 text-slate-500">{body}</p>
    </div>
  );
}

function renderCards(notes: Note[], selectedNoteId: string | null, selectNote: (id: string) => void) {
  return notes.map((note) => (
    <NoteCard
      key={note.id}
      isActive={note.id === selectedNoteId}
      note={note}
      onSelect={() => selectNote(note.id)}
    />
  ));
}

export function NotesList() {
  const {
    activeView,
    createNote,
    filteredNotes,
    notes,
    searchQuery,
    selectNote,
    selectedNoteId,
    setSearchQuery,
  } = useNotes();

  const pinned = filteredNotes.filter((note) => note.isPinned && !note.isDeleted);
  const unpinned = filteredNotes.filter((note) => !note.isPinned || note.isDeleted);
  const today = unpinned.filter((note) => isToday(note.updatedAt));
  const thisWeek = unpinned.filter((note) => !isToday(note.updatedAt) && isThisWeek(note.updatedAt));
  const older = unpinned.filter((note) => !isToday(note.updatedAt) && !isThisWeek(note.updatedAt));
  const hasAnyNotes = notes.some((note) => (activeView === "trash" ? note.isDeleted : !note.isDeleted));
  const hasSearch = searchQuery.trim().length > 0;

  return (
    <aside className="column-panel flex min-h-0 flex-col overflow-hidden">
      <div className="flex gap-2 border-b border-white/[0.08] p-3">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-slate-500" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-10 w-full rounded-xl border border-white/10 bg-night-950/55 pl-8 pr-16 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-lumo-teal/40 focus:bg-night-950"
            placeholder="Search notes..."
            aria-label="Search notes"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
            Ctrl K
          </span>
        </div>
        <button
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-slate-400 transition hover:text-white active:scale-95"
          onClick={createNote}
          title="New note"
        >
          +
        </button>
      </div>

      <div className="scroll-area flex-1 space-y-5 overflow-y-auto p-3">
        {filteredNotes.length === 0 ? (
          <EmptyState
            title={
              hasSearch
                ? "No search results"
                : activeView === "trash"
                  ? "Trash is empty"
                  : hasAnyNotes
                    ? "No notes here"
                    : "No notes yet"
            }
            body={
              hasSearch
                ? "Try a different title, tag, folder, or phrase."
                : activeView === "trash"
                  ? "Deleted notes will appear here."
                  : "Create a note to start writing locally."
            }
          />
        ) : (
          <>
            {pinned.length > 0 ? (
              <NoteGroup title="Pinned">
                {renderCards(pinned, selectedNoteId, selectNote)}
              </NoteGroup>
            ) : null}

            {today.length > 0 ? (
              <NoteGroup title="Today">
                {renderCards(today, selectedNoteId, selectNote)}
              </NoteGroup>
            ) : null}

            {thisWeek.length > 0 ? (
              <NoteGroup title="This Week">
                {renderCards(thisWeek, selectedNoteId, selectNote)}
              </NoteGroup>
            ) : null}

            {older.length > 0 ? (
              <NoteGroup title="Older">
                {renderCards(older, selectedNoteId, selectNote)}
              </NoteGroup>
            ) : null}
          </>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-slate-400">
        <span>{filteredNotes.length} notes</span>
        <span>Updated just now</span>
      </div>
    </aside>
  );
}
