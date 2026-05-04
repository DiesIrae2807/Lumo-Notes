import type { Note } from "../types/note";

const accentClasses = [
  "bg-lumo-violet text-white",
  "bg-lumo-teal text-night-950",
  "bg-lumo-blue text-night-950",
  "bg-rose-400 text-night-950",
  "bg-amber-300 text-night-950",
];

const formatUpdated = (date: string) => {
  const delta = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(delta / 60000);

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(date),
  );
};

const accentForNote = (note: Note) =>
  accentClasses[
    [...note.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % accentClasses.length
  ];

export function NoteCard({
  isActive,
  note,
  onSelect,
}: {
  isActive: boolean;
  note: Note;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`group w-full rounded-xl border p-2.5 text-left transition duration-300 active:scale-[0.99] ${
        isActive
          ? "border-lumo-violet/40 bg-lumo-violet/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "border-white/10 bg-white/[0.035] hover:border-lumo-teal/25 hover:bg-white/[0.055]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 h-4 w-4 rounded ${accentForNote(note)} grid place-items-center text-[10px] font-bold`}>
          {note.title.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="truncate text-sm font-medium text-white">
              {note.title || "Untitled Note"} {note.isFavorite ? "*" : ""}
            </h3>
            <span className="text-xs text-slate-500">{formatUpdated(note.updatedAt)}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs leading-5 text-slate-400">
            {note.preview || "No content yet"}
          </p>
          <span className="mt-3 inline-flex rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300">
            {note.tags[0] ?? note.folderName}
          </span>
        </div>
      </div>
    </button>
  );
}
