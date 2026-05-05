import { useRef, useState } from "react";
import { MarkdownPreview } from "./MarkdownPreview";
import { useNotes } from "../store/notesStore";
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

function EmptyEditor() {
  return (
    <main className="column-panel editor-glow flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="text-sm text-slate-500">No note selected</div>
      </div>
      <div className="grid flex-1 place-items-center px-8 text-center">
        <div className="max-w-sm rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-8">
          <p className="text-base font-medium text-white">Select or create a note</p>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Choose a note from the list, or create a new one to start editing locally.
          </p>
        </div>
      </div>
    </main>
  );
}

export function Editor() {
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
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

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
      updateSelectedNote({ content: `${selectedNote.content}${separator}${fallback[action]}` });
      setEditorMode("edit");
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = selectedNote.content.slice(start, end);
    let insertion = selected;
    let nextSelectionStart = start;
    let nextSelectionEnd = start;
    const isAtLineStart = start === 0 || selectedNote.content[start - 1] === "\n";

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

    const nextContent =
      selectedNote.content.slice(0, start) + insertion + selectedNote.content.slice(end);

    updateSelectedNote({ content: nextContent });

    window.setTimeout(() => {
      textarea.focus();
      if (nextSelectionStart === start && nextSelectionEnd === start) {
        textarea.setSelectionRange(start + insertion.length, start + insertion.length);
      } else {
        textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
      }
    }, 0);
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!event.ctrlKey) return;

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

  return (
    <main className="column-panel editor-glow flex min-h-0 flex-col overflow-hidden">
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
            className={`rounded-lg px-3 py-1.5 transition hover:bg-white/[0.05] hover:text-slate-300 active:scale-95 ${
              selectedNote.isFavorite ? "text-amber-300" : ""
            }`}
            onClick={() => toggleFavorite(selectedNote.id)}
          >
            {selectedNote.isFavorite ? "Favorited" : "Favorite"}
          </button>
          <button
            className={`rounded-lg px-3 py-1.5 transition hover:bg-white/[0.05] hover:text-slate-300 active:scale-95 ${
              selectedNote.isPinned ? "text-lumo-teal" : ""
            }`}
            onClick={() => togglePinned(selectedNote.id)}
          >
            {selectedNote.isPinned ? "Pinned" : "Pin"}
          </button>
          <button
            className="rounded-lg px-3 py-1.5 transition hover:bg-white/[0.05] hover:text-slate-300 active:scale-95"
            onClick={() =>
              selectedNote.isDeleted ? restoreNote(selectedNote.id) : moveToTrash(selectedNote.id)
            }
          >
            {selectedNote.isDeleted ? "Restore" : "Delete"}
          </button>
          {selectedNote.isDeleted ? (
            <button
              className="rounded-lg px-3 py-1.5 text-rose-300 transition hover:bg-rose-400/10 hover:text-rose-100 active:scale-95"
              onClick={confirmPermanentDelete}
            >
              Delete Permanently
            </button>
          ) : null}
        </div>
      </div>

      <article className="scroll-area flex-1 overflow-y-auto px-6 py-7 md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-7">
            <div className="mb-4 grid h-7 w-7 place-items-center text-xl text-lumo-violet">
              *
            </div>
            <input
              className="w-full border-none bg-transparent text-3xl font-semibold tracking-tight text-white outline-none placeholder:text-slate-600 md:text-4xl"
              value={selectedNote.title}
              onChange={(event) => updateSelectedNote({ title: event.target.value })}
              onBlur={forceSaveSelectedNote}
              placeholder="Untitled Note"
            />
            <input
              className="mt-3 w-full border-none bg-transparent text-base text-slate-300 outline-none placeholder:text-slate-600"
              value={selectedNote.preview}
              onChange={(event) => updateSelectedNote({ preview: event.target.value })}
              onBlur={forceSaveSelectedNote}
              placeholder="Short preview or subtitle"
            />
            <div className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 md:grid-cols-[220px_1fr]">
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
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300"
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
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-white/10 bg-night-950/35 p-1 text-xs text-slate-400">
              {(["edit", "preview", "split"] as const).map((mode) => (
                <button
                  key={mode}
                  className={`rounded-lg px-3 py-1.5 capitalize transition active:scale-95 ${
                    editorMode === mode
                      ? "bg-lumo-violet/20 text-white shadow-[inset_0_0_0_1px_rgba(156,124,244,0.28)]"
                      : "hover:bg-white/[0.05] hover:text-slate-200"
                  }`}
                  onClick={() => setEditorMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500">
              Markdown source is saved locally.
            </span>
          </div>

          {editorMode === "preview" ? (
            <MarkdownPreview
              content={selectedNote.content}
              onInternalLinkClick={openInternalLink}
              isInternalLinkResolved={isInternalLinkResolved}
            />
          ) : editorMode === "split" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <textarea
                ref={bodyRef}
                className="min-h-[420px] w-full resize-none rounded-xl border border-white/10 bg-night-950/20 p-4 text-base leading-8 text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-lumo-teal/35 focus:bg-night-950/35"
                value={selectedNote.content}
                onChange={(event) => updateSelectedNote({ content: event.target.value })}
                onBlur={forceSaveSelectedNote}
                onKeyDown={handleEditorKeyDown}
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
              className="min-h-[420px] w-full resize-none rounded-xl border border-white/10 bg-night-950/20 p-4 text-base leading-8 text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-lumo-teal/35 focus:bg-night-950/35"
              value={selectedNote.content}
              onChange={(event) => updateSelectedNote({ content: event.target.value })}
              onBlur={forceSaveSelectedNote}
              onKeyDown={handleEditorKeyDown}
              placeholder="Start writing..."
            />
          )}

          <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs text-slate-500 md:grid-cols-2">
            <span>Created {formatMetadataDate(selectedNote.createdAt)}</span>
            <span>Updated {formatMetadataDate(selectedNote.updatedAt)}</span>
            <span>Folder {selectedNote.folderName || "Uncategorized"}</span>
            <span>
              Tags {selectedNote.tags.length > 0 ? selectedNote.tags.join(", ") : "None"}
            </span>
            <span>{wordCount(selectedNote.content)} words</span>
            <span>{selectedNote.content.length} characters</span>
          </div>

        </div>
      </article>

      <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 text-slate-400">
        <div className="flex items-center gap-1">
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
          {wordCount(selectedNote.content)} words / {selectedNote.content.length} chars
        </span>
      </div>
    </main>
  );
}
