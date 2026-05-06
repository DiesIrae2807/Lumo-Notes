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
import { defaultSettings, type AppSettings } from "../types/settings";

type SettingsContextValue = {
  isSettingsLoading: boolean;
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

const applySettingsToDocument = (settings: AppSettings) => {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effectiveTheme = settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme;

  root.dataset.lumoTheme = effectiveTheme;
  root.dataset.lumoAccent = settings.accent;
  root.dataset.editorSize = settings.editorFontSize;
  root.dataset.editorLineHeight = settings.editorLineHeight;
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
    void setAppSetting(key, value);
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
