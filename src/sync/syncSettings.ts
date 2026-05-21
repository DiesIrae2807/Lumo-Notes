import { invoke } from "@tauri-apps/api/core";

type SettingRow = {
  key: string;
  value: string;
  updatedAt: string;
};

export async function getRawSetting<T>(key: string): Promise<T | null> {
  const rows = await invoke<SettingRow[]>("get_app_settings");
  const row = rows.find((item) => item.key === key);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function setRawSetting(key: string, value: unknown) {
  await invoke<void>("set_app_setting", {
    key,
    value: JSON.stringify(value),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearRawSetting(key: string) {
  await setRawSetting(key, null);
}
