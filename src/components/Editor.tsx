import { useCallback, useEffect, useRef, useState } from "react";
import {
  RichTextEditor,
  insertInternalRichTextLink,
  runRichTextAction,
  type RichTextAction,
  type RichTextLinkRequest,
} from "./RichTextEditor";
import { RichTextPreview } from "./RichTextPreview";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { FavoriteHeartIcon } from "./icons/FavoriteHeartIcon";
import { FocusIcon } from "./icons/FocusIcon";
import { PinIcon } from "./icons/PinIcon";
import { useNotes } from "../store/notesStore";
import { useSettings } from "../store/settingsStore";
import { noteToMarkdown, sanitizeFilename, saveTextFile } from "../services/fileTransfer";
import { formatMetadataDate } from "../utils/date";
import { resolveInternalLink } from "../utils/links";
import { notify, notifyError } from "../utils/toast";
import { confirmDialog } from "../utils/confirm";

type MarkdownAction =
  RichTextAction;

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
  { label: "Accent H", action: "accentHeading" },
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

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
};

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
    attachFileToSelectedNote,
    availableTags,
    activeView,
    createNote,
    createTag,
    folders,
    moveToTrash,
    notes,
    permanentlyDeleteSelectedNote,
    openAttachment,
    removeTagFromSelectedNote,
    removeAttachment,
    restoreNote,
    selectedNote,
    selectedNoteAttachments,
    selectNote,
    setSelectedNoteFolder,
    forceSaveSelectedNote,
    saveStatus,
    toggleFavorite,
    togglePinned,
    updateSelectedNote,
  } = useNotes();
  const { settings } = useSettings();
  const [tagInput, setTagInput] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>(settings.defaultEditorMode);
  const [isTypewriter, setIsTypewriter] = useState(false);
  const [isAttachmentBusy, setIsAttachmentBusy] = useState(false);
  const [wordGoal, setWordGoal] = useState("");
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{
    displayText: string;
    isOpen: boolean;
    title: string;
  }>({ displayText: "", isOpen: false, title: "" });
  const richEditorRef = useRef<TiptapEditor | null>(null);
  const linkTitleInputRef = useRef<HTMLInputElement | null>(null);
  const historiesRef = useRef(new Map<string, EditorHistory>());
  const forceHistoryCheckpointRef = useRef(false);
  const [richToolbarState, setRichToolbarState] = useState<Record<string, boolean>>({});

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
    setEditorMode(settings.defaultEditorMode);
  }, [selectedNote?.id, settings.defaultEditorMode]);

  useEffect(() => {
    const focusEditor = () => {
      setEditorMode("edit");
      window.setTimeout(() => richEditorRef.current?.commands.focus(), 0);
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
    const updateToolbarState = (event: Event) => {
      setRichToolbarState((event as CustomEvent<Record<string, boolean>>).detail ?? {});
    };

    window.addEventListener("lumo-rich-selection-state", updateToolbarState);
    return () => window.removeEventListener("lumo-rich-selection-state", updateToolbarState);
  }, []);

  useEffect(() => {
    const openLinkDialog = (event: Event) => {
      const { selectedText = "" } = (event as CustomEvent<RichTextLinkRequest>).detail ?? {};
      setEditorMode("edit");
      setLinkDialog({
        displayText: selectedText,
        isOpen: true,
        title: selectedText,
      });
      window.setTimeout(() => linkTitleInputRef.current?.focus(), 0);
    };

    window.addEventListener("lumo-open-rich-link-dialog", openLinkDialog);
    return () => window.removeEventListener("lumo-open-rich-link-dialog", openLinkDialog);
  }, []);

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

  const confirmPermanentDelete = async () => {
    if (
      !settings.confirmPermanentDelete ||
      await confirmDialog({
        confirmLabel: "Delete Permanently",
        message: "Permanently delete this note? This cannot be undone.",
        title: "Delete note permanently",
        variant: "danger",
      })
    ) {
      permanentlyDeleteSelectedNote();
      notify({ kind: "success", title: "Note permanently deleted" });
    }
  };

  const confirmMoveToTrash = async () => {
    if (
      await confirmDialog({
        confirmLabel: "Move to Trash",
        message: "Move this note to Trash? You can restore it later from Trash.",
        title: "Move note to Trash",
        variant: "danger",
      })
    ) {
      moveToTrash(selectedNote.id);
      notify({ kind: "info", title: "Moved note to Trash" });
    }
  };

  const openInternalLink = async (title: string) => {
    const linkedNote = resolveInternalLink(title, notes, activeView === "trash");

    if (linkedNote) {
      selectNote(linkedNote.id);
      return;
    }

    if (
      await confirmDialog({
        confirmLabel: "Create Note",
        message: `Create a new note titled "${title}"?`,
        title: "Create linked note",
      })
    ) {
      createNote(title);
    }
  };

  const isInternalLinkResolved = (title: string) =>
    Boolean(resolveInternalLink(title, notes, activeView === "trash"));

  const exportSelectedNote = async () => {
    const filename = `${sanitizeFilename(selectedNote.title)}.md`;
    try {
      const path = await saveTextFile(
        "Export selected note",
        filename,
        noteToMarkdown(selectedNote, settings.markdownExportFrontmatter),
      );
      if (path) notify({ kind: "success", title: "Selected note exported" });
    } catch (error) {
      notifyError("Export failed", error);
    }
  };

  const attachFile = async () => {
    if (isAttachmentBusy) return;
    setIsAttachmentBusy(true);
    try {
      await attachFileToSelectedNote();
    } catch (error) {
      notifyError("Attachment failed", error);
    } finally {
      setIsAttachmentBusy(false);
    }
  };

  const openAttachmentById = async (id: string) => {
    try {
      await openAttachment(id);
    } catch (error) {
      notifyError("Could not open attachment", error);
    }
  };

  const confirmRemoveAttachment = async (id: string) => {
    if (
      !await confirmDialog({
        confirmLabel: "Remove Attachment",
        message:
          "Remove this attachment from the note? The Markdown reference may remain unless you remove it from the note body.",
        title: "Remove attachment",
        variant: "danger",
      })
    ) {
      return;
    }

    try {
      await removeAttachment(id);
    } catch (error) {
      notifyError("Could not remove attachment", error);
    }
  };

  const insertMarkdown = (action: MarkdownAction) => {
    runRichTextAction(richEditorRef.current, action);
  };

  const closeLinkDialog = () => {
    setLinkDialog({ displayText: "", isOpen: false, title: "" });
    window.setTimeout(() => richEditorRef.current?.commands.focus(), 0);
  };

  const submitLinkDialog = () => {
    const title = linkDialog.title.trim();
    if (!title) return;
    insertInternalRichTextLink(richEditorRef.current, title, linkDialog.displayText);
    setLinkDialog({ displayText: "", isOpen: false, title: "" });
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
          <span className="truncate font-medium text-slate-200">
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
                onClick={() => {
                  restoreNote(selectedNote.id);
                  notify({ kind: "success", title: "Note restored" });
                }}
              >
                Restore
              </button>
              <button
                className="rounded-lg px-3 py-1.5 text-rose-300 transition hover:bg-rose-400/10 hover:text-rose-100 active:scale-95"
                onClick={() => void confirmPermanentDelete()}
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
                      void confirmMoveToTrash();
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

          <div className="mb-7 pt-1">
            <input
              className="w-full border-none bg-transparent pb-1 text-3xl font-semibold leading-[1.18] tracking-tight text-white outline-none placeholder:text-slate-600 md:text-4xl"
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
            {selectedNoteAttachments.length > 0 ? (
              <div className="mt-3 rounded-xl bg-white/[0.025] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Attachments
                  </span>
                  <button
                    className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isAttachmentBusy}
                    onClick={attachFile}
                  >
                    {isAttachmentBusy ? "Adding..." : "Attach"}
                  </button>
                </div>
                <div className="grid gap-2">
                  {selectedNoteAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-3 rounded-lg bg-night-950/35 px-3 py-2 text-xs text-slate-300"
                    >
                      <span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
                      <span className="shrink-0 text-slate-500">{formatFileSize(attachment.fileSize)}</span>
                      <button
                        className="shrink-0 text-slate-400 transition hover:text-lumo-teal"
                        onClick={() => void openAttachmentById(attachment.id)}
                      >
                        Open
                      </button>
                      <button
                        className="shrink-0 text-slate-500 transition hover:text-rose-300"
                        onClick={() => void confirmRemoveAttachment(attachment.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {editorMode === "preview" ? (
            <RichTextPreview
              content={selectedNote.content}
              attachments={selectedNoteAttachments}
              onInternalLinkClick={openInternalLink}
              onAttachmentClick={openAttachmentById}
            />
          ) : editorMode === "split" ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <RichTextEditor
                attachments={selectedNoteAttachments}
                content={selectedNote.content}
                isFocusMode={isFocusMode}
                isTypewriter={isTypewriter}
                noteId={selectedNote.id}
                onAttachmentClick={openAttachmentById}
                onChange={(content, reason = "typing") =>
                  applyEditorChange({ content }, reason, { forceCheckpoint: reason === "format" })
                }
                onBlur={() => {
                  finishHistoryChunk();
                  forceSaveSelectedNote();
                }}
                onInternalLinkClick={openInternalLink}
                onReady={(editor) => {
                  richEditorRef.current = editor;
                }}
              />
              <RichTextPreview
                content={selectedNote.content}
                attachments={selectedNoteAttachments}
                onInternalLinkClick={openInternalLink}
                onAttachmentClick={openAttachmentById}
              />
            </div>
          ) : (
            <RichTextEditor
              attachments={selectedNoteAttachments}
              content={selectedNote.content}
              isFocusMode={isFocusMode}
              isTypewriter={isTypewriter}
              noteId={selectedNote.id}
              onAttachmentClick={openAttachmentById}
              onChange={(content, reason = "typing") =>
                applyEditorChange({ content }, reason, { forceCheckpoint: reason === "format" })
              }
              onBlur={() => {
                finishHistoryChunk();
                forceSaveSelectedNote();
              }}
              onInternalLinkClick={openInternalLink}
              onReady={(editor) => {
                richEditorRef.current = editor;
              }}
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
              className={`rounded-lg px-3 py-2 text-xs transition hover:bg-white/[0.05] hover:text-white active:scale-95 ${
                richToolbarState[tool.action] ? "bg-lumo-violet/20 text-white" : ""
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertMarkdown(tool.action)}
            >
              {tool.label}
            </button>
          ))}
          <button
            className="rounded-lg px-3 py-2 text-xs transition hover:bg-white/[0.05] hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isAttachmentBusy}
            onClick={() => void attachFile()}
          >
            {isAttachmentBusy ? "Adding..." : "Attach"}
          </button>
        </div>
        <span className="text-xs text-slate-300">
          Updated {updatedLabel} · {currentWordCount} words
        </span>
      </div>
      {linkDialog.isOpen ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-night-950/55 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeLinkDialog();
          }}
        >
          <form
            className="w-full max-w-md rounded-2xl border border-white/10 bg-night-900/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            onSubmit={(event) => {
              event.preventDefault();
              submitLinkDialog();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeLinkDialog();
              }
            }}
          >
            <div className="mb-4">
              <p className="text-sm font-semibold text-white">Internal link</p>
              <p className="mt-1 text-xs text-slate-500">
                Link to a note and optionally choose the text shown in the editor.
              </p>
            </div>
            <label className="block space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                Linked note title
              </span>
              <input
                ref={linkTitleInputRef}
                className="h-10 w-full rounded-lg border border-white/10 bg-night-950/80 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-lumo-teal/50 focus:ring-2 focus:ring-lumo-teal/10"
                value={linkDialog.title}
                onChange={(event) =>
                  setLinkDialog((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Project Aurora"
              />
            </label>
            <label className="mt-3 block space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                Display text
              </span>
              <input
                className="h-10 w-full rounded-lg border border-white/10 bg-night-950/80 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-lumo-teal/50 focus:ring-2 focus:ring-lumo-teal/10"
                value={linkDialog.displayText}
                onChange={(event) =>
                  setLinkDialog((current) => ({ ...current, displayText: event.target.value }))
                }
                placeholder="Defaults to linked note title"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
                onClick={closeLinkDialog}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-lumo-violet px-3 py-2 text-sm font-medium text-white transition hover:bg-lumo-violet/90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!linkDialog.title.trim()}
              >
                Insert link
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
