import { SectionHeader } from "./SectionHeader";
import { useNotes } from "../store/notesStore";

const accentMap = {
  violet: "bg-lumo-violet",
  teal: "bg-lumo-teal",
  rose: "bg-rose-400",
} as const;

export function InsightsPanel() {
  const { notes, selectedNote, selectNote } = useNotes();
  const relatedNotes = notes
    .filter((note) => note.id !== selectedNote?.id && !note.isDeleted)
    .slice(0, 3);

  return (
    <aside className="column-panel hidden min-h-0 flex-col overflow-hidden xl:flex">
      <div className="flex items-center justify-between border-b border-white/10 px-4 pt-4">
        <div className="flex gap-6 text-sm font-medium">
          <button className="border-b-2 border-lumo-violet pb-3 text-white">
            Insights
          </button>
          <button className="pb-3 text-slate-400 transition hover:text-white">
            Linked Notes
          </button>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.05] hover:text-white active:scale-95">
          +
        </button>
      </div>

      <div className="scroll-area flex-1 space-y-4 overflow-y-auto p-3">
        <section className="insight-card">
          <h3 className="text-sm font-semibold text-white">Summary</h3>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            {selectedNote
              ? selectedNote.preview || "This note does not have a preview yet."
              : "Select a note to see contextual details."}
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
            ].map((point) => (
              <p key={point} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-lumo-teal" />
                <span>{point}</span>
              </p>
            ))}
          </div>
        </section>

        <section className="insight-card">
          <SectionHeader title="Related Notes" />
          <div className="mt-4 space-y-2">
            {relatedNotes.length === 0 ? (
              <p className="text-xs leading-5 text-slate-500">No related local notes yet.</p>
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
                  {note.title || "Untitled Note"}
                </span>
                <span className="text-[11px] text-slate-500">{note.folderName}</span>
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
      </div>
    </aside>
  );
}
