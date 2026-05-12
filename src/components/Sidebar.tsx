import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { BrandMark } from "./BrandMark";
import { SectionHeader } from "./SectionHeader";
import { useNotes } from "../store/notesStore";
import type { SidebarView } from "../types/note";
import { notify } from "../utils/toast";
import { confirmDialog } from "../utils/confirm";
import { getFolderDotProps, normalizeFolderColor } from "../utils/folderColor";
import { useSettings } from "../store/settingsStore";
import {
  AllNotesIcon,
  ArchiveIcon,
  GraphIcon,
  RecentIcon,
  StarIcon,
  TrashIcon,
} from "./icons/AppIcons";

const navItems: Array<{ label: string; view: SidebarView }> = [
  { label: "All Notes", view: "all" },
  { label: "Favorites", view: "favorites" },
  { label: "Recent", view: "recent" },
  { label: "Archive", view: "archive" },
  { label: "Graph", view: "graph" },
  { label: "Trash", view: "trash" },
];

const navIcons: Record<string, ComponentType<{ size?: number }>> = {
  "All Notes": AllNotesIcon,
  Favorites: StarIcon,
  Recent: RecentIcon,
  Archive: ArchiveIcon,
  Graph: GraphIcon,
  Trash: TrashIcon,
};

function NavIcon({ active, label }: { active?: boolean; label: string }) {
  const Icon = navIcons[label] ?? AllNotesIcon;
  return (
    <span
      className={`grid h-5 w-5 place-items-center transition ${
        active ? "sidebar-nav-glyph-active" : "text-slate-500"
      }`}
    >
      <Icon size={20} />
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

function CogIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 6.35A2.65 2.65 0 1 0 9 11.65A2.65 2.65 0 0 0 9 6.35Z"
        stroke="currentColor"
        strokeWidth="1.45"
      />
      <path
        d="M14.6 9.95V8.05L12.95 7.72C12.82 7.32 12.66 6.94 12.45 6.6L13.38 5.22L12.03 3.87L10.65 4.8C10.31 4.6 9.94 4.43 9.53 4.31L9.05 2.7H7.15L6.82 4.35C6.42 4.48 6.04 4.64 5.7 4.85L4.32 3.92L2.97 5.27L3.9 6.65C3.7 6.99 3.53 7.36 3.41 7.77L1.8 8.25V10.15L3.45 10.48C3.58 10.88 3.74 11.26 3.95 11.6L3.02 12.98L4.37 14.33L5.75 13.4C6.09 13.6 6.46 13.77 6.87 13.89L7.35 15.5H9.25L9.58 13.85C9.98 13.72 10.36 13.56 10.7 13.35L12.08 14.28L13.43 12.93L12.5 11.55C12.7 11.21 12.87 10.84 12.99 10.43L14.6 9.95Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProfileEditIcon() {
  return <PencilIcon />;
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

type NameDialogState =
  | {
      description: string;
      initialColor?: string;
      initialValue: string;
      isOpen: true;
      label: string;
      placeholder: string;
      title: string;
      type: "create-folder" | "rename-folder" | "create-tag" | "rename-tag";
      targetId?: string;
      targetName?: string;
    }
  | {
      isOpen: false;
    };

export function Sidebar() {
  const [tagMenu, setTagMenu] = useState<{ tag: string; x: number; y: number } | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState>({ isOpen: false });
  const [nameDialogColor, setNameDialogColor] = useState("#9B6CFF");
  const [nameDialogValue, setNameDialogValue] = useState("");
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [profileDraftName, setProfileDraftName] = useState("");
  const [profileDraftImage, setProfileDraftImage] = useState("");
  const nameDialogInputRef = useRef<HTMLInputElement | null>(null);
  const profileInputRef = useRef<HTMLInputElement | null>(null);
  const { settings, updateSetting } = useSettings();
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
  const profileInitials = useMemo(() => {
    const words = settings.profileName.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "LN";
    return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
  }, [settings.profileName]);

  const countForView = (view: SidebarView) => {
    if (view === "trash") {
      return notes.filter((note) => note.isDeleted).length;
    }

    if (view === "favorites") {
      return notes.filter((note) => note.isFavorite && !note.isDeleted && !note.isArchived).length;
    }

    if (view === "archive") {
      return notes.filter((note) => note.isArchived && !note.isDeleted).length;
    }

    if (view === "graph") {
      return notes.filter((note) => !note.isDeleted && !note.isArchived).length;
    }

    if (view === "settings") {
      return 0;
    }

    return notes.filter((note) => !note.isDeleted && !note.isArchived).length;
  };

  useEffect(() => {
    if (!nameDialog.isOpen) return;
    setNameDialogValue(nameDialog.initialValue);
    if (nameDialog.type === "create-folder" || nameDialog.type === "rename-folder") {
      setNameDialogColor(normalizeFolderColor(nameDialog.initialColor));
    }
    window.setTimeout(() => {
      nameDialogInputRef.current?.focus();
      nameDialogInputRef.current?.select();
    }, 0);
  }, [nameDialog]);

  const openNameDialog = (dialog: Exclude<NameDialogState, { isOpen: false }>) => {
    setTagMenu(null);
    setNameDialog(dialog);
  };

  const closeNameDialog = () => {
    setNameDialog({ isOpen: false });
    setNameDialogColor("#9B6CFF");
    setNameDialogValue("");
  };

  const submitNameDialog = () => {
    if (!nameDialog.isOpen) return;
    const name = nameDialogValue.trim();
    if (!name) return;

    if (nameDialog.type === "create-folder") {
      createFolder(name, nameDialogColor);
    }

    if (nameDialog.type === "rename-folder" && nameDialog.targetId) {
      renameFolder(nameDialog.targetId, name, nameDialogColor);
    }

    if (nameDialog.type === "create-tag") {
      createTag(name);
    }

    if (nameDialog.type === "rename-tag" && nameDialog.targetName) {
      renameTag(nameDialog.targetName, name);
    }

    closeNameDialog();
  };

  const addFolder = () => {
    openNameDialog({
      description: "Create a collection for grouping local notes.",
      initialColor: "#9B6CFF",
      initialValue: "",
      isOpen: true,
      label: "Folder name",
      placeholder: "Projects",
      title: "New folder",
      type: "create-folder",
    });
  };

  const editFolder = (folderId: string, currentName: string, currentColor: string) => {
    openNameDialog({
      description: "Rename this folder. Notes assigned to it will keep their folder.",
      initialColor: currentColor,
      initialValue: currentName,
      isOpen: true,
      label: "Folder name",
      placeholder: "Projects",
      targetId: folderId,
      title: "Rename folder",
      type: "rename-folder",
    });
  };

  const removeFolder = async (folderId: string, name: string) => {
    if (
      await confirmDialog({
        confirmLabel: "Delete Folder",
        message: `Delete "${name}"? Notes will move to Uncategorized.`,
        title: "Delete folder",
        variant: "danger",
      })
    ) {
      deleteFolder(folderId);
      notify({ kind: "info", title: "Folder deleted", message: "Notes were moved to Uncategorized." });
    }
  };

  const addTag = () => {
    openNameDialog({
      description: "Create a tag for filtering and organizing notes.",
      initialValue: "",
      isOpen: true,
      label: "Tag name",
      placeholder: "research",
      title: "New tag",
      type: "create-tag",
    });
  };

  const editTag = (tag: string) => {
    openNameDialog({
      description: "Rename this tag everywhere it appears.",
      initialValue: tag,
      isOpen: true,
      label: "Tag name",
      placeholder: "research",
      targetName: tag,
      title: "Rename tag",
      type: "rename-tag",
    });
  };

  const removeTag = async (tag: string) => {
    if (
      await confirmDialog({
        confirmLabel: "Delete Tag",
        message: `Delete "${tag}"? It will be removed from notes.`,
        title: "Delete tag",
        variant: "danger",
      })
    ) {
      deleteTag(tag);
      notify({ kind: "info", title: "Tag deleted", message: tag });
    }
  };

  const openTagMenu = (event: React.MouseEvent, tag: string) => {
    event.preventDefault();
    setTagMenu({ tag, x: event.clientX, y: event.clientY });
  };

  const openProfileDialog = () => {
    setProfileDraftName(settings.profileName);
    setProfileDraftImage(settings.profileImageDataUrl);
    setIsProfileDialogOpen(true);
    window.setTimeout(() => profileInputRef.current?.focus(), 0);
  };

  const closeProfileDialog = () => {
    setIsProfileDialogOpen(false);
    setProfileDraftName("");
    setProfileDraftImage("");
  };

  const saveProfileDialog = () => {
    const name = profileDraftName.trim() || "Lumo User";
    updateSetting("profileName", name);
    updateSetting("profileImageDataUrl", profileDraftImage);
    closeProfileDialog();
  };

  const loadProfileImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify({ kind: "error", title: "Profile image must be an image file" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfileDraftImage(reader.result);
      }
    };
    reader.onerror = () => notify({ kind: "error", title: "Could not read profile image" });
    reader.readAsDataURL(file);
  };

  return (
    <aside className="column-panel scroll-area hidden min-h-0 flex-col overflow-y-auto overflow-x-hidden p-3 lg:flex">
      <button
        className="sidebar-new-note mb-4 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-white transition duration-150 active:scale-[0.99]"
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
            className={`sidebar-nav-item flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition duration-150 active:scale-[0.99] ${
              activeView === item.view && !activeFolderId && !activeTag
                ? "sidebar-nav-item-active text-white"
                : "text-slate-300"
            }`}
          >
            <NavIcon
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
          <SectionHeader title="Folders" />
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
            const dotProps = getFolderDotProps(collection.colorClass);

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
              className={`sidebar-nav-item group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition active:scale-[0.99] ${
                isSelected ? "sidebar-nav-item-active text-white" : "text-slate-300"
              }`}
            >
              <span className={dotProps.className} style={dotProps.style} />
              <span className="flex-1 text-left">{collection.name}</span>
              <ActionIconButton
                label="Rename"
                onClick={() => editFolder(collection.id, collection.name, collection.colorClass)}
                visible={isSelected}
              >
                <PencilIcon />
              </ActionIconButton>
              <ActionIconButton
                danger
                label="Delete"
                onClick={() => void removeFolder(collection.id, collection.name)}
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
        <div className="flex flex-wrap gap-1.5">
          {availableTags.length === 0 ? (
            <p className="text-xs text-slate-500">No tags yet</p>
          ) : null}
          {availableTags.map((tag) => (
            <button
              key={tag}
              className={`rounded-md px-2 py-1 text-xs leading-none transition hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lumo-teal/35 ${
                activeTag === tag
                  ? "bg-lumo-teal/15 text-white"
                  : "bg-white/[0.04] text-slate-300 hover:bg-lumo-teal/10"
              }`}
              onClick={() => setActiveTag(tag)}
              onContextMenu={(event) => openTagMenu(event, tag)}
              title="Right-click to edit or delete"
            >
              {tag}
            </button>
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
        <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-lumo-violet text-sm font-semibold text-white">
          {settings.profileImageDataUrl ? (
            <img
              src={settings.profileImageDataUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            profileInitials
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{settings.profileName}</p>
          <p className="truncate text-xs text-slate-500"></p>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition active:scale-95 hover:border-lumo-violet/30 hover:bg-white/[0.05] hover:text-white"
            onClick={openProfileDialog}
            aria-label="Edit profile"
            title="Edit profile"
          >
            <ProfileEditIcon />
          </button>
          <button
            className={`grid h-8 w-8 place-items-center rounded-lg border border-white/10 transition active:scale-95 ${
              activeView === "settings"
                ? "border-lumo-teal/30 bg-lumo-teal/10 text-lumo-teal"
                : "text-slate-400 hover:border-lumo-violet/30 hover:bg-white/[0.05] hover:text-white"
            }`}
            onClick={() => setActiveView("settings")}
            aria-label="Open Settings"
            title="Settings"
          >
            <CogIcon />
          </button>
        </div>
      </div>
      {isProfileDialogOpen ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-night-950/55 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeProfileDialog();
          }}
        >
          <form
            className="w-full max-w-md rounded-2xl border border-white/10 bg-night-900/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            onSubmit={(event) => {
              event.preventDefault();
              saveProfileDialog();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeProfileDialog();
              }
            }}
          >
            <div className="mb-4">
              <p className="text-sm font-semibold text-white">Edit profile</p>
              <p className="mt-1 text-xs text-slate-500">Change the local profile shown in the sidebar.</p>
            </div>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-lumo-violet text-base font-semibold text-white">
                {profileDraftImage ? (
                  <img src={profileDraftImage} alt="" className="h-full w-full object-cover" draggable={false} />
                ) : (
                  profileInitials
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:border-lumo-teal/30 hover:text-white">
                  Choose picture
                  <input
                    className="hidden"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => loadProfileImage(event.target.files?.[0])}
                  />
                </label>
                {profileDraftImage ? (
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
                    onClick={() => setProfileDraftImage("")}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
            <label className="block space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Display name</span>
              <input
                ref={profileInputRef}
                className="h-10 w-full rounded-lg border border-white/10 bg-night-950/80 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-lumo-teal/50 focus:ring-2 focus:ring-lumo-teal/10"
                value={profileDraftName}
                onChange={(event) => setProfileDraftName(event.target.value)}
                placeholder="Your name"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
                onClick={closeProfileDialog}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-lumo-violet px-3 py-2 text-sm font-medium text-white transition hover:bg-lumo-violet/90"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {tagMenu ? (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setTagMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setTagMenu(null);
          }}
        >
          <div
            className="absolute z-50 w-36 rounded-xl border border-white/10 bg-night-900/95 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
            style={{ left: tagMenu.x, top: tagMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-300 transition hover:bg-lumo-violet/10 hover:text-white"
              onClick={() => {
                editTag(tagMenu.tag);
                setTagMenu(null);
              }}
            >
              <PencilIcon />
              Rename
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-rose-200 transition hover:bg-[#FF4D6D]/10 hover:text-[#FF4D6D]"
              onClick={() => {
                void removeTag(tagMenu.tag);
                setTagMenu(null);
              }}
            >
              <XIcon />
              Delete
            </button>
          </div>
        </div>
      ) : null}
      {nameDialog.isOpen ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-night-950/55 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeNameDialog();
          }}
        >
          <form
            className="w-full max-w-md rounded-2xl border border-white/10 bg-night-900/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            onSubmit={(event) => {
              event.preventDefault();
              submitNameDialog();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeNameDialog();
              }
            }}
          >
            <div className="mb-4">
              <p className="text-sm font-semibold text-white">{nameDialog.title}</p>
              <p className="mt-1 text-xs text-slate-500">{nameDialog.description}</p>
            </div>
            <label className="block space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                {nameDialog.label}
              </span>
              <input
                ref={nameDialogInputRef}
                className="h-10 w-full rounded-lg border border-white/10 bg-night-950/80 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-lumo-teal/50 focus:ring-2 focus:ring-lumo-teal/10"
                value={nameDialogValue}
                onChange={(event) => setNameDialogValue(event.target.value)}
                placeholder={nameDialog.placeholder}
              />
            </label>
            {nameDialog.type === "create-folder" || nameDialog.type === "rename-folder" ? (
              <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
                <span>
                  <span className="block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                    Folder color
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Used for sidebar dots and note folder chips.
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className="h-5 w-5 rounded-full border border-white/15 shadow-[0_0_18px_rgba(94,230,214,0.24)]"
                    style={{ backgroundColor: nameDialogColor }}
                    aria-hidden="true"
                  />
                  <input
                    type="color"
                    className="h-8 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0"
                    value={nameDialogColor}
                    onChange={(event) => setNameDialogColor(event.target.value)}
                    aria-label="Folder color"
                  />
                </span>
              </label>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
                onClick={closeNameDialog}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-lumo-violet px-3 py-2 text-sm font-medium text-white transition hover:bg-lumo-violet/90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!nameDialogValue.trim()}
              >
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </aside>
  );
}
