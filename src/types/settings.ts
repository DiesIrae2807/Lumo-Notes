export type LumoTheme = "dark" | "light" | "system";
export type LumoAccent = "teal" | "blue" | "green" | "rose" | "amber" | "indigo" | "custom";
export type DefaultEditorMode = "edit" | "preview" | "split";
export type EditorFontSize = "small" | "medium" | "large";
export type EditorLineHeight = "compact" | "comfortable" | "spacious";
export type AutosaveDelay = "fast" | "normal" | "relaxed";
export type StartupBehavior = "lastNote" | "allNotes";
export type NewNoteTitleBehavior = "untitled" | "dateTime" | "firstLine";
export type DefaultExportAction = "markdownSelected" | "jsonBackup";

export type CustomThemeColors = {
  appBg: string;
  workspaceBg: string;
  sidebarBg: string;
  panelBg: string;
  cardBg: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
};

export type AppSettings = {
  theme: LumoTheme;
  accent: LumoAccent;
  customAccentPrimary: string;
  customAccentSecondary: string;
  customThemeDark: CustomThemeColors;
  customThemeLight: CustomThemeColors;
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
  profileName: string;
  profileImageDataUrl: string;
};

export const defaultCustomThemeDark: CustomThemeColors = {
  appBg: "#070a12",
  workspaceBg: "#090f1d",
  sidebarBg: "#090f1d",
  panelBg: "#101827",
  cardBg: "#151d2d",
  textPrimary: "#f8fafc",
  textSecondary: "#cbd5e1",
  border: "#243044",
};

export const defaultCustomThemeLight: CustomThemeColors = {
  appBg: "#f6f2ec",
  workspaceBg: "#f0edf7",
  sidebarBg: "#faf7f1",
  panelBg: "#faf7f1",
  cardBg: "#f7f3ec",
  textPrimary: "#172033",
  textSecondary: "#5f6c82",
  border: "#cfd5df",
};

export const defaultSettings: AppSettings = {
  accent: "teal",
  autosaveDelay: "normal",
  backupIncludeTrash: true,
  confirmPermanentDelete: true,
  customAccentPrimary: "#9c7cf4",
  customAccentSecondary: "#59d5ca",
  customThemeDark: defaultCustomThemeDark,
  customThemeLight: defaultCustomThemeLight,
  defaultEditorMode: "edit",
  defaultExportAction: "markdownSelected",
  editorFontSize: "medium",
  editorLineHeight: "comfortable",
  markdownExportFrontmatter: true,
  newNoteTitleBehavior: "untitled",
  profileImageDataUrl: "",
  profileName: "Hamza",
  startupBehavior: "lastNote",
  theme: "dark",
};
