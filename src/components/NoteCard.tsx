import type { Note } from "../types/note";
import { FavoriteHeartIcon } from "./icons/FavoriteHeartIcon";
import { PinIcon } from "./icons/PinIcon";
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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function HighlightedText({ query, text }: { query?: string; text: string }) {
  const terms = query?.trim().split(/\s+/).filter(Boolean).slice(0, 4) ?? [];
  if (terms.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "ig");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) =>
        terms.some((term) => term.toLowerCase() === part.toLowerCase()) ? (
          <mark
            key={`${part}-${index}`}
            className="rounded bg-lumo-teal/15 px-0.5 text-slate-100"
          >
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

export function NoteCard({
  isActive,
  note,
  onSelect,
  onToggleFavorite,
  onTogglePinned,
  searchQuery,
  searchSnippet,
}: {
  isActive: boolean;
  note: Note;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onTogglePinned: () => void;
  searchQuery?: string;
  searchSnippet?: string;
}) {
  const preview = searchSnippet || getPlainTextPreview(note.preview || note.content, 110);
  const primaryChip = note.tags[0] ?? note.folderName ?? "Uncategorized";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`group w-full cursor-pointer rounded-xl border p-3 text-left transition duration-300 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-lumo-violet/60 ${
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
              <HighlightedText query={searchQuery} text={note.title || "Untitled Note"} />
            </h3>
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-xs text-slate-500">{formatRelativeTime(note.updatedAt)}</span>
              <button
                type="button"
                className={`grid h-7 w-7 place-items-center rounded-lg transition duration-150 hover:bg-white/[0.06] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF8A9A]/60 ${
                  note.isFavorite
                    ? "text-[#FF4D6D] opacity-100"
                    : "text-slate-600 opacity-0 hover:text-[#FF8A9A] group-hover:opacity-100 focus:opacity-100"
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFavorite();
                }}
                aria-label={note.isFavorite ? "Remove favorite" : "Favorite note"}
                aria-pressed={note.isFavorite}
                title={note.isFavorite ? "Remove favorite" : "Favorite"}
              >
                <FavoriteHeartIcon active={note.isFavorite} />
              </button>
              <button
                type="button"
                className={`grid h-7 w-7 place-items-center rounded-lg transition duration-150 hover:bg-white/[0.06] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lumo-teal/60 ${
                  note.isPinned
                    ? "text-lumo-teal opacity-100"
                    : "text-slate-600 opacity-0 hover:text-lumo-teal group-hover:opacity-100 focus:opacity-100"
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  onTogglePinned();
                }}
                aria-label={note.isPinned ? "Unpin note" : "Pin note"}
                aria-pressed={note.isPinned}
                title={note.isPinned ? "Unpin" : "Pin"}
              >
                <PinIcon active={note.isPinned} />
              </button>
            </div>
          </div>
          <p className="mt-1 line-clamp-1 text-xs leading-5 text-slate-400">
            <HighlightedText query={searchQuery} text={preview || "No content yet"} />
          </p>
          <div className="mt-3 flex items-center gap-2 overflow-hidden">
            <span className="inline-flex max-w-[9rem] truncate rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300">
              {primaryChip}
            </span>
            {note.isDeleted ? (
              <span className="text-[11px] font-medium text-rose-300">Trash</span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
