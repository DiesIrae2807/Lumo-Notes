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
    moveToTrash,
    restoreNote,
    selectedNote,
    toggleFavorite,
    togglePinned,
    updateSelectedNote,
  } = useNotes();

  if (!selectedNote) {
    return <EmptyEditor />;
  }

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
          </div>

          <textarea
            className="min-h-[360px] w-full resize-none rounded-xl border border-white/10 bg-night-950/20 p-4 text-base leading-8 text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-lumo-teal/35 focus:bg-night-950/35"
            value={selectedNote.content}
            onChange={(event) => updateSelectedNote({ content: event.target.value })}
            placeholder="Start writing..."
          />

          <div className="aurora-card mt-7 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
            <div className="aurora-landscape h-44 md:h-52" />
          </div>
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
