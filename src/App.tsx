import { useEffect, useState, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Editor } from "./components/Editor";
import { InsightsPanel } from "./components/InsightsPanel";
import { GraphView } from "./components/GraphView";
import { CommandPalette } from "./components/CommandPalette";
import { NotesList } from "./components/NotesList";
import { Sidebar } from "./components/Sidebar";
import { BrandMark } from "./components/BrandMark";
import { NotesProvider } from "./store/notesStore";
import { useNotes } from "./store/notesStore";

const appWindow = getCurrentWindow();

function WindowTitleBar() {
  const startDragging = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    if ((event.target as HTMLElement).closest("button")) {
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
      <div className="flex items-center gap-3" data-tauri-drag-region onMouseDown={startDragging}>
        <BrandMark size="sm" />
        <h1 className="select-none text-sm font-semibold text-white" data-tauri-drag-region>
          Lumo <span className="text-lumo-violet">Notes</span>
        </h1>
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
        moveToTrash(selectedNote.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createNote, forceSaveSelectedNote, moveToTrash, selectedNote]);

  return null;
}

export default function App() {
  return (
    <NotesProvider>
      <AppShortcuts />
      <CommandPalette />
      <Workspace />
    </NotesProvider>
  );
}

function Workspace() {
  const { activeView } = useNotes();
  const [isFocusMode, setIsFocusMode] = useState(false);

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

  return (
      <div className="app-root min-h-[100dvh] overflow-hidden bg-night-950 text-slate-100">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute -left-24 top-12 h-80 w-80 rounded-full bg-lumo-violet/18 blur-3xl" />
          <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-lumo-teal/14 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
        </div>

        <div className="window-shell relative flex min-h-[100dvh] flex-col overflow-hidden bg-night-900/62 backdrop-blur-xl">
          <WindowTitleBar />
          <div
            className={`workspace-grid grid min-h-0 flex-1 overflow-hidden ${
              isFocusMode
                ? "grid-cols-1"
                : "grid-cols-1 lg:grid-cols-[235px_330px_minmax(460px,1fr)] xl:grid-cols-[235px_330px_minmax(520px,1fr)_280px]"
            }`}
          >
            {isFocusMode ? (
              <Editor isFocusMode onToggleFocusMode={() => setIsFocusMode(false)} />
            ) : (
              <>
                <Sidebar />
                <NotesList />
                {activeView === "graph" ? (
                  <GraphView />
                ) : (
                  <>
                    <Editor onToggleFocusMode={() => setIsFocusMode(true)} />
                    <InsightsPanel />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
  );
}
