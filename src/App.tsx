import { Editor } from "./components/Editor";
import { InsightsPanel } from "./components/InsightsPanel";
import { NotesList } from "./components/NotesList";
import { Sidebar } from "./components/Sidebar";
import { BrandMark } from "./components/BrandMark";

function MobileHeader() {
  return (
    <header className="mb-4 flex items-center justify-between lg:hidden">
      <div className="flex items-center gap-3">
        <BrandMark size="sm" />
        <div>
          <h1 className="text-base font-semibold text-white">Lumo Notes</h1>
          <p className="text-xs text-slate-400">Thoughts. Organized. Illuminated.</p>
        </div>
      </div>
      <button className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300">
        Menu
      </button>
    </header>
  );
}

export default function App() {
  return (
    <div className="min-h-[100dvh] overflow-hidden bg-night-950 text-slate-100">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -left-24 top-12 h-80 w-80 rounded-full bg-lumo-violet/18 blur-3xl" />
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-lumo-teal/14 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[100dvh] max-w-[1580px] flex-col p-4 md:p-5">
        <MobileHeader />
        <div className="window-shell grid flex-1 min-h-0 grid-cols-1 gap-3 overflow-hidden rounded-[28px] border border-white/15 bg-night-900/60 p-3 shadow-[0_30px_120px_-70px_rgba(89,213,202,0.55)] backdrop-blur-xl lg:grid-cols-[240px_minmax(280px,340px)_minmax(440px,1fr)] xl:grid-cols-[240px_minmax(300px,360px)_minmax(480px,1fr)_300px]">
          <Sidebar />
          <NotesList />
          <Editor />
          <InsightsPanel />
        </div>
      </div>
    </div>
  );
}
