import { useMemo, useState } from "react";
import { SectionHeader } from "./SectionHeader";
import { InsightsIcon } from "./icons/InsightsIcon";
import { useNotes } from "../store/notesStore";
import { formatMetadataDate, formatRelativeTime } from "../utils/date";
import { excerptFromMarkdown, getPlainTextPreview } from "../utils/markdown";
import {
  parseInternalLinks,
  resolveInternalLinks,
  uniqueResolvedNotes,
} from "../utils/links";
import { confirmDialog } from "../utils/confirm";

const accentMap = {
  violet: "bg-lumo-violet",
  teal: "bg-lumo-teal",
  rose: "bg-rose-400",
} as const;

const wordCount = (content: string) =>
  content.trim() ? content.trim().split(/\s+/).length : 0;

const extractOutline = (content: string) =>
  content
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (!match) return null;
      return {
        level: match[1].length,
        title: match[2].replace(/^==|==$/g, "").trim(),
      };
    })
    .filter((item): item is { level: number; title: string } => Boolean(item?.title));

export function InsightsPanel({ onCollapse }: { onCollapse?: () => void }) {
  const { activeView, createNote, notes, selectedNote, selectNote } = useNotes();
  const [activeTab, setActiveTab] = useState<"insights" | "links">("insights");
  const includeDeletedLinks = activeView === "trash";
  const linkDetails = useMemo(() => {
    if (!selectedNote) {
      return {
        outgoingLinks: [],
        outgoingNotes: [],
        backlinks: [],
        unresolvedLinks: [],
      };
    }

    const outgoingLinks = resolveInternalLinks(
      parseInternalLinks(selectedNote.content, selectedNote.id),
      notes,
      includeDeletedLinks,
    );
    const outgoingNotes = uniqueResolvedNotes(outgoingLinks).filter(
      (note) => note.id !== selectedNote.id,
    );
    const backlinks = notes
      .filter((note) => note.id !== selectedNote.id)
      .filter((note) => includeDeletedLinks || !note.isDeleted)
      .filter((note) =>
        resolveInternalLinks(parseInternalLinks(note.content, note.id), notes, includeDeletedLinks)
          .some((link) => link.targetNote?.id === selectedNote.id),
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const unresolvedLinks = outgoingLinks.filter((link) => !link.targetNote);

    return {
      outgoingLinks,
      outgoingNotes,
      backlinks,
      unresolvedLinks,
    };
  }, [includeDeletedLinks, notes, selectedNote]);
  const relatedNotes = [...linkDetails.outgoingNotes, ...linkDetails.backlinks]
    .filter((note, index, all) => all.findIndex((item) => item.id === note.id) === index)
    .slice(0, 3);
  const summaryText = selectedNote
    ? excerptFromMarkdown(selectedNote.preview || selectedNote.content) ||
      "This note does not have a preview yet."
    : "Select a note to see contextual details.";
  const outline = useMemo(
    () => (selectedNote ? extractOutline(selectedNote.content).slice(0, 8) : []),
    [selectedNote],
  );

  return (
    <aside className="column-panel hidden min-h-0 flex-col overflow-hidden xl:flex">
      <div className="flex items-start justify-between border-b border-white/10 px-4 pt-4">
        <div className="flex items-start gap-3">
          <InsightsIcon active={activeTab === "insights"} className="shrink-0" />
          <div className="flex gap-5 text-sm font-medium">
            <button
              className={`border-b-2 pb-3 transition ${
                activeTab === "insights"
                  ? "border-lumo-violet text-white"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
              onClick={() => setActiveTab("insights")}
            >
              Insights
            </button>
            <button
              className={`border-b-2 pb-3 transition ${
                activeTab === "links"
                  ? "border-lumo-violet text-white"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
              onClick={() => setActiveTab("links")}
            >
              Linked Notes
            </button>
          </div>
        </div>
        <button
          className="-mt-2 grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.05] hover:text-white active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lumo-violet/60"
          onClick={onCollapse}
          aria-label="Collapse insights"
          title="Collapse insights"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="scroll-area flex-1 space-y-4 overflow-y-auto p-3">
        {activeTab === "links" ? (
          <LinkedNotesPanel
            backlinks={linkDetails.backlinks}
            outgoingNotes={linkDetails.outgoingNotes}
            unresolvedLinks={linkDetails.unresolvedLinks}
            onCreateNote={createNote}
            onSelectNote={selectNote}
          />
        ) : (
        <>
        <section className="insight-card">
          <h3 className="text-sm font-semibold text-white">Summary</h3>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            {summaryText}
          </p>
        </section>

        <section className="insight-card">
          <h3 className="text-sm font-semibold text-white">Key Points</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            {[
              `Folder: ${selectedNote?.folderName ?? "None"}`,
              `Tags: ${selectedNote?.tags.join(", ") || "None"}`,
              `Status: ${selectedNote?.isDeleted ? "In Trash" : "Active"}`,
              `Pinned: ${selectedNote?.isPinned ? "Yes" : "No"}`,
              `Created: ${selectedNote ? formatMetadataDate(selectedNote.createdAt) : "None"}`,
              `Updated: ${selectedNote ? formatMetadataDate(selectedNote.updatedAt) : "None"}`,
              `Length: ${selectedNote ? `${wordCount(selectedNote.content)} words, ${selectedNote.content.length} chars` : "None"}`,
            ].map((point) => (
              <p key={point} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-lumo-teal" />
                <span>{point}</span>
              </p>
            ))}
          </div>
        </section>

        <section className="insight-card">
          <SectionHeader title="Outline" />
          <div className="mt-4 space-y-1">
            {outline.length === 0 ? (
              <p className="text-xs leading-5 text-slate-500">
                Add headings to build a quick note outline.
              </p>
            ) : null}
            {outline.map((heading, index) => (
              <button
                key={`${heading.title}-${index}`}
                className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
                style={{ paddingLeft: `${0.5 + (heading.level - 1) * 0.75}rem` }}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("lumo-focus-note-heading", {
                      detail: { title: heading.title },
                    }),
                  )
                }
              >
                {heading.title}
              </button>
            ))}
          </div>
        </section>

        <section className="insight-card">
          <SectionHeader title="Related Notes" />
          <div className="mt-4 space-y-2">
            {relatedNotes.length === 0 ? (
              <p className="text-xs leading-5 text-slate-500">
                Type [[Note Title]] to connect this note to another local note.
              </p>
            ) : null}
            {relatedNotes.map((note, index) => (
              <button
                key={note.id}
                onClick={() => selectNote(note.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-left transition hover:border-lumo-violet/25 hover:bg-white/[0.06] active:scale-[0.99]"
              >
                <span
                  className={`h-5 w-5 rounded-md ${
                    index === 0 ? accentMap.violet : index === 1 ? accentMap.teal : accentMap.rose
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-300">
                  {note.title || getPlainTextPreview(note.content, 42) || "Untitled Note"}
                </span>
                <span className="text-[11px] text-slate-500">{formatRelativeTime(note.updatedAt)}</span>
              </button>
            ))}
          </div>
          <button className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 text-xs text-slate-400 transition hover:text-white active:scale-[0.99]">
            Show 3 more
          </button>
        </section>

        <section className="insight-card">
          <SectionHeader title="Linked Graph" />
          <div className="relative mt-4 h-44 overflow-hidden rounded-xl border border-white/10 bg-night-950/50">
            <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-lumo-violet/40 bg-lumo-violet/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" />
            <div className="absolute left-[24%] top-[38%] h-5 w-5 rounded-full bg-lumo-teal" />
            <div className="absolute right-[22%] top-[28%] h-5 w-5 rounded-full bg-lumo-blue" />
            <div className="absolute bottom-[24%] left-[29%] h-5 w-5 rounded-full bg-emerald-300" />
            <div className="absolute bottom-[22%] right-[26%] h-5 w-5 rounded-full bg-lumo-violet" />
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 260 190" aria-hidden="true">
              <path d="M130 95 L62 72 M130 95 L198 54 M130 95 L78 144 M130 95 L198 146" stroke="rgba(89,213,202,0.38)" strokeWidth="1.4" />
            </svg>
          </div>
        </section>
        </>
        )}
      </div>
    </aside>
  );
}

function LinkedNotesPanel({
  backlinks,
  outgoingNotes,
  unresolvedLinks,
  onCreateNote,
  onSelectNote,
}: {
  backlinks: ReturnType<typeof uniqueResolvedNotes>;
  outgoingNotes: ReturnType<typeof uniqueResolvedNotes>;
  unresolvedLinks: ReturnType<typeof resolveInternalLinks>;
  onCreateNote: (title?: string) => void;
  onSelectNote: (id: string) => void;
}) {
  const hasLinks = outgoingNotes.length > 0 || backlinks.length > 0 || unresolvedLinks.length > 0;

  return (
    <>
      {!hasLinks ? (
        <section className="insight-card">
          <h3 className="text-sm font-semibold text-white">No linked notes yet</h3>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Type [[Note Title]] in the editor to create outgoing links and backlinks.
          </p>
        </section>
      ) : null}

      <LinkSection title="Outgoing Links" empty="No outgoing links from this note.">
        {outgoingNotes.map((note) => (
          <LinkedNoteItem key={note.id} note={note} onClick={() => onSelectNote(note.id)} />
        ))}
      </LinkSection>

      <LinkSection title="Backlinks" empty="No notes link back here yet.">
        {backlinks.map((note) => (
          <LinkedNoteItem key={note.id} note={note} onClick={() => onSelectNote(note.id)} />
        ))}
      </LinkSection>

      <LinkSection title="Unresolved Links" empty="All outgoing links resolve to notes.">
        {unresolvedLinks.map((link) => (
          <button
            key={`${link.sourceNoteId}-${link.rawText}`}
            className="w-full rounded-lg border border-dashed border-lumo-blue/25 bg-lumo-blue/[0.035] px-3 py-2 text-left transition hover:border-lumo-blue/45 hover:bg-lumo-blue/[0.06] active:scale-[0.99]"
            onClick={async () => {
              if (
                await confirmDialog({
                  confirmLabel: "Create Note",
                  message: `Create a new note titled "${link.targetTitle}"?`,
                  title: "Create linked note",
                })
              ) {
                onCreateNote(link.targetTitle);
              }
            }}
          >
            <span className="block truncate text-xs font-semibold text-lumo-blue">
              {link.alias || link.targetTitle}
            </span>
            <span className="mt-1 block text-[11px] text-slate-500">Create missing note</span>
          </button>
        ))}
      </LinkSection>
    </>
  );
}

function LinkSection({
  children,
  empty,
  title,
}: {
  children: React.ReactNode;
  empty: string;
  title: string;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = Array.isArray(items) ? items.length === 0 : !items;

  return (
    <section className="insight-card">
      <SectionHeader title={title} />
      <div className="mt-4 space-y-2">
        {isEmpty ? <p className="text-xs leading-5 text-slate-500">{empty}</p> : items}
      </div>
    </section>
  );
}

function LinkedNoteItem({ note, onClick }: { note: { title: string; content: string; preview: string; folderName: string; tags: string[]; updatedAt: string }; onClick: () => void }) {
  return (
    <button
      className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-left transition hover:border-lumo-violet/25 hover:bg-white/[0.06] active:scale-[0.99]"
      onClick={onClick}
    >
      <span className="block truncate text-xs font-semibold text-slate-200">
        {note.title || getPlainTextPreview(note.content, 42) || "Untitled Note"}
      </span>
      <span className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">
        {getPlainTextPreview(note.preview || note.content, 80) || "No content yet"}
      </span>
      <span className="mt-2 inline-flex max-w-full truncate rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-400">
        {note.tags[0] ?? note.folderName} - {formatRelativeTime(note.updatedAt)}
      </span>
    </button>
  );
}
