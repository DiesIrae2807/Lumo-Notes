import { useState } from "react";
import { BrandMark } from "./BrandMark";
import { ImportExportActions } from "./ImportExportActions";
import { SectionHeader } from "./SectionHeader";
import { useNotes } from "../store/notesStore";
import type { SidebarView } from "../types/note";

const navGlyphs: Record<string, string> = {
  "All Notes": "A",
  Favorites: "F",
  Recent: "R",
  Graph: "G",
  Trash: "T",
};

const navItems: Array<{ label: string; view: SidebarView }> = [
  { label: "All Notes", view: "all" },
  { label: "Favorites", view: "favorites" },
  { label: "Recent", view: "recent" },
  { label: "Graph", view: "graph" },
  { label: "Trash", view: "trash" },
];

function IconDot({ active, label }: { active?: boolean; label: string }) {
  return (
    <span
      className={`grid h-4 w-4 place-items-center rounded-md border text-[10px] font-semibold ${
        active
          ? "border-lumo-teal/70 bg-lumo-teal/20 text-lumo-teal"
          : "border-slate-600 bg-slate-800/60 text-slate-400"
      }`}
    >
      {navGlyphs[label]}
    </span>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.25 11.55L3 13L4.45 12.75L11.9 5.3L10.7 4.1L3.25 11.55Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path
        d="M10.7 4.1L11.75 3.05C12.08 2.72 12.62 2.72 12.95 3.05C13.28 3.38 13.28 3.92 12.95 4.25L11.9 5.3"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ActionIconButton({
  children,
  danger = false,
  label,
  onClick,
  visible = false,
}: {
  children: React.ReactNode;
  danger?: boolean;
  label: string;
  onClick: () => void;
  visible?: boolean;
}) {
  return (
    <button
      type="button"
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-500 transition duration-150 active:scale-95 focus:opacity-100 focus-visible:outline focus-visible:outline-2 ${
        danger
          ? "hover:bg-[#FF4D6D]/10 hover:text-[#FF4D6D] focus-visible:outline-[#FF4D6D]/55"
          : "hover:bg-lumo-violet/10 hover:text-lumo-violet focus-visible:outline-lumo-violet/55"
      } ${
        visible
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
      }`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export function Sidebar() {
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const {
    activeFolderId,
    activeTag,
    activeView,
    availableTags,
    createFolder,
    createNote,
    createTag,
    deleteFolder,
    deleteTag,
    folders,
    renameFolder,
    renameTag,
    notes,
    setActiveFolderId,
    setActiveTag,
    setActiveView,
  } = useNotes();

  const countForView = (view: SidebarView) => {
    if (view === "trash") {
      return notes.filter((note) => note.isDeleted).length;
    }

    if (view === "favorites") {
      return notes.filter((note) => note.isFavorite && !note.isDeleted).length;
    }

    if (view === "graph") {
      return notes.filter((note) => !note.isDeleted).length;
    }

    return notes.filter((note) => !note.isDeleted).length;
  };

  const addFolder = () => {
    const name = window.prompt("Folder name");
    if (name) createFolder(name);
  };

  const editFolder = (folderId: string, currentName: string) => {
    const nextName = window.prompt("Rename folder", currentName);
    if (nextName) renameFolder(folderId, nextName);
  };

  const removeFolder = (folderId: string, name: string) => {
    if (window.confirm(`Delete "${name}"? Notes will move to Uncategorized.`)) {
      deleteFolder(folderId);
    }
  };

  const addTag = () => {
    const name = window.prompt("Tag name");
    if (name) createTag(name);
  };

  const editTag = (tag: string) => {
    const nextName = window.prompt("Rename tag", tag);
    if (nextName) renameTag(tag, nextName);
  };

  const removeTag = (tag: string) => {
    if (window.confirm(`Delete "${tag}"? It will be removed from notes.`)) {
      deleteTag(tag);
    }
  };

  return (
    <aside className="column-panel scroll-area hidden min-h-0 flex-col overflow-y-auto overflow-x-hidden p-3 lg:flex">
      <button
        className="mb-4 flex w-full items-center justify-between rounded-xl border border-lumo-violet/20 bg-lumo-violet/[0.08] px-3 py-2.5 text-sm text-white transition hover:border-lumo-violet/40 active:scale-[0.99]"
        onClick={() => createNote()}
      >
        <span className="flex items-center gap-2">
          <BrandMark size="sm" />
          <span>New Note</span>
        </span>
        <span className="text-xs text-slate-400">Ctrl N</span>
      </button>

      <nav className="space-y-1">
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={() => setActiveView(item.view)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition active:scale-[0.99] ${
              activeView === item.view && !activeFolderId && !activeTag
                ? "border border-lumo-teal/20 bg-lumo-teal/10 text-white"
                : "text-slate-300 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <IconDot
              active={activeView === item.view && !activeFolderId && !activeTag}
              label={item.label}
            />
            <span className="flex-1 text-left">{item.label}</span>
            <span className="text-xs text-slate-500">{countForView(item.view)}</span>
          </button>
        ))}
      </nav>

      <div className="my-6 h-px bg-white/10" />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeader title="Views" />
          <button
            className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
            onClick={addFolder}
          >
            +
          </button>
        </div>
        <div className="space-y-1">
          {folders.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">No folders yet</p>
          ) : null}
          {folders.map((collection) => {
            const isSelected = activeFolderId === collection.id;

            return (
            <div
              key={collection.id}
              role="button"
              tabIndex={0}
              onClick={() => setActiveFolderId(collection.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setActiveFolderId(collection.id);
                }
              }}
              className={`group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition hover:bg-white/[0.04] hover:text-white active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-lumo-violet/55 ${
                isSelected ? "bg-white/[0.06] text-white" : "text-slate-300"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded ${collection.colorClass}`} />
              <span className="flex-1 text-left">{collection.name}</span>
              <ActionIconButton
                label="Rename"
                onClick={() => editFolder(collection.id, collection.name)}
                visible={isSelected}
              >
                <PencilIcon />
              </ActionIconButton>
              <ActionIconButton
                danger
                label="Delete"
                onClick={() => removeFolder(collection.id, collection.name)}
                visible={isSelected}
              >
                <XIcon />
              </ActionIconButton>
            </div>
          );
          })}
        </div>
      </div>

      <div className="mt-6 space-y-3 border-t border-white/10 pt-5">
        <div className="flex items-center justify-between">
          <SectionHeader title="Tags" />
          <button
            className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
            onClick={addTag}
          >
            +
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {availableTags.length === 0 ? (
            <p className="text-xs text-slate-500">No tags yet</p>
          ) : null}
          {availableTags.map((tag) => (
            <span
              key={tag}
              className={`group rounded-lg border px-2.5 py-1.5 text-xs transition hover:border-lumo-violet/40 hover:text-white active:scale-95 ${
                activeTag === tag
                  ? "border-lumo-violet/40 bg-lumo-violet/15 text-white"
                  : "border-white/10 bg-white/[0.04] text-slate-300"
              }`}
            >
              <button onClick={() => setActiveTag(tag)}>{tag}</button>
              <button
                type="button"
                className="ml-2 inline-grid h-6 w-6 place-items-center rounded-md text-slate-500 opacity-0 transition duration-150 hover:bg-lumo-violet/10 hover:text-lumo-violet active:scale-95 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lumo-violet/55"
                onClick={() => editTag(tag)}
                aria-label="Rename"
                title="Rename"
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                className="ml-1 inline-grid h-6 w-6 place-items-center rounded-md text-slate-500 opacity-0 transition duration-150 hover:bg-[#FF4D6D]/10 hover:text-[#FF4D6D] active:scale-95 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF4D6D]/55"
                onClick={() => removeTag(tag)}
                aria-label="Delete"
                title="Delete"
              >
                <XIcon />
              </button>
            </span>
          ))}
        </div>
        <button
          className="w-full rounded-xl border border-dashed border-white/10 px-3 py-2 text-left text-sm text-slate-500 transition hover:border-lumo-teal/30 hover:text-slate-300"
          onClick={addTag}
        >
          + New tag
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-lumo-violet text-sm font-semibold text-white">
          AS
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">Alex Smith</p>
          <p className="truncate text-xs text-slate-500">alex@lumonotes.app</p>
        </div>
        <div className="relative">
          <button
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:text-white"
            onClick={() => setIsToolsOpen((current) => !current)}
            title="Tools"
          >
            ...
          </button>
          {isToolsOpen ? (
            <div className="absolute bottom-10 right-0 z-20 w-64 rounded-2xl border border-white/10 bg-night-900/95 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
              <ImportExportActions compact />
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
