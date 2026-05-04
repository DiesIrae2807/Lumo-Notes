import { relatedNotes } from "../data/mockData";
import { SectionHeader } from "./SectionHeader";

const accentMap = {
  violet: "bg-lumo-violet",
  teal: "bg-lumo-teal",
  rose: "bg-rose-400",
} as const;

export function InsightsPanel() {
  return (
    <aside className="panel hidden min-h-0 flex-col overflow-hidden p-4 xl:flex">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-medium text-white">Insights</h2>
        <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.05] hover:text-white active:scale-95">
          +
        </button>
      </div>

      <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1 text-xs">
        <button className="rounded-xl px-3 py-2 text-slate-400 transition hover:text-white">
          Linked Notes
        </button>
        <button className="rounded-xl border border-lumo-teal/20 bg-lumo-teal/10 px-3 py-2 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          Summary
        </button>
      </div>

      <div className="scroll-area mt-5 flex-1 space-y-4 overflow-y-auto pr-1">
        <section className="rounded-2xl border border-lumo-teal/15 bg-lumo-teal/[0.06] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <SectionHeader title="Summary" />
          <p className="mt-4 text-sm leading-6 text-slate-300">
            Project Aurora aims to deliver a beautiful note-taking workspace with
            calm structure, fast capture, and thoughtful organization.
          </p>
          <div className="mt-5 space-y-2 text-sm text-slate-300">
            <p><span className="text-slate-500">Vision:</span> Calm, intelligent, connected</p>
            <p><span className="text-slate-500">Goals:</span> Minimal, powerful, private</p>
            <p><span className="text-slate-500">Status:</span> Planning and research</p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <SectionHeader title="Related Notes" />
          <div className="mt-4 space-y-2">
            {relatedNotes.map((note) => (
              <button
                key={note.title}
                className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-left transition hover:border-lumo-violet/25 hover:bg-white/[0.06] active:scale-[0.99]"
              >
                <span className={`h-5 w-5 rounded-md ${accentMap[note.accent]}`} />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{note.title}</span>
                <span className="text-[11px] text-slate-500">{note.time}</span>
              </button>
            ))}
          </div>
          <button className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 text-xs text-slate-400 transition hover:text-white active:scale-[0.99]">
            Show 3 more
          </button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <SectionHeader title="Linked Graph" />
          <div className="relative mt-4 h-48 overflow-hidden rounded-2xl border border-white/10 bg-night-950/50">
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
