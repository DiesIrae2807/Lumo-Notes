export type LumoTheme = "dark" | "light" | "system";
export type LumoAccent = "violetTeal" | "blue" | "green" | "rose" | "amber";
export type DefaultEditorMode = "edit" | "preview" | "split";
export type EditorFontSize = "small" | "medium" | "large";
export type EditorLineHeight = "compact" | "comfortable" | "spacious";
export type AutosaveDelay = "fast" | "normal" | "relaxed";
export type StartupBehavior = "lastNote" | "allNotes";
export type NewNoteTitleBehavior = "untitled" | "dateTime" | "firstLine";
export type DefaultExportAction = "markdownSelected" | "jsonBackup";

export type AppSettings = {
  theme: LumoTheme;
  accent: LumoAccent;
  defaultEditorMode: DefaultEditorMode;
  editorFontSize: EditorFontSize;
  editorLineHeight: EditorLineHeight;
  autosaveDelay: AutosaveDelay;
  startupBehavior: StartupBehavior;
  confirmPermanentDelete: boolean;
  newNoteTitleBehavior: NewNoteTitleBehavior;
  markdownExportFrontmatter: boolean;
  backupIncludeTrash: boolean;
  defaultExportAction: DefaultExportAction;
};

export const defaultSettings: AppSettings = {
  accent: "violetTeal",
  autosaveDelay: "normal",
  backupIncludeTrash: true,
  confirmPermanentDelete: true,
  defaultEditorMode: "edit",
  defaultExportAction: "markdownSelected",
  editorFontSize: "medium",
  editorLineHeight: "comfortable",
  markdownExportFrontmatter: true,
  newNoteTitleBehavior: "untitled",
  startupBehavior: "lastNote",
  theme: "dark",
};
