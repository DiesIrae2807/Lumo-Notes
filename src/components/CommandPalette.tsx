import { useEffect, useMemo, useRef, useState } from "react";
import { useNotes } from "../store/notesStore";
import { useSettings } from "../store/settingsStore";
import {
  createBackup,
  noteToMarkdown,
  openTextFiles,
  parseMarkdownImport,
  sanitizeFilename,
  saveTextFile,
  validateBackup,
} from "../services/fileTransfer";
import type { SidebarView } from "../types/note";
import { getPlainTextPreview, markdownToPlainText } from "../utils/markdown";
import { notify, notifyError } from "../utils/toast";
import { confirmDialog } from "../utils/confirm";

type CommandItem = {
  id: string;
  title: string;
  subtitle: string;
  section: "Commands" | "Notes" | "Folders" | "Tags";
  keywords: string;
  run: () => void | Promise<void>;
};

const viewCommands: Array<{ title: string; view: SidebarView; keywords: string }> = [
  { title: "Open All Notes", view: "all", keywords: "all notes home" },
  { title: "Open Favorites", view: "favorites", keywords: "favorites starred" },
  { title: "Open Recent", view: "recent", keywords: "recent updated" },
  { title: "Open Trash", view: "trash", keywords: "trash deleted" },
  { title: "Open Graph", view: "graph", keywords: "graph links backlinks map" },
  { title: "Open Settings", view: "settings", keywords: "settings preferences appearance editor behavior" },
];

function matches(item: CommandItem, query: string) {
  const value = `${item.title} ${item.subtitle} ${item.keywords}`.toLowerCase();
  return value.includes(query);
}

export function CommandPalette() {
  const {
    availableTags,
    attachments,
    attachFileToSelectedNote,
    createNote,
    folders,
    forceSaveSelectedNote,
    importMarkdownNotes,
    notes,
    restoreBackupMerge,
    selectedNote,
    selectNote,
    setActiveFolderId,
    setActiveTag,
    setActiveView,
    toggleFavorite,
    togglePinned,
  } = useNotes();
  const { settings } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const open = () => {
      setIsOpen(true);
      setQuery("");
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };

    window.addEventListener("lumo-open-command-palette", open);
    return () => window.removeEventListener("lumo-open-command-palette", open);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  const exportSelectedNote = async () => {
    if (!selectedNote) return;
    await saveTextFile(
      "Export selected note",
      `${sanitizeFilename(selectedNote.title)}.md`,
      noteToMarkdown(selectedNote, settings.markdownExportFrontmatter),
    );
    notify({ kind: "success", title: "Selected note exported" });
  };

  const exportBackup = async () => {
    const date = new Date().toISOString().slice(0, 10);
    const backup = createBackup(notes, folders, availableTags, settings.backupIncludeTrash, attachments);
    await saveTextFile(
      "Export Lumo Notes backup",
      `lumo-notes-backup-${date}.json`,
      JSON.stringify(backup, null, 2),
    );
    notify({ kind: "success", title: "Backup exported" });
  };

  const importMarkdown = async () => {
    const files = await openTextFiles("Import Markdown notes", ["md", "markdown"], true);
    if (files.length === 0) return;
    await importMarkdownNotes(files.map(parseMarkdownImport));
  };

  const restoreBackup = async () => {
    const files = await openTextFiles("Restore Lumo Notes backup", ["json"], false);
    if (files.length === 0) return;
    const backup = validateBackup(JSON.parse(files[0].content));
    if (
      await confirmDialog({
        confirmLabel: "Merge Backup",
        message: `Merge ${backup.notes.length} notes from this backup into the current database? Existing notes will not be deleted.`,
        title: "Restore backup",
      })
    ) {
      await restoreBackupMerge(backup);
    }
  };

  const items = useMemo<CommandItem[]>(() => {
    const runView = (view: SidebarView) => () => {
      forceSaveSelectedNote();
      setActiveView(view);
    };
    const commands: CommandItem[] = [
      {
        id: "command-new-note",
        title: "New Note",
        subtitle: "Create a local note",
        section: "Commands",
        keywords: "create new note ctrl n",
        run: () => createNote(),
      },
      {
        id: "command-search-notes",
        title: "Search Notes",
        subtitle: "Focus the notes search field",
        section: "Commands",
        keywords: "find filter ctrl f",
        run: () => window.dispatchEvent(new Event("lumo-focus-search")),
      },
      ...viewCommands.map((command) => ({
        id: `command-${command.view}`,
        title: command.title,
        subtitle: "Switch view",
        section: "Commands" as const,
        keywords: command.keywords,
        run: runView(command.view),
      })),
      {
        id: "command-focus-editor",
        title: "Focus Editor",
        subtitle: "Move cursor to the note body",
        section: "Commands",
        keywords: "write edit body",
        run: () => {
          forceSaveSelectedNote();
          setActiveView("all");
          window.setTimeout(() => window.dispatchEvent(new Event("lumo-focus-editor")), 0);
        },
      },
      {
        id: "command-toggle-focus-mode",
        title: "Toggle Focus Mode",
        subtitle: "Hide surrounding panels for focused writing",
        section: "Commands",
        keywords: "focus distraction free writing zen",
        run: () => window.dispatchEvent(new Event("lumo-toggle-focus-mode")),
      },
      {
        id: "command-preview",
        title: "Toggle Preview Mode",
        subtitle: "Show rendered Markdown preview",
        section: "Commands",
        keywords: "markdown preview render",
        run: () => {
          forceSaveSelectedNote();
          setActiveView("all");
          window.setTimeout(
            () => window.dispatchEvent(new CustomEvent("lumo-set-editor-mode", { detail: "preview" })),
            0,
          );
        },
      },
      {
        id: "command-split",
        title: "Toggle Split Mode",
        subtitle: "Show editor and preview side by side",
        section: "Commands",
        keywords: "markdown split preview",
        run: () => {
          forceSaveSelectedNote();
          setActiveView("all");
          window.setTimeout(
            () => window.dispatchEvent(new CustomEvent("lumo-set-editor-mode", { detail: "split" })),
            0,
          );
        },
      },
      {
        id: "command-export-backup",
        title: "Export Backup",
        subtitle: "Save a full JSON backup",
        section: "Commands",
        keywords: "backup json export",
        run: exportBackup,
      },
      {
        id: "command-import-markdown",
        title: "Import Markdown",
        subtitle: "Import one or more .md files",
        section: "Commands",
        keywords: "import markdown md",
        run: importMarkdown,
      },
      {
        id: "command-restore-backup",
        title: "Restore Backup",
        subtitle: "Merge a Lumo Notes JSON backup",
        section: "Commands",
        keywords: "restore backup json import",
        run: restoreBackup,
      },
    ];

    if (selectedNote) {
      commands.splice(
        7,
        0,
        {
          id: "command-attach-file",
          title: "Attach File",
          subtitle: "Attach a local file to this note",
          section: "Commands",
          keywords: "attach file image pdf current note",
          run: async () => {
            await attachFileToSelectedNote();
          },
        },
        {
          id: "command-toggle-favorite",
          title: "Toggle Favorite",
          subtitle: selectedNote.isFavorite ? "Remove from Favorites" : "Add to Favorites",
          section: "Commands",
          keywords: "favorite star current note",
          run: () => toggleFavorite(selectedNote.id),
        },
        {
          id: "command-toggle-pin",
          title: "Toggle Pin",
          subtitle: selectedNote.isPinned ? "Unpin current note" : "Pin current note",
          section: "Commands",
          keywords: "pin pinned current note",
          run: () => togglePinned(selectedNote.id),
        },
        {
          id: "command-export-selected",
          title: "Export Selected Note",
          subtitle: "Save current note as Markdown",
          section: "Commands",
          keywords: "export markdown md current note",
          run: exportSelectedNote,
        },
      );
    }

    const noteItems: CommandItem[] = notes
      .filter((note) => !note.isDeleted)
      .map((note) => {
        const attachmentNames = attachments
          .filter((attachment) => attachment.noteId === note.id)
          .map((attachment) => attachment.filename);

        return {
          id: `note-${note.id}`,
          title: note.title || "Untitled Note",
          subtitle: getPlainTextPreview(note.preview || note.content, 90) || note.folderName,
          section: "Notes",
          keywords: [
            note.title,
            markdownToPlainText(note.content),
            note.preview,
            note.folderName,
            ...note.tags,
            ...attachmentNames,
          ].join(" "),
          run: () => {
            forceSaveSelectedNote();
            selectNote(note.id);
            setActiveView("all");
          },
        };
      });

    const folderItems: CommandItem[] = folders.map((folder) => ({
      id: `folder-${folder.id}`,
      title: folder.name,
      subtitle: "Open folder",
      section: "Folders",
      keywords: `folder collection ${folder.name}`,
      run: () => {
        forceSaveSelectedNote();
        setActiveFolderId(folder.id);
      },
    }));

    const tagItems: CommandItem[] = availableTags.map((tag) => ({
      id: `tag-${tag}`,
      title: tag,
      subtitle: "Open tag",
      section: "Tags",
      keywords: `tag ${tag}`,
      run: () => {
        forceSaveSelectedNote();
        setActiveTag(tag);
      },
    }));

    return [...commands, ...noteItems, ...folderItems, ...tagItems];
  }, [
    availableTags,
    attachments,
    attachFileToSelectedNote,
    createNote,
    folders,
    forceSaveSelectedNote,
    importMarkdownNotes,
    notes,
    restoreBackupMerge,
    selectedNote,
    selectNote,
    setActiveFolderId,
    setActiveTag,
    setActiveView,
    settings.backupIncludeTrash,
    settings.markdownExportFrontmatter,
    toggleFavorite,
    togglePinned,
  ]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = normalizedQuery ? items.filter((item) => matches(item, normalizedQuery)) : items;
  const activeItem = filteredItems[Math.min(activeIndex, Math.max(filteredItems.length - 1, 0))];

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const runItem = async (item: CommandItem | undefined) => {
    if (!item) return;
    close();
    try {
      await item.run();
    } catch (error) {
      notifyError("Command failed", error);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-night-950/60 px-4 py-8 backdrop-blur-sm"
      onMouseDown={close}
    >
      <div
        data-command-palette="true"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-night-900/95 shadow-[0_24px_90px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="h-14 w-full border-b border-white/10 bg-transparent px-5 text-base text-white outline-none placeholder:text-slate-500"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, filteredItems.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              void runItem(activeItem);
            }
          }}
          placeholder="Search or command..."
        />

        <div className="scroll-area max-h-[58vh] overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-white">No results</p>
              <p className="mt-2 text-xs text-slate-500">
                Try searching a note title, tag, folder, or command.
              </p>
            </div>
          ) : (
            filteredItems.map((item, index) => (
              <button
                key={item.id}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                  index === activeIndex
                    ? "bg-lumo-violet/15 text-white"
                    : "text-slate-300 hover:bg-white/[0.045] hover:text-white"
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void runItem(item)}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-xs font-semibold text-lumo-teal">
                  {item.section.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.title}</span>
                  <span className="block truncate text-xs text-slate-500">{item.subtitle}</span>
                </span>
                <span className="text-[11px] uppercase tracking-[0.14em] text-slate-600">
                  {item.section}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[11px] text-slate-500">
          <span>Enter to run</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
