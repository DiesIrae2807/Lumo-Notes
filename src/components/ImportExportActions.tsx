import { useState } from "react";
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

export function ImportExportActions({ compact = false }: { compact?: boolean }) {
  const {
    availableTags,
    folders,
    importMarkdownNotes,
    notes,
    restoreBackupMerge,
    selectedNote,
  } = useNotes();
  const { settings } = useSettings();
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const runAction = async (action: () => Promise<string | null>) => {
    setIsBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (result) {
        setMessage(result);
        notify({ kind: "success", title: result });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessage(message);
      notifyError("Local tool failed", error);
    } finally {
      setIsBusy(false);
    }
  };

  const exportSelected = () =>
    runAction(async () => {
      if (!selectedNote) return "Select a note first.";
      if (selectedNote.isLocked && !selectedNote.isUnlocked) return "Unlock this note before exporting Markdown.";
      if (selectedNote.isLocked) {
        const confirmed = await confirmDialog({
          confirmLabel: "Export Plaintext",
          message: "This export will write note text and attachments as plaintext.",
          title: "Export unlocked locked note",
        });
        if (!confirmed) return null;
      }
      const filename = `${sanitizeFilename(selectedNote.title)}.md`;
      const path = await saveTextFile(
        "Export selected note",
        filename,
        noteToMarkdown(selectedNote, settings.markdownExportFrontmatter),
      );
      return path ? "Selected note exported." : null;
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
      if (exportNotes.length === 0) return "No notes to export.";
      const path = await chooseFolderAndWriteFiles(
        "Export notes as Markdown",
        notesToMarkdownFiles(exportNotes),
      );
      return path ? `${exportNotes.length} Markdown files exported.` : null;
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
      return path ? "Backup exported." : null;
    });

  const importMarkdown = () =>
    runAction(async () => {
      const files = await openTextFiles("Import Markdown notes", ["md", "markdown"], true);
      if (files.length === 0) return null;
      const parsed = files.map(parseMarkdownImport);
      const count = await importMarkdownNotes(parsed);
      return `${count} Markdown note${count === 1 ? "" : "s"} imported.`;
    });

  const restoreBackup = () =>
    runAction(async () => {
      const files = await openTextFiles("Restore Lumo Notes backup", ["json"], false);
      if (files.length === 0) return null;
      const backup = validateBackup(JSON.parse(files[0].content));
      if (
        !await confirmDialog({
          confirmLabel: "Merge Backup",
          message: `Merge ${backup.notes.length} notes from this backup into the current database? Existing notes will not be deleted.`,
          title: "Restore backup",
        })
      ) {
        return null;
      }
      const count = await restoreBackupMerge(backup);
      return `${count} backup note${count === 1 ? "" : "s"} restored.`;
    });

  return (
    <div className={`space-y-2 ${compact ? "" : "border-t border-white/10 pt-4"}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Local Tools
        </p>
        {isBusy ? <span className="text-[11px] text-lumo-teal">Working...</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ToolButton disabled={isBusy || !selectedNote} onClick={exportSelected}>
          Export Note
        </ToolButton>
        <ToolButton disabled={isBusy} onClick={exportAll}>
          Export All
        </ToolButton>
        <ToolButton disabled={isBusy} onClick={exportBackup}>
          Backup
        </ToolButton>
        <ToolButton disabled={isBusy} onClick={importMarkdown}>
          Import MD
        </ToolButton>
      </div>
      <ToolButton disabled={isBusy} onClick={restoreBackup} full>
        Restore Backup
      </ToolButton>
      {message ? <p className="text-xs leading-5 text-slate-500">{message}</p> : null}
    </div>
  );
}

function ToolButton({
  children,
  disabled,
  full,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  full?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-lg border border-white/10 bg-white/[0.035] px-2.5 py-2 text-xs text-slate-300 transition hover:border-lumo-teal/30 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
        full ? "w-full" : ""
      }`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
