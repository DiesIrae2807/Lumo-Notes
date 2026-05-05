import type { Note } from "../types/note";
import { formatRelativeTime } from "../utils/date";
import { getPlainTextPreview } from "../utils/markdown";

const accentClasses = [
  "bg-lumo-violet text-white",
  "bg-lumo-teal text-night-950",
  "bg-lumo-blue text-night-950",
  "bg-rose-400 text-night-950",
  "bg-amber-300 text-night-950",
];

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
  const preview = getPlainTextPreview(note.preview || note.content, 110);
  const primaryChip = note.tags[0] ?? note.folderName ?? "Uncategorized";

  return (
    <button
      onClick={onSelect}
      className={`group w-full rounded-xl border p-3 text-left transition duration-300 active:scale-[0.99] ${
        isActive
          ? "border-lumo-violet/40 bg-lumo-violet/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : note.isDeleted
            ? "border-rose-400/15 bg-rose-400/[0.035] hover:border-rose-300/25 hover:bg-rose-400/[0.055]"
            : "border-white/10 bg-white/[0.035] hover:border-lumo-teal/25 hover:bg-white/[0.055]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md ${accentForNote(note)} text-[10px] font-bold`}>
          {(note.title || "U").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-semibold text-white">
              {note.title || "Untitled Note"}
            </h3>
            <span className="shrink-0 text-xs text-slate-500">{formatRelativeTime(note.updatedAt)}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs leading-5 text-slate-400">
            {preview || "No content yet"}
          </p>
          <div className="mt-3 flex items-center gap-2 overflow-hidden">
            <span className="inline-flex max-w-[9rem] truncate rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300">
              {primaryChip}
            </span>
            {note.isPinned ? (
              <span className="text-[11px] font-medium text-lumo-teal">Pinned</span>
            ) : null}
            {note.isFavorite ? (
              <span className="text-[11px] font-medium text-amber-300">Favorite</span>
            ) : null}
            {note.isDeleted ? (
              <span className="text-[11px] font-medium text-rose-300">Trash</span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
