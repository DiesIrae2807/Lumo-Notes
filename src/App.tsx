import { Editor } from "./components/Editor";
import { InsightsPanel } from "./components/InsightsPanel";
import { NotesList } from "./components/NotesList";
import { Sidebar } from "./components/Sidebar";
import { BrandMark } from "./components/BrandMark";

function WindowTitleBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] px-6">
      <div className="flex items-center gap-3">
        <BrandMark size="sm" />
        <h1 className="text-base font-semibold text-white">
          Lumo <span className="text-lumo-violet">Notes</span>
        </h1>
      </div>
      <div className="hidden items-center gap-6 text-slate-300 md:flex">
        <span className="h-px w-4 bg-slate-300" />
        <span className="h-3.5 w-3.5 rounded-sm border border-slate-300" />
        <span className="relative h-4 w-4">
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 rotate-45 bg-slate-300" />
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 -rotate-45 bg-slate-300" />
        </span>
      </div>
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

      <div className="relative mx-auto grid min-h-[100dvh] place-items-center p-4 md:p-5">
        <div className="window-shell flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-white/20 bg-night-900/62 shadow-[0_30px_120px_-62px_rgba(89,213,202,0.45)] backdrop-blur-xl">
          <WindowTitleBar />
          <div className="workspace-grid grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[235px_330px_minmax(460px,1fr)] xl:grid-cols-[235px_330px_minmax(520px,1fr)_280px]">
            <Sidebar />
            <NotesList />
            <Editor />
            <InsightsPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
