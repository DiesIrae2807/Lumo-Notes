import { pinnedNotes, todayNotes, weekNotes } from "../data/mockData";
import { NoteCard } from "./NoteCard";
import { SectionHeader } from "./SectionHeader";

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

export function NotesList() {
  return (
    <aside className="column-panel flex min-h-0 flex-col overflow-hidden">
      <div className="flex gap-2 border-b border-white/[0.08] p-3">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-slate-500" />
          <input
            className="h-10 w-full rounded-xl border border-white/10 bg-night-950/55 pl-8 pr-16 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-lumo-teal/40 focus:bg-night-950"
            placeholder="Search notes..."
            aria-label="Search notes"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
            Ctrl K
          </span>
        </div>
        <button className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-slate-400 transition hover:text-white">
          +-
        </button>
      </div>

      <div className="scroll-area flex-1 space-y-5 overflow-y-auto p-3">
        <NoteGroup title="Pinned">
          {pinnedNotes.map((note) => (
            <NoteCard key={note.title} note={note} />
          ))}
        </NoteGroup>

        <NoteGroup title="Today">
          {todayNotes.map((note) => (
            <NoteCard key={note.title} note={note} />
          ))}
        </NoteGroup>

        <NoteGroup title="This Week">
          {weekNotes.map((note) => (
            <NoteCard key={note.title} note={note} />
          ))}
        </NoteGroup>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-slate-400">
        <span>20 notes</span>
        <span>Updated just now</span>
      </div>
    </aside>
  );
}
