import { invoke } from "@tauri-apps/api/core";
import { defaultSettings, type AppSettings } from "../types/settings";

type SettingRow = {
  key: string;
  value: string;
  updatedAt: string;
};

export async function getAppSettings() {
  const rows = await invoke<SettingRow[]>("get_app_settings");
  return rows.reduce<AppSettings>((settings, row) => {
    if (!(row.key in defaultSettings)) return settings;
    try {
      return { ...settings, [row.key]: JSON.parse(row.value) };
    } catch {
      return settings;
    }
  }, defaultSettings);
}

export async function setAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  await invoke<void>("set_app_setting", {
    key,
    updatedAt: new Date().toISOString(),
    value: JSON.stringify(value),
  });
}
