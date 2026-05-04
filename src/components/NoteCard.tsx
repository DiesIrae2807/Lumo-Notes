import type { Note } from "../data/mockData";

const accentMap: Record<Note["accent"], string> = {
  violet: "bg-lumo-violet text-white",
  teal: "bg-lumo-teal text-night-950",
  blue: "bg-lumo-blue text-night-950",
  rose: "bg-rose-400 text-night-950",
  amber: "bg-amber-300 text-night-950",
};

export function NoteCard({ note }: { note: Note }) {
  return (
    <button
      className={`group w-full rounded-2xl border p-3 text-left transition duration-300 active:scale-[0.99] ${
        note.active
          ? "border-lumo-violet/40 bg-lumo-violet/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "border-white/10 bg-white/[0.035] hover:border-lumo-teal/25 hover:bg-white/[0.055]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-5 w-5 rounded-md ${accentMap[note.accent]} grid place-items-center text-[10px] font-bold`}>
          {note.title.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="truncate text-sm font-medium text-white">{note.title}</h3>
            <span className="text-xs text-slate-500">{note.time}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{note.preview}</p>
          <span className="mt-3 inline-flex rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300">
            {note.tag}
          </span>
        </div>
      </div>
    </button>
  );
}
