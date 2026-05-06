import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownPreview } from "./MarkdownPreview";
import { FavoriteHeartIcon } from "./icons/FavoriteHeartIcon";
import { FocusIcon } from "./icons/FocusIcon";
import { PinIcon } from "./icons/PinIcon";
import { useNotes } from "../store/notesStore";
import { noteToMarkdown, sanitizeFilename, saveTextFile } from "../services/fileTransfer";
import { formatMetadataDate } from "../utils/date";
import { resolveInternalLink } from "../utils/links";

type MarkdownAction =
  | "bold"
  | "italic"
  | "heading"
  | "bullet"
  | "numbered"
  | "quote"
  | "code"
  | "checkbox"
  | "link";

type EditorMode = "edit" | "preview" | "split";

type EditorSnapshot = {
  content: string;
  preview: string;
  reason: "typing" | "paste" | "format" | "undo" | "redo" | "manual";
  timestamp: number;
  title: string;
};

type EditorHistory = {
  future: EditorSnapshot[];
  lastEditAt: number;
  lastReason: EditorSnapshot["reason"] | null;
  past: EditorSnapshot[];
  present: EditorSnapshot;
};

const editorTools: Array<{ label: string; action: MarkdownAction }> = [
  { label: "B", action: "bold" },
  { label: "I", action: "italic" },
  { label: "H", action: "heading" },
  { label: "Bullets", action: "bullet" },
  { label: "Numbers", action: "numbered" },
  { label: "Quote", action: "quote" },
  { label: "Code", action: "code" },
  { label: "Check", action: "checkbox" },
  { label: "Link", action: "link" },
];

const wordCount = (content: string) =>
  content.trim() ? content.trim().split(/\s+/).length : 0;

const readingMinutes = (content: string) => Math.max(1, Math.ceil(wordCount(content) / 220));
const TYPING_GROUP_MS = 950;
const HISTORY_LIMIT = 80;

const snapshotFromNote = (
  note: { title: string; preview: string; content: string },
  reason: EditorSnapshot["reason"] = "manual",
): EditorSnapshot => ({
  content: note.content,
  preview: note.preview,
  reason,
  timestamp: Date.now(),
  title: note.title,
});

const sameSnapshot = (a: EditorSnapshot, b: EditorSnapshot) =>
  a.title === b.title && a.preview === b.preview && a.content === b.content;

const appendHistory = (past: EditorSnapshot[], snapshot: EditorSnapshot) => {
  const last = past[past.length - 1];
  if (last && sameSnapshot(last, snapshot)) return past;
  return [...past, snapshot].slice(-HISTORY_LIMIT);
};

function EmptyEditor() {
  return (
    <main className="column-panel editor-glow flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="text-sm text-slate-500">No note selected</div>
      </div>
      <div className="grid flex-1 place-items-center px-8 text-center">
        <div className="max-w-sm">
          <p className="text-base font-medium text-slate-200">Select or create a note</p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Choose a note from the list, or create a new one to start editing locally.
          </p>
        </div>
      </div>
    </main>
  );
}

export function Editor({
  isFocusMode = false,
  onToggleFocusMode,
}: {
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
}) {
  const {
    addTagToSelectedNote,
    availableTags,
    activeView,
    createNote,
    createTag,
    folders,
    moveToTrash,
    notes,
    permanentlyDeleteSelectedNote,
    removeTagFromSelectedNote,
    restoreNote,
    selectedNote,
    selectNote,
    setSelectedNoteFolder,
    forceSaveSelectedNote,
    saveStatus,
    toggleFavorite,
    togglePinned,
    updateSelectedNote,
  } = useNotes();
  const [tagInput, setTagInput] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [isTypewriter, setIsTypewriter] = useState(false);
  const [wordGoal, setWordGoal] = useState("");
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const historiesRef = useRef(new Map<string, EditorHistory>());
  const forceHistoryCheckpointRef = useRef(false);

  const publishHistoryState = useCallback((history: EditorHistory | null) => {
    window.dispatchEvent(
      new CustomEvent("lumo-editor-history-state", {
        detail: {
          canRedo: Boolean(history?.future.length),
          canUndo: Boolean(history?.past.length),
        },
      }),
    );
  }, []);

  const ensureHistory = useCallback(
    (note: NonNullable<typeof selectedNote>) => {
      const snapshot = snapshotFromNote(note);
      const existing = historiesRef.current.get(note.id);

      if (!existing) {
        const history: EditorHistory = {
          future: [],
          lastEditAt: 0,
          lastReason: null,
          past: [],
          present: snapshot,
        };
        historiesRef.current.set(note.id, history);
        publishHistoryState(history);
        return history;
      }

      if (!sameSnapshot(existing.present, snapshot)) {
        existing.present = snapshot;
      }

      publishHistoryState(existing);
      return existing;
    },
    [publishHistoryState, selectedNote],
  );

  const finishHistoryChunk = useCallback(() => {
    if (!selectedNote) return;
    const history = ensureHistory(selectedNote);
    history.lastEditAt = 0;
    history.lastReason = null;
    publishHistoryState(history);
  }, [ensureHistory, publishHistoryState, selectedNote]);

  const applyEditorChange = useCallback(
    (
      changes: Partial<Pick<EditorSnapshot, "title" | "preview" | "content">>,
      reason: EditorSnapshot["reason"] = "typing",
      options: { forceCheckpoint?: boolean } = {},
    ) => {
      if (!selectedNote) return;

      const history = ensureHistory(selectedNote);
      const now = Date.now();
      const nextSnapshot: EditorSnapshot = {
        ...history.present,
        ...changes,
        reason,
        timestamp: now,
      };

      if (sameSnapshot(history.present, nextSnapshot)) {
        return;
      }

      const shouldCheckpoint =
        options.forceCheckpoint ||
        forceHistoryCheckpointRef.current ||
        reason !== "typing" ||
        history.lastReason !== "typing" ||
        now - history.lastEditAt > TYPING_GROUP_MS;

      if (shouldCheckpoint) {
        history.past = appendHistory(history.past, history.present);
        history.future = [];
      }

      history.present = nextSnapshot;
      history.lastEditAt = now;
      history.lastReason = reason;
      forceHistoryCheckpointRef.current = false;
      publishHistoryState(history);
      updateSelectedNote(changes);
    },
    [ensureHistory, publishHistoryState, selectedNote, updateSelectedNote],
  );

  const undoEditor = useCallback(() => {
    if (!selectedNote) return;
    const history = ensureHistory(selectedNote);
    const previous = history.past[history.past.length - 1];
    if (!previous) return;

    history.past = history.past.slice(0, -1);
    history.future = [history.present, ...history.future].slice(0, HISTORY_LIMIT);
    history.present = { ...previous, reason: "undo", timestamp: Date.now() };
    history.lastEditAt = 0;
    history.lastReason = null;
    publishHistoryState(history);
    updateSelectedNote({
      content: previous.content,
      preview: previous.preview,
      title: previous.title,
    });
  }, [ensureHistory, publishHistoryState, selectedNote, updateSelectedNote]);

  const redoEditor = useCallback(() => {
    if (!selectedNote) return;
    const history = ensureHistory(selectedNote);
    const next = history.future[0];
    if (!next) return;

    history.future = history.future.slice(1);
    history.past = appendHistory(history.past, history.present);
    history.present = { ...next, reason: "redo", timestamp: Date.now() };
    history.lastEditAt = 0;
    history.lastReason = null;
    publishHistoryState(history);
    updateSelectedNote({
      content: next.content,
      preview: next.preview,
      title: next.title,
    });
  }, [ensureHistory, publishHistoryState, selectedNote, updateSelectedNote]);

  useEffect(() => {
    const focusEditor = () => {
      setEditorMode("edit");
      window.setTimeout(() => bodyRef.current?.focus(), 0);
    };
    const setMode = (event: Event) => {
      const mode = (event as CustomEvent<EditorMode>).detail;
      if (mode === "edit" || mode === "preview" || mode === "split") {
        setEditorMode(mode);
      }
    };

    window.addEventListener("lumo-focus-editor", focusEditor);
    window.addEventListener("lumo-set-editor-mode", setMode);
    return () => {
      window.removeEventListener("lumo-focus-editor", focusEditor);
      window.removeEventListener("lumo-set-editor-mode", setMode);
    };
  }, []);

  useEffect(() => {
    if (selectedNote) {
      ensureHistory(selectedNote);
    } else {
      publishHistoryState(null);
    }
  }, [ensureHistory, publishHistoryState, selectedNote]);

  useEffect(() => {
    const undo = () => undoEditor();
    const redo = () => redoEditor();
    const state = historiesRef.current.get(selectedNote?.id ?? "") ?? null;
    publishHistoryState(state);

    window.addEventListener("lumo-editor-undo", undo);
    window.addEventListener("lumo-editor-redo", redo);
    return () => {
      window.removeEventListener("lumo-editor-undo", undo);
      window.removeEventListener("lumo-editor-redo", redo);
    };
  }, [publishHistoryState, redoEditor, selectedNote?.id, undoEditor]);

  if (!selectedNote) {
    return <EmptyEditor />;
  }

  const submitTag = () => {
    const name = tagInput.trim();
    if (!name) return;
    createTag(name);
    addTagToSelectedNote(name);
    setTagInput("");
  };

  const confirmPermanentDelete = () => {
    if (window.confirm("Permanently delete this note? This cannot be undone.")) {
      permanentlyDeleteSelectedNote();
    }
  };

  const openInternalLink = (title: string) => {
    const linkedNote = resolveInternalLink(title, notes, activeView === "trash");

    if (linkedNote) {
      selectNote(linkedNote.id);
      return;
    }

    if (window.confirm(`Create a new note titled "${title}"?`)) {
      createNote(title);
    }
  };

  const isInternalLinkResolved = (title: string) =>
    Boolean(resolveInternalLink(title, notes, activeView === "trash"));

  const exportSelectedNote = async () => {
    const filename = `${sanitizeFilename(selectedNote.title)}.md`;
    try {
      await saveTextFile("Export selected note", filename, noteToMarkdown(selectedNote));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const keepCursorCentered = (textarea: HTMLTextAreaElement) => {
    if (!isTypewriter || !isFocusMode) return;

    window.requestAnimationFrame(() => {
      const valueBeforeCursor = textarea.value.slice(0, textarea.selectionStart);
      const lineIndex = valueBeforeCursor.split("\n").length - 1;
      const lineHeight = 32;
      textarea.scrollTop = Math.max(0, lineIndex * lineHeight - textarea.clientHeight / 2);
    });
  };

  const insertMarkdown = (action: MarkdownAction) => {
    const textarea = bodyRef.current;
    if (!textarea) {
      const fallback = {
        bold: "**bold text**",
        italic: "*italic text*",
        heading: "## Heading",
        bullet: "- List item",
        numbered: "1. List item",
        quote: "> Quote",
        code: "`code`",
        checkbox: "- [ ] Task",
        link: "[[Linked note placeholder]]",
      } satisfies Record<MarkdownAction, string>;

      const separator = selectedNote.content.trim() ? "\n\n" : "";
      applyEditorChange(
        { content: `${selectedNote.content}${separator}${fallback[action]}` },
        "format",
        { forceCheckpoint: true },
      );
      setEditorMode("edit");
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentContent = textarea.value;
    const selected = currentContent.slice(start, end);
    let insertion = selected;
    let nextSelectionStart = start;
    let nextSelectionEnd = start;
    const isAtLineStart = start === 0 || currentContent[start - 1] === "\n";

    const linePrefix = (prefix: string) => {
      const fallback = selected || "List item";
      return fallback
        .split("\n")
        .map((line) => `${prefix}${line || " "}`)
        .join("\n");
    };

    const normalizeBlockInsertion = (value: string) => (isAtLineStart ? value : `\n${value}`);

    switch (action) {
      case "bold":
        insertion = `**${selected || "bold text"}**`;
        nextSelectionStart = start + 2;
        nextSelectionEnd = nextSelectionStart + (selected || "bold text").length;
        break;
      case "italic":
        insertion = `*${selected || "italic text"}*`;
        nextSelectionStart = start + 1;
        nextSelectionEnd = nextSelectionStart + (selected || "italic text").length;
        break;
      case "heading":
        insertion = `## ${selected || "Heading"}`;
        nextSelectionStart = start + 3;
        nextSelectionEnd = nextSelectionStart + (selected || "Heading").length;
        break;
      case "bullet":
        insertion = normalizeBlockInsertion(linePrefix("- "));
        break;
      case "numbered":
        insertion = normalizeBlockInsertion(
          (selected || "List item")
            .split("\n")
            .map((line, index) => `${index + 1}. ${line || " "}`)
            .join("\n"),
        );
        break;
      case "quote":
        insertion = linePrefix("> ");
        break;
      case "code":
        insertion = selected.includes("\n")
          ? `\`\`\`\n${selected || "code"}\n\`\`\``
          : `\`${selected || "code"}\``;
        break;
      case "checkbox":
        insertion = normalizeBlockInsertion(linePrefix("- [ ] "));
        break;
      case "link":
        insertion = `[[${selected || "Linked note placeholder"}]]`;
        nextSelectionStart = start + 2;
        nextSelectionEnd = nextSelectionStart + (selected || "Linked note placeholder").length;
        break;
    }

    const nextContent = currentContent.slice(0, start) + insertion + currentContent.slice(end);

    textarea.focus();
    textarea.setRangeText(insertion, start, end, "end");
    applyEditorChange({ content: nextContent }, "format", { forceCheckpoint: true });

    keepCursorCentered(textarea);

    window.setTimeout(() => {
      textarea.focus();
      if (nextSelectionStart === start && nextSelectionEnd === start) {
        textarea.setSelectionRange(start + insertion.length, start + insertion.length);
      } else {
        textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
      }
    }, 0);
  };

  const handleHistoryKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const key = event.key.toLowerCase();

    if (event.ctrlKey && key === "z" && !event.shiftKey) {
      event.preventDefault();
      undoEditor();
      return true;
    }

    if (event.ctrlKey && (key === "y" || (event.shiftKey && key === "z"))) {
      event.preventDefault();
      redoEditor();
      return true;
    }

    if (key === "enter") {
      forceHistoryCheckpointRef.current = true;
    }

    if (key === "backspace" || key === "delete") {
      const target = event.currentTarget;
      const selectionStart = target.selectionStart ?? 0;
      const selectionEnd = target.selectionEnd ?? selectionStart;
      if (Math.abs(selectionEnd - selectionStart) > 1) {
        forceHistoryCheckpointRef.current = true;
      }
    }

    return false;
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleHistoryKeyDown(event) || !event.ctrlKey) return;

    const key = event.key.toLowerCase();

    if (key === "b") {
      event.preventDefault();
      insertMarkdown("bold");
    } else if (key === "i") {
      event.preventDefault();
      insertMarkdown("italic");
    } else if (event.shiftKey && key === "k") {
      event.preventDefault();
      insertMarkdown("link");
    }
  };

  const currentWordCount = wordCount(selectedNote.content);
  const numericWordGoal = Number(wordGoal);
  const goalProgress =
    Number.isFinite(numericWordGoal) && numericWordGoal > 0
      ? Math.min(100, Math.round((currentWordCount / numericWordGoal) * 100))
      : null;
  const compactTags = selectedNote.tags.length > 0 ? selectedNote.tags.join(" · ") : "No tags";
  const updatedLabel = formatMetadataDate(selectedNote.updatedAt);

  return (
    <main
      className={`column-panel editor-glow flex min-h-0 flex-col overflow-hidden ${
        isFocusMode ? "focus-editor" : ""
      }`}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex min-w-0 items-center gap-2 text-sm text-slate-400">
          <span className="h-2 w-2 shrink-0 rounded-full bg-lumo-blue" />
          <span className="truncate">{selectedNote.folderName}</span>
          <span>/</span>
          <span className="truncate font-medium text-lumo-violet">
            {selectedNote.title || "Untitled Note"}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <span
            className={`mr-2 rounded-lg px-2 py-1 ${
              saveStatus === "saving" || saveStatus === "dirty"
                ? "text-lumo-teal"
                : saveStatus === "error"
                  ? "text-rose-300"
                  : "text-slate-500"
            }`}
          >
            {saveStatus === "saving" || saveStatus === "dirty"
              ? "Saving..."
              : saveStatus === "error"
                ? "Save failed"
                : "Saved"}
          </span>
          <button
            className={`grid h-8 w-8 place-items-center rounded-lg transition duration-150 hover:bg-white/[0.05] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lumo-violet/60 ${
              selectedNote.isFavorite ? "text-[#FF4D6D]" : "text-slate-500 hover:text-[#FF8A9A]"
            }`}
            onClick={() => toggleFavorite(selectedNote.id)}
            title={selectedNote.isFavorite ? "Remove favorite" : "Favorite"}
            aria-label={selectedNote.isFavorite ? "Remove favorite" : "Favorite note"}
            aria-pressed={selectedNote.isFavorite}
          >
            <FavoriteHeartIcon active={selectedNote.isFavorite} />
          </button>
          <button
            className={`grid h-8 w-8 place-items-center rounded-lg transition duration-150 hover:bg-white/[0.05] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lumo-teal/60 ${
              selectedNote.isPinned ? "text-lumo-teal" : "text-slate-500 hover:text-lumo-teal"
            }`}
            onClick={() => togglePinned(selectedNote.id)}
            title={selectedNote.isPinned ? "Unpin" : "Pin"}
            aria-label={selectedNote.isPinned ? "Unpin note" : "Pin note"}
            aria-pressed={selectedNote.isPinned}
          >
            <PinIcon active={selectedNote.isPinned} />
          </button>
          <button
            className={`grid h-8 w-8 place-items-center rounded-lg transition duration-150 hover:bg-white/[0.05] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lumo-violet/60 ${
              isFocusMode ? "text-lumo-violet" : "text-slate-500 hover:text-lumo-violet"
            }`}
            onClick={onToggleFocusMode}
            title={isFocusMode ? "Exit focus mode" : "Focus mode"}
            aria-label={isFocusMode ? "Exit focus mode" : "Enter focus mode"}
            aria-pressed={isFocusMode}
          >
            <FocusIcon active={isFocusMode} />
          </button>
          {selectedNote.isDeleted ? (
            <>
              <button
                className="rounded-lg px-3 py-1.5 text-slate-300 transition hover:bg-white/[0.05] hover:text-white active:scale-95"
                onClick={() => restoreNote(selectedNote.id)}
              >
                Restore
              </button>
              <button
                className="rounded-lg px-3 py-1.5 text-rose-300 transition hover:bg-rose-400/10 hover:text-rose-100 active:scale-95"
                onClick={confirmPermanentDelete}
              >
                Delete Permanently
              </button>
            </>
          ) : (
            <div className="relative">
              <button
                className="grid h-8 w-8 place-items-center rounded-lg transition hover:bg-white/[0.05] hover:text-slate-300 active:scale-95"
                onClick={() => setIsOverflowOpen((current) => !current)}
                title="More actions"
              >
                ...
              </button>
              {isOverflowOpen ? (
                <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-white/10 bg-night-900/95 p-1.5 shadow-[0_16px_50px_rgba(0,0,0,0.35)]">
                  <button
                    className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                    onClick={() => {
                      setIsOverflowOpen(false);
                      void exportSelectedNote();
                    }}
                  >
                    Export Markdown
                  </button>
                  <button
                    className="w-full rounded-lg px-3 py-2 text-left text-xs text-rose-300 transition hover:bg-rose-400/10 hover:text-rose-100"
                    onClick={() => {
                      setIsOverflowOpen(false);
                      moveToTrash(selectedNote.id);
                    }}
                  >
                    Move to Trash
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <article className="scroll-area flex-1 overflow-y-auto px-6 py-7 md:px-8">
        <div className={`mx-auto ${isFocusMode ? "max-w-5xl" : "max-w-3xl"}`}>
          {isFocusMode ? (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 text-xs text-slate-400">
              <div className="flex flex-wrap items-center gap-4">
                <span>{currentWordCount} words</span>
                <span>{selectedNote.content.length} chars</span>
                <span>{readingMinutes(selectedNote.content)} min read</span>
                {goalProgress !== null ? <span>{goalProgress}% of goal</span> : null}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isTypewriter}
                    onChange={(event) => setIsTypewriter(event.target.checked)}
                  />
                  Typewriter
                </label>
                <input
                  className="h-8 w-28 rounded-lg border border-white/10 bg-night-950/60 px-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-lumo-teal/40"
                  value={wordGoal}
                  onChange={(event) => setWordGoal(event.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Word goal"
                />
              </div>
            </div>
          ) : null}

          <div className="mb-7">
            <div className="mb-4 grid h-7 w-7 place-items-center text-xl text-lumo-violet">
              *
            </div>
            <input
              className="w-full border-none bg-transparent text-3xl font-semibold tracking-tight text-white outline-none placeholder:text-slate-600 md:text-4xl"
              value={selectedNote.title}
              onChange={(event) => applyEditorChange({ title: event.target.value }, "typing")}
              onBlur={() => {
                finishHistoryChunk();
                forceSaveSelectedNote();
              }}
              onCut={() => {
                forceHistoryCheckpointRef.current = true;
              }}
              onKeyDown={handleHistoryKeyDown}
              onPaste={() => {
                forceHistoryCheckpointRef.current = true;
              }}
              placeholder="Untitled Note"
            />
            <input
              className="mt-3 w-full border-none bg-transparent text-base text-slate-300 outline-none placeholder:text-slate-600"
              value={selectedNote.preview}
              onChange={(event) => applyEditorChange({ preview: event.target.value }, "typing")}
              onBlur={() => {
                finishHistoryChunk();
                forceSaveSelectedNote();
              }}
              onCut={() => {
                forceHistoryCheckpointRef.current = true;
              }}
              onKeyDown={handleHistoryKeyDown}
              onPaste={() => {
                forceHistoryCheckpointRef.current = true;
              }}
              placeholder="Short preview or subtitle"
            />
            <button
              className="mt-4 inline-flex max-w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-xs text-slate-500 transition hover:text-slate-300"
              onClick={() => setIsMetadataOpen((current) => !current)}
            >
              <span className="truncate">
                {selectedNote.folderName || "Uncategorized"} · {compactTags}
              </span>
              <span>{isMetadataOpen ? "Hide" : "Edit"}</span>
            </button>

            {isMetadataOpen ? (
              <div className="mt-3 grid gap-3 rounded-xl bg-white/[0.025] p-3 md:grid-cols-[220px_1fr]">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Folder
                  </span>
                  <select
                    className="h-10 w-full rounded-lg border border-white/10 bg-night-950/70 px-3 text-sm text-slate-200 outline-none focus:border-lumo-teal/40"
                    value={selectedNote.folderId}
                    onChange={(event) => setSelectedNoteFolder(event.target.value)}
                  >
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Tags
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedNote.tags.length === 0 ? (
                      <span className="rounded-lg border border-dashed border-white/10 px-2.5 py-1.5 text-xs text-slate-500">
                        No tags
                      </span>
                    ) : null}
                    {selectedNote.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300"
                      >
                        {tag}
                        <button
                          className="text-slate-500 transition hover:text-rose-200"
                          onClick={() => removeTagFromSelectedNote(tag)}
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      className="h-9 flex-1 rounded-lg border border-white/10 bg-night-950/70 px-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-lumo-teal/40"
                      value={tagInput}
                      onChange={(event) => setTagInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          submitTag();
                        }
                      }}
                      list="lumo-note-tags"
                      placeholder="Add tag"
                    />
                    <datalist id="lumo-note-tags">
                      {availableTags.map((tag) => (
                        <option key={tag} value={tag} />
                      ))}
                    </datalist>
                    <button
                      className="rounded-lg border border-white/10 px-3 text-sm text-slate-300 transition hover:border-lumo-teal/30 hover:text-white"
                      onClick={submitTag}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {editorMode === "preview" ? (
            <MarkdownPreview
              content={selectedNote.content}
              onInternalLinkClick={openInternalLink}
              isInternalLinkResolved={isInternalLinkResolved}
            />
          ) : editorMode === "split" ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <textarea
                ref={bodyRef}
                className={`min-h-[420px] w-full resize-none rounded-xl border border-white/10 bg-night-950/20 p-4 text-base leading-8 text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-lumo-teal/35 focus:bg-night-950/35 ${
                  isFocusMode && isTypewriter ? "focus-typewriter-textarea" : ""
                }`}
                value={selectedNote.content}
                onChange={(event) => {
                  applyEditorChange({ content: event.target.value }, "typing");
                  keepCursorCentered(event.target);
                }}
                onBlur={() => {
                  finishHistoryChunk();
                  forceSaveSelectedNote();
                }}
                onCut={() => {
                  forceHistoryCheckpointRef.current = true;
                }}
                onKeyDown={handleEditorKeyDown}
                onPaste={() => {
                  forceHistoryCheckpointRef.current = true;
                }}
                placeholder="Start writing..."
              />
              <MarkdownPreview
                content={selectedNote.content}
                onInternalLinkClick={openInternalLink}
                isInternalLinkResolved={isInternalLinkResolved}
              />
            </div>
          ) : (
            <textarea
              ref={bodyRef}
              className={`min-h-[420px] w-full resize-none rounded-xl border border-white/10 bg-night-950/20 p-4 text-base leading-8 text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-lumo-teal/35 focus:bg-night-950/35 ${
                isFocusMode && isTypewriter ? "focus-typewriter-textarea" : ""
              }`}
              value={selectedNote.content}
              onChange={(event) => {
                applyEditorChange({ content: event.target.value }, "typing");
                keepCursorCentered(event.target);
              }}
              onBlur={() => {
                finishHistoryChunk();
                forceSaveSelectedNote();
              }}
              onCut={() => {
                forceHistoryCheckpointRef.current = true;
              }}
              onKeyDown={handleEditorKeyDown}
              onPaste={() => {
                forceHistoryCheckpointRef.current = true;
              }}
              placeholder="Start writing..."
            />
          )}

        </div>
      </article>

      <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 text-slate-400">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl bg-night-950/35 p-1 text-xs text-slate-400">
            {(["edit", "preview", "split"] as const).map((mode) => (
              <button
                key={mode}
                className={`rounded-lg px-2.5 py-1.5 capitalize transition active:scale-95 ${
                  editorMode === mode
                    ? "bg-lumo-violet/20 text-white"
                    : "hover:bg-white/[0.05] hover:text-slate-200"
                }`}
                onClick={() => setEditorMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
          {editorTools.map((tool) => (
            <button
              key={tool.action}
              className="rounded-lg px-3 py-2 text-xs transition hover:bg-white/[0.05] hover:text-white active:scale-95"
              onClick={() => insertMarkdown(tool.action)}
            >
              {tool.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-300">
          Updated {updatedLabel} · {currentWordCount} words
        </span>
      </div>
    </main>
  );
}
