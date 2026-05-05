import { useState } from "react";
import { useNotes } from "../store/notesStore";

const editorTools = ["B", "I", "U", "List", "Bullets", "Link", "Code", "Image", "Grid"];

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
    createTag,
    folders,
    moveToTrash,
    removeTagFromSelectedNote,
    restoreNote,
    selectedNote,
    setSelectedNoteFolder,
    toggleFavorite,
    togglePinned,
    updateSelectedNote,
  } = useNotes();
  const [tagInput, setTagInput] = useState("");

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
              placeholder="Untitled Note"
            />
            <input
              className="mt-3 w-full border-none bg-transparent text-base text-slate-300 outline-none placeholder:text-slate-600"
              value={selectedNote.preview}
              onChange={(event) => updateSelectedNote({ preview: event.target.value })}
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

          <textarea
            className="min-h-[360px] w-full resize-none rounded-xl border border-white/10 bg-night-950/20 p-4 text-base leading-8 text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-lumo-teal/35 focus:bg-night-950/35"
            value={selectedNote.content}
            onChange={(event) => updateSelectedNote({ content: event.target.value })}
            placeholder="Start writing..."
          />

        </div>
      </article>

      <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 text-slate-400">
        <div className="flex items-center gap-1">
          {editorTools.map((tool) => (
            <button
              key={tool}
              className="rounded-lg px-3 py-2 text-xs transition hover:bg-white/[0.05] hover:text-white active:scale-95"
            >
              {tool}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-300">{wordCount(selectedNote.content)} words</span>
      </div>
    </main>
  );
}
