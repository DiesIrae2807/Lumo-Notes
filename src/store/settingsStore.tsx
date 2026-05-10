import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getAppSettings, setAppSetting } from "../services/settings";
import {
  defaultCustomThemeDark,
  defaultCustomThemeLight,
  defaultSettings,
  type AppSettings,
  type CustomThemeColors,
} from "../types/settings";
import { notifyError } from "../utils/toast";

type SettingsContextValue = {
  isSettingsLoading: boolean;
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

const hexPattern = /^#[0-9a-fA-F]{6}$/;

const customAccentProperties = [
  "--lumo-violet",
  "--lumo-secondary",
  "--lumo-teal",
  "--lumo-blue",
  "--accent",
  "--accent-secondary",
  "--accent-soft",
  "--accent-strong",
  "--accent-border",
  "--accent-glow",
  "--accent-text",
  "--accent-gradient",
  "--lumo-primary",
];

const customThemeProperties = [
  "--custom-app-bg",
  "--custom-workspace-bg",
  "--custom-sidebar-bg",
  "--custom-panel-bg",
  "--custom-card-bg",
  "--custom-text-primary",
  "--custom-text-secondary",
  "--custom-border",
];

const themeColorKeys: Array<keyof CustomThemeColors> = [
  "appBg",
  "workspaceBg",
  "sidebarBg",
  "panelBg",
  "cardBg",
  "textPrimary",
  "textSecondary",
  "border",
];

const cleanHex = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  const trimmed = value.trim();
  return hexPattern.test(trimmed) ? trimmed : fallback;
};

const normalizeThemeColors = (colors: CustomThemeColors | undefined, defaults: CustomThemeColors) =>
  themeColorKeys.reduce<CustomThemeColors>(
    (normalized, key) => ({
      ...normalized,
      [key]: cleanHex(colors?.[key], defaults[key]),
    }),
    { ...defaults },
  );

const hasThemeOverrides = (colors: CustomThemeColors, defaults: CustomThemeColors) =>
  themeColorKeys.some((key) => colors[key].toLowerCase() !== defaults[key].toLowerCase());

const applySettingsToDocument = (settings: AppSettings) => {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effectiveTheme = settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme;

  root.dataset.lumoTheme = effectiveTheme;
  root.dataset.lumoAccent = settings.accent;
  root.dataset.editorSize = settings.editorFontSize;
  root.dataset.editorLineHeight = settings.editorLineHeight;

  if (settings.accent === "custom") {
    const primary = cleanHex(settings.customAccentPrimary, defaultSettings.customAccentPrimary);
    const secondary = cleanHex(settings.customAccentSecondary, defaultSettings.customAccentSecondary);

    root.style.setProperty("--lumo-violet", primary);
    root.style.setProperty("--lumo-primary", primary);
    root.style.setProperty("--lumo-secondary", secondary);
    root.style.setProperty("--lumo-teal", secondary);
    root.style.setProperty("--lumo-blue", secondary);
    root.style.setProperty("--accent", secondary);
    root.style.setProperty("--accent-secondary", secondary);
    root.style.setProperty("--accent-soft", `color-mix(in srgb, ${secondary} 14%, transparent)`);
    root.style.setProperty("--accent-strong", `color-mix(in srgb, ${secondary} 78%, white)`);
    root.style.setProperty("--accent-border", `color-mix(in srgb, ${secondary} 34%, transparent)`);
    root.style.setProperty("--accent-glow", `color-mix(in srgb, ${secondary} 24%, transparent)`);
    root.style.setProperty("--accent-text", secondary);
    root.style.setProperty(
      "--accent-gradient",
      `linear-gradient(90deg, color-mix(in srgb, ${primary} 36%, transparent), color-mix(in srgb, ${secondary} 28%, transparent))`,
    );
  } else {
    customAccentProperties.forEach((property) => root.style.removeProperty(property));
  }

  const themeDefaults = effectiveTheme === "light" ? defaultCustomThemeLight : defaultCustomThemeDark;
  const themeColors = normalizeThemeColors(
    effectiveTheme === "light" ? settings.customThemeLight : settings.customThemeDark,
    themeDefaults,
  );
  const customThemeEnabled = hasThemeOverrides(themeColors, themeDefaults);

  root.dataset.lumoCustomTheme = customThemeEnabled ? "true" : "false";
  if (customThemeEnabled) {
    root.style.setProperty("--custom-app-bg", themeColors.appBg);
    root.style.setProperty("--custom-workspace-bg", themeColors.workspaceBg);
    root.style.setProperty("--custom-sidebar-bg", themeColors.sidebarBg);
    root.style.setProperty("--custom-panel-bg", themeColors.panelBg);
    root.style.setProperty("--custom-card-bg", themeColors.cardBg);
    root.style.setProperty("--custom-text-primary", themeColors.textPrimary);
    root.style.setProperty("--custom-text-secondary", themeColors.textSecondary);
    root.style.setProperty("--custom-border", themeColors.border);
  } else {
    customThemeProperties.forEach((property) => root.style.removeProperty(property));
  }
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getAppSettings()
      .then((loaded) => {
        if (!mounted) return;
        setSettings(loaded);
      })
      .catch((error) => {
        if (!mounted) return;
        notifyError("Could not load settings", error);
      })
      .finally(() => {
        if (mounted) setIsSettingsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    applySettingsToDocument(settings);
  }, [settings]);

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    void setAppSetting(key, value).catch((error) => notifyError("Could not save setting", error));
  }, []);

  const value = useMemo(
    () => ({ isSettingsLoading, settings, updateSetting }),
    [isSettingsLoading, settings, updateSetting],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used inside SettingsProvider");
  }
  return context;
}
