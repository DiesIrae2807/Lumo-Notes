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
    <aside className="panel flex min-h-0 flex-col overflow-hidden p-4">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-slate-500" />
        <input
          className="w-full rounded-2xl border border-white/10 bg-night-950/55 py-3 pl-8 pr-16 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-lumo-teal/40 focus:bg-night-950"
          placeholder="Search notes..."
          aria-label="Search notes"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-500">
          Ctrl K
        </span>
      </div>

      <div className="scroll-area mt-5 flex-1 space-y-6 overflow-y-auto pr-1">
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

      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-500">
        <span>218 words</span>
        <span>Updated just now</span>
      </div>
    </aside>
  );
}
