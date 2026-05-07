import { useEffect, useState, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Editor } from "./components/Editor";
import { InsightsPanel } from "./components/InsightsPanel";
import { GraphView } from "./components/GraphView";
import { CommandPalette } from "./components/CommandPalette";
import { NotesList } from "./components/NotesList";
import { SettingsScreen } from "./components/SettingsScreen";
import { Sidebar } from "./components/Sidebar";
import { BrandMark } from "./components/BrandMark";
import { InsightsIcon } from "./components/icons/InsightsIcon";
import { TopMenuBar } from "./components/TopMenuBar";
import { ToastProvider } from "./components/ToastProvider";
import { ConfirmProvider } from "./components/ConfirmProvider";
import { NotesProvider } from "./store/notesStore";
import { SettingsProvider } from "./store/settingsStore";
import { useNotes } from "./store/notesStore";
import { confirmDialog } from "./utils/confirm";

const appWindow = getCurrentWindow();

function WindowTitleBar() {
  const startDragging = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    if ((event.target as HTMLElement).closest("button, [data-menu-root='true']")) {
      return;
    }

    void appWindow.startDragging();
  };

  const stopWindowControlEvent = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const minimize = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void appWindow.minimize();
  };

  const toggleMaximize = () => {
    void appWindow.toggleMaximize();
  };

  const toggleMaximizeFromButton = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void appWindow.toggleMaximize();
  };

  const close = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void appWindow.close();
  };

  return (
    <header
      className="custom-titlebar flex h-12 shrink-0 items-center justify-between border-b border-white/[0.08] px-4"
      data-tauri-drag-region
      onMouseDown={startDragging}
      onDoubleClick={toggleMaximize}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3" data-tauri-drag-region onMouseDown={startDragging}>
          <BrandMark size="sm" />
          <h1 className="select-none text-sm font-semibold text-white" data-tauri-drag-region>
            Lumo <span className="text-lumo-teal">Notes</span>
          </h1>
        </div>
        <TopMenuBar onExit={() => void appWindow.close()} />
      </div>
      <div className="flex items-center text-slate-300">
        <button
          className="window-control"
          type="button"
          aria-label="Minimize window"
          onMouseDown={stopWindowControlEvent}
          onDoubleClick={stopWindowControlEvent}
          onClick={minimize}
        >
          <span className="h-px w-3.5 bg-current" />
        </button>
        <button
          className="window-control"
          type="button"
          aria-label="Maximize or restore window"
          onMouseDown={stopWindowControlEvent}
          onDoubleClick={stopWindowControlEvent}
          onClick={toggleMaximizeFromButton}
        >
          <span className="h-3 w-3 rounded-[2px] border border-current" />
        </button>
        <button
          className="window-control window-control-close"
          type="button"
          aria-label="Close window"
          onMouseDown={stopWindowControlEvent}
          onDoubleClick={stopWindowControlEvent}
          onClick={close}
        >
          <span className="relative h-4 w-4">
            <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 rotate-45 bg-current" />
            <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 -rotate-45 bg-current" />
          </span>
        </button>
      </div>
    </header>
  );
}

function AppShortcuts() {
  const { createNote, forceSaveSelectedNote, moveToTrash, selectedNote } = useNotes();

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "n") {
        event.preventDefault();
        createNote();
        return;
      }

      if (key === "k" && !event.shiftKey) {
        event.preventDefault();
        window.dispatchEvent(new Event("lumo-open-command-palette"));
        return;
      }

      if (key === "f" && event.shiftKey) {
        event.preventDefault();
        window.dispatchEvent(new Event("lumo-toggle-focus-mode"));
        return;
      }

      if (key === "f") {
        event.preventDefault();
        window.dispatchEvent(new Event("lumo-focus-search"));
        return;
      }

      if (key === "s") {
        event.preventDefault();
        forceSaveSelectedNote();
        return;
      }

      if (event.key === "Delete" && !isTypingTarget(event.target) && selectedNote && !selectedNote.isDeleted) {
        event.preventDefault();
        void (async () => {
          if (
            await confirmDialog({
              confirmLabel: "Move to Trash",
              message: "Move this note to Trash? You can restore it later from Trash.",
              title: "Move note to Trash",
              variant: "danger",
            })
          ) {
            moveToTrash(selectedNote.id);
          }
        })();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createNote, forceSaveSelectedNote, moveToTrash, selectedNote]);

  return null;
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <SettingsProvider>
          <NotesProvider>
            <AppShortcuts />
            <CommandPalette />
            <Workspace />
          </NotesProvider>
        </SettingsProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

function Workspace() {
  const { activeView, databaseError, notes, searchQuery } = useNotes();
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const isSettingsView = activeView === "settings";
  const showFirstRun =
    activeView === "all" &&
    searchQuery.trim().length === 0 &&
    !notes.some((note) => !note.isDeleted);

  useEffect(() => {
    const toggleFocusMode = () => setIsFocusMode((current) => !current);
    const exitFocusMode = () => setIsFocusMode(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        isFocusMode &&
        !document.querySelector("[data-command-palette='true']")
      ) {
        event.preventDefault();
        setIsFocusMode(false);
      }
    };

    window.addEventListener("lumo-toggle-focus-mode", toggleFocusMode);
    window.addEventListener("lumo-exit-focus-mode", exitFocusMode);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("lumo-toggle-focus-mode", toggleFocusMode);
      window.removeEventListener("lumo-exit-focus-mode", exitFocusMode);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isFocusMode]);

  useEffect(() => {
    if (isSettingsView) {
      setIsFocusMode(false);
    }
  }, [isSettingsView]);

  return (
      <div className="app-root min-h-[100dvh] overflow-hidden bg-night-950 text-slate-100">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute -left-24 top-12 h-80 w-80 rounded-full bg-lumo-violet/18 blur-3xl" />
          <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-lumo-teal/14 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-lumo-blue/10 blur-3xl" />
        </div>

        <div className="window-shell relative flex min-h-[100dvh] flex-col overflow-hidden bg-night-900/62 backdrop-blur-xl">
          <WindowTitleBar />
          {databaseError ? (
            <div className="border-b border-rose-400/20 bg-rose-400/[0.06] px-4 py-2 text-xs text-rose-100">
              Local storage warning: {databaseError}
            </div>
          ) : null}
          <div
            className={`workspace-grid grid min-h-0 flex-1 overflow-hidden ${
              isFocusMode
                ? "grid-cols-1"
                : isSettingsView
                  ? "grid-cols-1 lg:grid-cols-[235px_minmax(0,1fr)]"
                : isInsightsOpen
                  ? "grid-cols-1 lg:grid-cols-[235px_330px_minmax(460px,1fr)] xl:grid-cols-[235px_330px_minmax(520px,1fr)_280px]"
                  : "grid-cols-1 lg:grid-cols-[235px_330px_minmax(460px,1fr)_48px]"
            }`}
          >
            {isFocusMode ? (
              <Editor isFocusMode onToggleFocusMode={() => setIsFocusMode(false)} />
            ) : (
              <>
                <Sidebar />
                {isSettingsView ? (
                  <SettingsScreen />
                ) : activeView === "graph" ? (
                  <>
                    <NotesList />
                    <GraphView />
                  </>
                ) : showFirstRun ? (
                  <>
                    <NotesList />
                    <FirstRunWelcome />
                    {isInsightsOpen ? (
                      <InsightsPanel onCollapse={() => setIsInsightsOpen(false)} />
                    ) : (
                      <InsightsRail onOpen={() => setIsInsightsOpen(true)} />
                    )}
                  </>
                ) : (
                  <>
                    <NotesList />
                    <Editor onToggleFocusMode={() => setIsFocusMode(true)} />
                    {isInsightsOpen ? (
                      <InsightsPanel onCollapse={() => setIsInsightsOpen(false)} />
                    ) : (
                      <InsightsRail onOpen={() => setIsInsightsOpen(true)} />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
  );
}

function FirstRunWelcome() {
  const { createNote } = useNotes();

  return (
    <main className="column-panel editor-glow grid min-h-0 place-items-center px-6">
      <section className="max-w-lg text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-lumo-violet/15 shadow-[0_0_40px_rgba(156,124,244,0.18)]">
          <BrandMark size="md" />
        </div>
        <p className="text-sm font-medium text-lumo-teal">Lumo Notes</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Thoughts. Organized. Illuminated.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-400">
          A local-first note-taking workspace for writing, linking, and keeping your notes on this device.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button
            className="rounded-xl bg-lumo-violet px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-lumo-violet/90 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lumo-violet/50"
            onClick={() => createNote()}
          >
            Create your first note
          </button>
          <button
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.07] hover:text-white active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lumo-violet/50"
            onClick={() => window.dispatchEvent(new Event("lumo-open-command-palette"))}
          >
            Import or restore
          </button>
        </div>
      </section>
    </main>
  );
}

function InsightsRail({ onOpen }: { onOpen: () => void }) {
  return (
    <aside className="column-panel hidden min-h-0 items-center border-l border-white/[0.06] px-2 py-4 lg:flex">
      <button
        className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.035] text-slate-400 transition duration-150 hover:bg-lumo-violet/15 hover:text-white active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lumo-violet/60"
        onClick={onOpen}
        aria-label="Open Insights"
        title="Open Insights"
      >
        <InsightsIcon />
      </button>
    </aside>
  );
}
