import { useEffect, useMemo, useRef, useState } from "react";
import { useNotes } from "../store/notesStore";
import { useSettings } from "../store/settingsStore";
import {
  chooseFolderAndWriteFiles,
  createBackup,
  noteToMarkdown,
  notesToMarkdownFiles,
  openTextFiles,
  parseMarkdownImport,
  sanitizeFilename,
  saveTextFile,
  validateBackup,
} from "../services/fileTransfer";
import { notify, notifyError } from "../utils/toast";
import { confirmDialog } from "../utils/confirm";
import { getAttachmentBackupPayloads, getLockBackupMetadata, getNotes } from "../services/database";

type MenuName = "file" | "edit";

type MenuAction = {
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onSelect?: () => void | Promise<void>;
  shortcut?: string;
};

type MenuEntry = MenuAction | { separator: true };

const isSeparator = (entry: MenuEntry): entry is { separator: true } => "separator" in entry;

function editableTarget() {
  const target = document.activeElement;
  return target instanceof HTMLElement
    ? target.closest("input, textarea, select, [contenteditable='true']")
    : null;
}

function execEditCommand(command: string) {
  try {
    document.execCommand(command);
  } catch {
    // WebView security can block some commands, especially paste.
  }
}

export function TopMenuBar({ onExit }: { onExit: () => void }) {
  const {
    archiveNote,
    availableTags,
    attachFileToSelectedNote,
    createNote,
    folders,
    forceSaveSelectedNote,
    importMarkdownNotes,
    lockSelectedNote,
    moveToTrash,
    notes,
    permanentlyDeleteSelectedNote,
    permanentlyDeleteTrashedNotes,
    restoreBackupMerge,
    restoreNote,
    selectedNote,
    setActiveView,
    toggleFavorite,
    togglePinned,
    unarchiveNote,
    unlockSelectedNote,
  } = useNotes();
  const { settings } = useSettings();
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editorHistory, setEditorHistory] = useState({ canRedo: false, canUndo: false });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trashCount = notes.filter((note) => note.isDeleted).length;

  useEffect(() => {
    if (!openMenu) return;

    const closeOnPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenMenu(null);
      }
    };

    window.addEventListener("pointerdown", closeOnPointer);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointer);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    const updateHistoryState = (event: Event) => {
      const detail = (event as CustomEvent<{ canRedo: boolean; canUndo: boolean }>).detail;
      setEditorHistory({
        canRedo: Boolean(detail?.canRedo),
        canUndo: Boolean(detail?.canUndo),
      });
    };

    window.addEventListener("lumo-editor-history-state", updateHistoryState);
    return () => window.removeEventListener("lumo-editor-history-state", updateHistoryState);
  }, []);

  const runAction = async (action: () => void | Promise<void>, success?: string) => {
    try {
      await action();
      if (success) {
        setMessage(success);
        notify({ kind: "success", title: success });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      notifyError("Menu action failed", error);
    } finally {
      setOpenMenu(null);
    }
  };

  const exportSelected = () =>
    runAction(async () => {
      if (!selectedNote) return;
      if (selectedNote.isLocked && !selectedNote.isUnlocked) {
        notify({ kind: "info", title: "Unlock this note before exporting Markdown" });
        return;
      }
      if (selectedNote.isLocked) {
        const confirmed = await confirmDialog({
          confirmLabel: "Export Plaintext",
          message: "This export will write note text and attachments as plaintext.",
          title: "Export unlocked locked note",
        });
        if (!confirmed) return;
      }
      const filename = `${sanitizeFilename(selectedNote.title)}.md`;
      const path = await saveTextFile(
        "Export selected note",
        filename,
        noteToMarkdown(selectedNote, settings.markdownExportFrontmatter),
      );
      if (path) {
        setMessage("Selected note exported.");
        notify({ kind: "success", title: "Selected note exported" });
      }
    });

  const exportAll = () =>
    runAction(async () => {
      const includeTrash = await confirmDialog({
        cancelLabel: "Active Only",
        confirmLabel: "Include Trash",
        message: "Include notes in Trash in this Markdown export?",
        title: "Export all notes",
      });
      const exportNotes = notes.filter((note) => (includeTrash || !note.isDeleted) && !note.isLocked);
      if (exportNotes.length === 0) {
        setMessage("No notes to export.");
        notify({ kind: "info", title: "No notes to export" });
        return;
      }
      const path = await chooseFolderAndWriteFiles(
        "Export notes as Markdown",
        notesToMarkdownFiles(exportNotes),
      );
      if (path) {
        const message = `${exportNotes.length} Markdown files exported.`;
        setMessage(message);
        notify({ kind: "success", title: message });
      }
    });

  const exportBackup = () =>
    runAction(async () => {
      const date = new Date().toISOString().slice(0, 10);
      const backupNotes = await getNotes();
      const backup = createBackup(
        backupNotes,
        folders,
        availableTags,
        settings.backupIncludeTrash,
        await getAttachmentBackupPayloads(),
        await getLockBackupMetadata(),
      );
      const path = await saveTextFile(
        "Export Lumo Notes backup",
        `lumo-notes-backup-${date}.json`,
        JSON.stringify(backup, null, 2),
      );
      if (path) {
        setMessage("Backup exported.");
        notify({ kind: "success", title: "Backup exported" });
      }
    });

  const importMarkdown = () =>
    runAction(async () => {
      const files = await openTextFiles("Import Markdown notes", ["md", "markdown"], true);
      if (files.length === 0) return;
      const count = await importMarkdownNotes(files.map(parseMarkdownImport));
      setMessage(`${count} Markdown note${count === 1 ? "" : "s"} imported.`);
    });

  const restoreBackup = () =>
    runAction(async () => {
      const files = await openTextFiles("Restore Lumo Notes backup", ["json"], false);
      if (files.length === 0) return;
      const backup = validateBackup(JSON.parse(files[0].content));
      if (
        !await confirmDialog({
          confirmLabel: "Merge Backup",
          message: `Merge ${backup.notes.length} notes from this backup into the current database? Existing notes will not be deleted.`,
          title: "Restore backup",
        })
      ) {
        return;
      }
      const count = await restoreBackupMerge(backup);
      setMessage(`${count} backup note${count === 1 ? "" : "s"} restored.`);
    });

  const deleteFromEditMenu = async () => {
    if (editableTarget()) {
      execEditCommand("delete");
      return;
    }

    if (selectedNote && !selectedNote.isDeleted) {
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
    }
  };

  const fileEntries = useMemo<MenuEntry[]>(
    () => [
      { label: "New Note", shortcut: "Ctrl+N", onSelect: () => createNote() },
      {
        label: "Save",
        shortcut: "Ctrl+S",
        disabled: !selectedNote,
        onSelect: forceSaveSelectedNote,
      },
      { separator: true },
      {
        label: "Attach File...",
        disabled: !selectedNote || selectedNote.isDeleted || (selectedNote.isLocked && !selectedNote.isUnlocked),
        onSelect: async () => {
          await attachFileToSelectedNote();
        },
      },
      {
        label: selectedNote?.isLocked && !selectedNote.isUnlocked ? "Unlock Note..." : "Lock Note...",
        disabled: !selectedNote || selectedNote.isDeleted,
        onSelect: () => selectedNote?.isLocked && !selectedNote.isUnlocked ? unlockSelectedNote() : lockSelectedNote(),
      },
      { separator: true },
      {
        label: "Export Selected Note...",
        disabled: !selectedNote,
        onSelect: exportSelected,
      },
      { label: "Export All Notes...", onSelect: exportAll },
      { separator: true },
      { label: "Export Backup...", onSelect: exportBackup },
      { label: "Import Markdown...", onSelect: importMarkdown },
      { label: "Restore Backup...", onSelect: restoreBackup },
      { separator: true },
      { label: "Open Graph", onSelect: () => setActiveView("graph") },
      { label: "Open Archive", onSelect: () => setActiveView("archive") },
      { label: "Settings / Preferences", onSelect: () => setActiveView("settings") },
      { separator: true },
      {
        danger: true,
        disabled: trashCount === 0,
        label: "Empty Trash...",
        onSelect: async () => {
          if (
            !settings.confirmPermanentDelete ||
            await confirmDialog({
              confirmLabel: "Empty Trash",
              message: "Permanently delete all notes in Trash? This cannot be undone.",
              title: "Empty Trash",
              variant: "danger",
            })
          ) {
            permanentlyDeleteTrashedNotes();
          }
        },
      },
      { separator: true },
      { label: "Exit", onSelect: onExit },
    ],
    [
      createNote,
      attachFileToSelectedNote,
      exportAll,
      exportBackup,
      exportSelected,
      forceSaveSelectedNote,
      importMarkdown,
      lockSelectedNote,
      unlockSelectedNote,
      onExit,
      permanentlyDeleteTrashedNotes,
      restoreBackup,
      selectedNote,
      setActiveView,
      settings.backupIncludeTrash,
      settings.confirmPermanentDelete,
      settings.markdownExportFrontmatter,
      trashCount,
    ],
  );

  const editEntries = useMemo<MenuEntry[]>(
    () => [
      {
        disabled: !editorHistory.canUndo,
        label: "Undo",
        shortcut: "Ctrl+Z",
        onSelect: () => {
          window.dispatchEvent(new Event("lumo-editor-undo"));
        },
      },
      {
        disabled: !editorHistory.canRedo,
        label: "Redo",
        shortcut: "Ctrl+Y",
        onSelect: () => {
          window.dispatchEvent(new Event("lumo-editor-redo"));
        },
      },
      { separator: true },
      { label: "Cut", shortcut: "Ctrl+X", onSelect: () => execEditCommand("cut") },
      { label: "Copy", shortcut: "Ctrl+C", onSelect: () => execEditCommand("copy") },
      { label: "Paste", shortcut: "Ctrl+V", onSelect: () => execEditCommand("paste") },
      { label: "Delete", onSelect: deleteFromEditMenu },
      { label: "Select All", shortcut: "Ctrl+A", onSelect: () => execEditCommand("selectAll") },
      { separator: true },
      {
        label: "Find/Search",
        shortcut: "Ctrl+F",
        onSelect: () => {
          window.dispatchEvent(new Event("lumo-focus-search"));
        },
      },
      {
        label: "Command Palette",
        shortcut: "Ctrl+K",
        onSelect: () => {
          window.dispatchEvent(new Event("lumo-open-command-palette"));
        },
      },
      { separator: true },
      {
        disabled: !selectedNote,
        label: selectedNote?.isFavorite ? "Remove Favorite" : "Toggle Favorite",
        onSelect: () => {
          if (selectedNote) toggleFavorite(selectedNote.id);
        },
      },
      {
        disabled: !selectedNote,
        label: selectedNote?.isPinned ? "Unpin Note" : "Toggle Pin",
        onSelect: () => {
          if (selectedNote) togglePinned(selectedNote.id);
        },
      },
      {
        disabled: !selectedNote || selectedNote.isDeleted,
        label: selectedNote?.isArchived ? "Unarchive Note" : "Archive Note",
        onSelect: () => {
          if (!selectedNote || selectedNote.isDeleted) return;
          if (selectedNote.isArchived) {
            unarchiveNote(selectedNote.id);
          } else {
            archiveNote(selectedNote.id);
          }
        },
      },
      {
        disabled: !selectedNote,
        danger: !selectedNote?.isDeleted,
        label: selectedNote?.isDeleted ? "Restore" : "Move to Trash",
        onSelect: async () => {
          if (!selectedNote) return;
          if (selectedNote.isDeleted) {
            restoreNote(selectedNote.id);
          } else if (
            await confirmDialog({
              confirmLabel: "Move to Trash",
              message: "Move this note to Trash? You can restore it later from Trash.",
              title: "Move note to Trash",
              variant: "danger",
            })
          ) {
            moveToTrash(selectedNote.id);
          }
        },
      },
      {
        danger: true,
        disabled: !selectedNote?.isDeleted,
        label: "Delete Permanently...",
        onSelect: async () => {
          if (
            selectedNote?.isDeleted &&
            (!settings.confirmPermanentDelete ||
              await confirmDialog({
                confirmLabel: "Delete Permanently",
                message: "Permanently delete this note? This cannot be undone.",
                title: "Delete note permanently",
                variant: "danger",
              }))
          ) {
            permanentlyDeleteSelectedNote();
          }
        },
      },
    ],
    [
      archiveNote,
      deleteFromEditMenu,
      editorHistory.canRedo,
      editorHistory.canUndo,
      moveToTrash,
      permanentlyDeleteSelectedNote,
      restoreNote,
      selectedNote,
      settings.confirmPermanentDelete,
      toggleFavorite,
      togglePinned,
      unarchiveNote,
    ],
  );

  return (
    <div
      ref={rootRef}
      className="relative flex items-center gap-1"
      data-menu-root="true"
      onDoubleClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <TopMenuItem
        active={openMenu === "file"}
        label="File"
        onClick={() => setOpenMenu((current) => (current === "file" ? null : "file"))}
      />
      <TopMenuItem
        active={openMenu === "edit"}
        label="Edit"
        onClick={() => setOpenMenu((current) => (current === "edit" ? null : "edit"))}
      />
      {openMenu ? (
        <MenuDropdown entries={openMenu === "file" ? fileEntries : editEntries} onRun={runAction} />
      ) : null}
      {message ? (
        <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap text-[11px] text-lumo-teal">
          {message}
        </span>
      ) : null}
    </div>
  );
}

function TopMenuItem({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lumo-violet/55 ${
        active ? "bg-white/[0.08] text-white" : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function MenuDropdown({
  entries,
  onRun,
}: {
  entries: MenuEntry[];
  onRun: (action: () => void | Promise<void>) => Promise<void>;
}) {
  return (
    <div className="absolute left-0 top-8 z-50 w-64 rounded-xl border border-white/10 bg-night-900/95 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      {entries.map((entry, index) =>
        isSeparator(entry) ? (
          <div key={`separator-${index}`} className="my-1 h-px bg-white/10" />
        ) : (
          <MenuActionItem key={entry.label} entry={entry} onRun={onRun} />
        ),
      )}
    </div>
  );
}

function MenuActionItem({
  entry,
  onRun,
}: {
  entry: MenuAction;
  onRun: (action: () => void | Promise<void>) => Promise<void>;
}) {
  return (
    <button
      type="button"
      className={`flex h-8 w-full items-center justify-between gap-4 rounded-lg px-3 text-left text-xs transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${
        entry.danger
          ? "text-rose-200 hover:bg-[#FF4D6D]/10 hover:text-[#FF4D6D]"
          : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
      }`}
      disabled={entry.disabled}
      onClick={() => {
        if (!entry.onSelect) return;
        void onRun(entry.onSelect);
      }}
    >
      <span className="truncate">{entry.label}</span>
      {entry.shortcut ? (
        <span className="shrink-0 text-[11px] text-slate-500">{entry.shortcut}</span>
      ) : null}
    </button>
  );
}
