import { useSettings } from "../store/settingsStore";
import {
  defaultCustomThemeDark,
  defaultCustomThemeLight,
  defaultSettings,
  type AppSettings,
  type CustomThemeColors,
} from "../types/settings";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  createSyncConflict,
  getAttachmentBackupPayloads,
  listSyncConflicts,
  rebuildSearchIndex,
  replaceNoteFromBackup,
  restoreBackupAttachments,
  resolveSyncConflict,
  type SyncConflict,
  type SyncConflictResolution,
} from "../services/database";
import { notify, notifyError } from "../utils/toast";
import { confirmDialog } from "../utils/confirm";
import { useNotes } from "../store/notesStore";
import { getVersion } from "@tauri-apps/api/app";
import { createBackup, validateBackup } from "../services/fileTransfer";
import {
  type CloudBackupPasswordMetadata,
} from "../sync/backupEncryption";
import {
  downloadAndDecryptCloudBackup,
  formatBytes,
  getCloudBackupStatus,
  listCloudBackups,
  markCloudRestoreComplete,
  uploadEncryptedCloudBackup,
  type CloudBackupManifestEntry,
} from "../sync/cloudBackup";
import {
  getCloudSyncState,
  runGoogleDriveSync,
  syncChangeToBackup,
  type SyncRuntimeState,
  type SyncChangeRecord,
  type SyncConflictResolutionPayload,
} from "../sync/cloudSync";
import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  getStoredGoogleDriveSession,
  type GoogleDriveSession,
} from "../sync/googleDriveAuth";
import {
  cloudEncryptionStatus,
  getLocalCloudEncryptionMetadata,
  inspectRemoteCloudState,
  saveNewCloudEncryptionPassword,
  verifyLocalCloudEncryptionPassword,
  verifyRemoteCloudEncryptionPassword,
  type CloudEncryptionStatus,
  type RemoteCloudState,
} from "../sync/cloudEncryptionState";
import { getOrCreateDeviceIdentity } from "../sync/deviceIdentity";

const shortcuts = [
  ["Ctrl+K", "Command palette"],
  ["Ctrl+N", "New note"],
  ["Ctrl+F", "Focus search"],
  ["Ctrl+S", "Save"],
  ["Ctrl+Shift+F", "Focus mode"],
  ["Ctrl+Z", "Undo"],
  ["Ctrl+Y / Ctrl+Shift+Z", "Redo"],
  ["Ctrl+B", "Bold"],
  ["Ctrl+I", "Italic"],
  ["Ctrl+Shift+K", "Linked note"],
  ["Escape", "Close menu/palette or exit focus mode"],
];

const themeOptions: Array<{
  description: string;
  label: string;
  value: AppSettings["theme"];
}> = [
  { description: "Deep navy workspace", label: "Dark", value: "dark" },
  { description: "Bright local workspace", label: "Light", value: "light" },
  { description: "Follow Windows", label: "System", value: "system" },
];

const accentOptions: Array<{
  colors: [string, string];
  description: string;
  label: string;
  value: Exclude<AppSettings["accent"], "custom">;
}> = [
  { colors: ["#9c7cf4", "#59d5ca"], description: "Default", label: "Violet / Teal", value: "teal" },
  { colors: ["#9c7cf4", "#7fb2ff"], description: "Cool blue", label: "Blue", value: "blue" },
  { colors: ["#9c7cf4", "#5ee6a8"], description: "Fresh green", label: "Green", value: "green" },
  { colors: ["#9c7cf4", "#ff6f91"], description: "Soft rose", label: "Rose", value: "rose" },
  { colors: ["#9c7cf4", "#f6c85f"], description: "Warm amber", label: "Amber", value: "amber" },
];

const themeColorFields: Array<{
  helper: string;
  key: keyof CustomThemeColors;
  label: string;
}> = [
  { helper: "Outer app surface", key: "appBg", label: "App background" },
  { helper: "Main writing workspace", key: "workspaceBg", label: "Workspace background" },
  { helper: "Left navigation and list panels", key: "sidebarBg", label: "Sidebar background" },
  { helper: "Settings, menus, and popovers", key: "panelBg", label: "Panel background" },
  { helper: "Note cards and compact surfaces", key: "cardBg", label: "Card background" },
  { helper: "Main readable text", key: "textPrimary", label: "Primary text" },
  { helper: "Metadata and helper text", key: "textSecondary", label: "Secondary text" },
  { helper: "Subtle dividers and outlines", key: "border", label: "Border color" },
];

const hexPattern = /^#[0-9a-fA-F]{6}$/;

function isHexColor(value: string) {
  return hexPattern.test(value.trim());
}

function normalizeHex(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function hexToRgb(hex: string) {
  if (!isHexColor(hex)) return null;
  const value = hex.slice(1);
  return {
    b: Number.parseInt(value.slice(4, 6), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    r: Number.parseInt(value.slice(0, 2), 16),
  };
}

function relativeLuminance(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const normalize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * normalize(rgb.r) + 0.7152 * normalize(rgb.g) + 0.0722 * normalize(rgb.b);
}

function contrastRatio(a: string, b: string) {
  const light = Math.max(relativeLuminance(a), relativeLuminance(b));
  const dark = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (light + 0.05) / (dark + 0.05);
}

function getEffectiveTheme(theme: AppSettings["theme"]) {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function ColorField({
  defaultValue,
  helper,
  label,
  onChange,
  onReset,
  value,
}: {
  defaultValue: string;
  helper?: string;
  label: string;
  onChange: (value: string) => void;
  onReset?: () => void;
  value: string;
}) {
  const [draft, setDraft] = useState(value);
  const valid = isHexColor(draft);
  const safeValue = isHexColor(value) ? value : defaultValue;

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (nextValue: string) => {
    const normalized = normalizeHex(nextValue);
    setDraft(normalized);
    if (isHexColor(normalized)) onChange(normalized);
  };

  return (
    <label className="color-field">
      <span className="color-field-copy">
        <span className="color-field-title">{label}</span>
        {helper ? <span className="color-field-helper">{helper}</span> : null}
      </span>
      <span className="color-field-controls">
        <input
          aria-label={`${label} color`}
          className="color-field-native"
          type="color"
          value={safeValue}
          onChange={(event) => commit(event.target.value)}
        />
        <input
          aria-label={`${label} hex value`}
          className={`color-field-hex ${valid ? "" : "color-field-hex-invalid"}`}
          value={draft}
          onBlur={() => {
            if (!isHexColor(draft)) setDraft(value);
          }}
          onChange={(event) => {
            const normalized = normalizeHex(event.target.value);
            setDraft(normalized);
            if (isHexColor(normalized)) onChange(normalized);
          }}
          spellCheck={false}
        />
        {onReset ? (
          <button className="color-field-reset" type="button" onClick={onReset}>
            Reset
          </button>
        ) : null}
      </span>
    </label>
  );
}

function SettingsCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function ThemePicker() {
  const { settings, updateSetting } = useSettings();

  return (
    <div>
      <div className="mb-3">
        <span className="block text-sm font-medium text-slate-200">Theme</span>
        <span className="mt-1 block text-xs text-slate-500">Choose how Lumo Notes should blend with your desktop.</span>
      </div>
      <div className="appearance-option-grid">
        {themeOptions.map((option) => {
          const selected = settings.theme === option.value;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              className={`appearance-option theme-choice theme-choice-${option.value} ${
                selected ? "appearance-option-selected" : ""
              }`}
              onClick={() => updateSetting("theme", option.value)}
            >
              <span className="theme-preview" aria-hidden="true">
                <span className="theme-preview-sidebar" />
                <span className="theme-preview-content">
                  <span />
                  <span />
                </span>
              </span>
              <span className="appearance-option-copy">
                <span className="appearance-option-title">
                  {option.label}
                  {selected ? <span className="appearance-option-check" aria-hidden="true">✓</span> : null}
                </span>
                <span className="appearance-option-description">{option.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AccentPicker() {
  const { settings, updateSetting } = useSettings();
  const customSelected = settings.accent === "custom";
  const customAccentStyle = {
    "--swatch-a": settings.customAccentPrimary,
    "--swatch-b": settings.customAccentSecondary,
  } as CSSProperties;

  return (
    <div>
      <div className="mb-3">
        <span className="block text-sm font-medium text-slate-200">Accent</span>
        <span className="mt-1 block text-xs text-slate-500">Preview and apply the secondary Lumo accent.</span>
      </div>
      <div className="appearance-option-grid accent-option-grid">
        {accentOptions.map((option) => {
          const selected = settings.accent === option.value;
          const style = {
            "--swatch-a": option.colors[0],
            "--swatch-b": option.colors[1],
          } as CSSProperties;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              className={`appearance-option accent-choice ${selected ? "appearance-option-selected" : ""}`}
              style={style}
              onClick={() => updateSetting("accent", option.value)}
            >
              <span className="accent-preview" aria-hidden="true">
                <span className="accent-preview-gradient" />
                <span className="accent-preview-dots">
                  <span />
                  <span />
                </span>
              </span>
              <span className="appearance-option-copy">
                <span className="appearance-option-title">
                  {option.label}
                  {selected ? <span className="appearance-option-check" aria-hidden="true">✓</span> : null}
                </span>
                <span className="appearance-option-description">{option.description}</span>
              </span>
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={customSelected}
          className={`appearance-option accent-choice ${customSelected ? "appearance-option-selected" : ""}`}
          style={customAccentStyle}
          onClick={() => updateSetting("accent", "custom")}
        >
          <span className="accent-preview" aria-hidden="true">
            <span className="accent-preview-gradient" />
            <span className="accent-preview-dots">
              <span />
              <span />
            </span>
          </span>
          <span className="appearance-option-copy">
            <span className="appearance-option-title">
              Custom
              {customSelected ? <span className="appearance-option-check" aria-hidden="true">✓</span> : null}
            </span>
            <span className="appearance-option-description">Your colors</span>
          </span>
        </button>
      </div>
      {customSelected ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-200">Custom Accent</p>
              <p className="mt-1 text-xs text-slate-500">Primary drives violet surfaces; secondary drives active states.</p>
            </div>
            <button
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
              type="button"
              onClick={() => {
                updateSetting("customAccentPrimary", defaultSettings.customAccentPrimary);
                updateSetting("customAccentSecondary", defaultSettings.customAccentSecondary);
              }}
            >
              Reset accent
            </button>
          </div>
          <div className="custom-color-grid">
            <ColorField
              defaultValue={defaultSettings.customAccentPrimary}
              helper="Primary glow and brand accent"
              label="Primary accent"
              value={settings.customAccentPrimary}
              onChange={(value) => updateSetting("customAccentPrimary", value)}
              onReset={() => updateSetting("customAccentPrimary", defaultSettings.customAccentPrimary)}
            />
            <ColorField
              defaultValue={defaultSettings.customAccentSecondary}
              helper="Sidebar, links, graph, and active controls"
              label="Secondary accent"
              value={settings.customAccentSecondary}
              onChange={(value) => updateSetting("customAccentSecondary", value)}
              onReset={() => updateSetting("customAccentSecondary", defaultSettings.customAccentSecondary)}
            />
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 p-4" style={customAccentStyle}>
            <div className="h-2 rounded-full bg-[linear-gradient(90deg,var(--swatch-a),var(--swatch-b))]" />
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-xl px-3 py-2 text-white" style={{ background: settings.customAccentPrimary }}>
                Primary
              </span>
              <span className="rounded-xl px-3 py-2 text-night-950" style={{ background: settings.customAccentSecondary }}>
                Secondary
              </span>
              <span className="text-xs text-slate-500">Live preview applies across the app.</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AdvancedThemeColors() {
  const { settings, updateSetting } = useSettings();
  const effectiveTheme = getEffectiveTheme(settings.theme);
  const settingKey = effectiveTheme === "light" ? "customThemeLight" : "customThemeDark";
  const defaults = effectiveTheme === "light" ? defaultCustomThemeLight : defaultCustomThemeDark;
  const colors = settings[settingKey];
  const appContrast = contrastRatio(colors.textPrimary, colors.appBg);
  const panelContrast = contrastRatio(colors.textPrimary, colors.panelBg);
  const hasContrastWarning = appContrast < 4.5 || panelContrast < 4.5;

  const updateThemeColor = (key: keyof CustomThemeColors, value: string) => {
    updateSetting(settingKey, { ...colors, [key]: value });
  };

  const resetAllAppearance = async () => {
    const confirmed = await confirmDialog({
      confirmLabel: "Reset",
      message: "Reset theme, accent, and all custom appearance colors to the Lumo defaults?",
      title: "Reset appearance settings",
    });
    if (!confirmed) return;
    updateSetting("theme", defaultSettings.theme);
    updateSetting("accent", defaultSettings.accent);
    updateSetting("customAccentPrimary", defaultSettings.customAccentPrimary);
    updateSetting("customAccentSecondary", defaultSettings.customAccentSecondary);
    updateSetting("customThemeDark", defaultCustomThemeDark);
    updateSetting("customThemeLight", defaultCustomThemeLight);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-200">Advanced Theme Colors</p>
          <p className="mt-1 text-xs text-slate-500">
            Editing {effectiveTheme === "light" ? "light" : "dark"} theme colors. Presets stay available.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
            type="button"
            onClick={() => updateSetting(settingKey, defaults)}
          >
            Reset current theme
          </button>
          <button
            className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 transition hover:bg-rose-500/15"
            type="button"
            onClick={() => void resetAllAppearance()}
          >
            Reset all appearance
          </button>
        </div>
      </div>

      {hasContrastWarning ? (
        <div className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
          Low contrast warning: text may be hard to read with the current background colors.
        </div>
      ) : null}

      <div className="custom-color-grid">
        {themeColorFields.map((field) => (
          <ColorField
            key={field.key}
            defaultValue={defaults[field.key]}
            helper={field.helper}
            label={field.label}
            value={colors[field.key]}
            onChange={(value) => updateThemeColor(field.key, value)}
            onReset={() => updateThemeColor(field.key, defaults[field.key])}
          />
        ))}
      </div>
    </div>
  );
}

function SettingSelect<K extends keyof AppSettings>({
  helper,
  label,
  name,
  options,
}: {
  helper?: string;
  label: string;
  name: K;
  options: Array<{ label: string; value: AppSettings[K] }>;
}) {
  const { settings, updateSetting } = useSettings();

  return (
    <label className="grid gap-2 md:grid-cols-[1fr_220px] md:items-center">
      <span>
        <span className="block text-sm font-medium text-slate-200">{label}</span>
        {helper ? <span className="mt-1 block text-xs text-slate-500">{helper}</span> : null}
      </span>
      <select
        className="h-10 rounded-xl border border-white/10 bg-night-950/55 px-3 text-sm text-slate-200 outline-none focus:border-lumo-teal/45"
        value={String(settings[name])}
        onChange={(event) => updateSetting(name, event.target.value as AppSettings[K])}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SettingToggle<K extends keyof AppSettings>({
  helper,
  label,
  name,
}: {
  helper?: string;
  label: string;
  name: K;
}) {
  const { settings, updateSetting } = useSettings();
  const enabled = Boolean(settings[name]);

  return (
    <button
      className="flex w-full items-center justify-between gap-4 rounded-xl px-1 py-1 text-left"
      onClick={() => updateSetting(name, !enabled as AppSettings[K])}
    >
      <span>
        <span className="block text-sm font-medium text-slate-200">{label}</span>
        {helper ? <span className="mt-1 block text-xs text-slate-500">{helper}</span> : null}
      </span>
      <span
        className={`relative h-6 w-11 rounded-full border transition-colors duration-200 ease-out ${
          enabled
            ? "border-lumo-teal/70 bg-lumo-teal shadow-[0_0_16px_rgba(89,213,202,0.22)]"
            : "border-white/10 bg-slate-700/70"
        }`}
      >
        <span
          className={`absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-[transform,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            enabled
              ? "translate-x-5 bg-night-950 shadow-[0_2px_8px_rgba(0,0,0,0.22)]"
              : "translate-x-0 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
          }`}
        />
      </span>
    </button>
  );
}

type SecretPromptState = {
  message: string;
  resolve: (value: string) => void;
  title: string;
} | null;

async function requestCloudEncryptionPassword(
  promptSecret: (title: string, message: string) => Promise<string>,
  mode: "backup" | "restore" | "sync",
  remoteState: RemoteCloudState | null,
) {
  const existing = await getLocalCloudEncryptionMetadata();
  if (!existing?.salt || !existing.verifier) {
    if (!remoteState || remoteState.kind === "unknown") {
      throw new Error("Could not verify Google Drive cloud state. Retry remote check before setting or entering a Cloud Encryption Password.");
    }

    if (remoteState.kind === "existingEncrypted" || mode === "restore") {
      const password = await promptSecret(
        "Cloud Encryption Password",
        "Enter the existing Cloud Encryption Password for this Google Drive data. It encrypts Drive backups and sync records.",
      );
      if (!password) return null;
      await verifyRemoteCloudEncryptionPassword(password, remoteState);
      return password;
    }

    const password = await promptSecret(
      "Set Cloud Encryption Password",
      "Set a Cloud Encryption Password for Google Drive backups and sync records. If you forget it, Drive cloud data cannot be decrypted. Use at least 8 characters.",
    );
    if (!password) return null;
    const latestRemoteState = await inspectRemoteCloudState();
    if (latestRemoteState.kind !== "empty") {
      throw new Error("Existing Lumo cloud data was found. Enter the existing Cloud Encryption Password instead of creating a new one.");
    }
    const confirmation = await promptSecret("Confirm Cloud Encryption Password", "Re-enter the Cloud Encryption Password.");
    if (password !== confirmation) {
      throw new Error("Cloud Encryption Passwords do not match.");
    }
    await saveNewCloudEncryptionPassword(password);
    return password;
  }

  const password = await promptSecret("Cloud Encryption Password", "Enter your Cloud Encryption Password.");
  if (!password) return null;
  await verifyLocalCloudEncryptionPassword(password, existing);
  return password;
}

function SecretPromptModal({
  onClose,
  prompt,
}: {
  onClose: () => void;
  prompt: SecretPromptState;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!prompt) return;
    setValue("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [prompt]);

  if (!prompt) return null;

  const close = (result: string) => {
    prompt.resolve(result.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-night-950/60 px-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close("");
      }}
    >
      <form
        className="w-full max-w-md rounded-2xl border border-white/10 bg-night-900/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        onSubmit={(event) => {
          event.preventDefault();
          close(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close("");
          }
        }}
      >
        <div className="mb-4">
          <p className="text-sm font-semibold text-white">{prompt.title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{prompt.message}</p>
        </div>
        <input
          ref={inputRef}
          className="h-10 w-full rounded-lg border border-white/10 bg-night-950/80 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-lumo-teal/50 focus:ring-2 focus:ring-lumo-teal/10"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Cloud Encryption Password"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
            onClick={() => close("")}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-lumo-violet px-3 py-2 text-sm font-medium text-white transition hover:bg-lumo-violet/90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!value.trim()}
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}

function SyncSettingsPanel({ appVersion }: { appVersion: string }) {
  const { attachments, availableTags, folders, notes, restoreBackupMerge } = useNotes();
  const { settings } = useSettings();
  const [session, setSession] = useState<GoogleDriveSession | null>(null);
  const [backups, setBackups] = useState<CloudBackupManifestEntry[]>([]);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [lastRestoreAt, setLastRestoreAt] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncRuntimeState>({
    conflicts: 0,
    lastSyncAt: null,
    pendingLocalChanges: 0,
    status: "idle",
  });
  const [remoteCloudState, setRemoteCloudState] = useState<RemoteCloudState | null>(null);
  const [encryptionStatus, setEncryptionStatus] = useState<CloudEncryptionStatus>("unknown");
  const [isBusy, setIsBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [secretPrompt, setSecretPrompt] = useState<SecretPromptState>(null);
  const [unresolvedConflicts, setUnresolvedConflicts] = useState<SyncConflict[]>([]);
  const [activeConflict, setActiveConflict] = useState<SyncConflict | null>(null);
  const dirtyNoteIdsAtSyncStart = useRef<Set<string>>(new Set());

  const promptSecret = useCallback((title: string, message: string) => {
    return new Promise<string>((resolve) => {
      setSecretPrompt({ message, resolve, title });
    });
  }, []);

  const refreshState = async (loadBackups: boolean) => {
    const [storedSession, cloudStatus, nextSyncState, localMetadata, nextConflicts] = await Promise.all([
      getStoredGoogleDriveSession(),
      getCloudBackupStatus(),
      getCloudSyncState({ attachments, folders, notes, tags: availableTags }),
      getLocalCloudEncryptionMetadata(),
      listSyncConflicts({ status: "unresolved" }),
    ]);
    const nextRemoteState = storedSession ? await inspectRemoteCloudState() : null;
    setSession(storedSession);
    setLastBackupAt(cloudStatus.lastBackupAt);
    setLastRestoreAt(cloudStatus.lastRestoreAt);
    setSyncState(nextSyncState);
    setUnresolvedConflicts(nextConflicts);
    setRemoteCloudState(nextRemoteState);
    setEncryptionStatus(cloudEncryptionStatus(localMetadata, nextRemoteState));
    if (storedSession && loadBackups) {
      const nextBackups = await listCloudBackups();
      setBackups(nextBackups);
    }
  };

  useEffect(() => {
    void refreshState(false).catch(() => {
      setSession(null);
    });
  }, []);

  const run = async (label: string, action: () => Promise<void>) => {
    if (isBusy) return;
    setIsBusy(true);
    setStatusText(label);
    try {
      await action();
    } catch (error) {
      notifyError(label, error);
    } finally {
      setIsBusy(false);
      setStatusText("");
    }
  };

  const handleConnect = () =>
    run("Connecting Google Drive", async () => {
      const connected = await connectGoogleDrive();
      setSession(connected);
      notify({ kind: "success", title: "Google Drive connected" });
      await refreshState(true);
    });

  const handleDisconnect = () =>
    run("Disconnecting Google Drive", async () => {
      await disconnectGoogleDrive();
      setSession(null);
      setBackups([]);
      setRemoteCloudState(null);
      setEncryptionStatus("unknown");
      notify({ kind: "success", title: "Google Drive disconnected" });
    });

  const handleBackup = () =>
    run("Backing up to Google Drive", async () => {
      if (!session) throw new Error("Connect Google Drive first.");
      const password = await requestCloudEncryptionPassword(promptSecret, "backup", remoteCloudState);
      if (!password) return;
      const entry = await uploadEncryptedCloudBackup({
        appVersion,
        folders,
        notes,
        password,
        settings,
        tags: availableTags,
      });
      setBackups((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
      setLastBackupAt(entry.createdAt);
      await refreshState(false);
      notify({ kind: "success", title: "Encrypted Drive backup uploaded" });
    });

  const noteConflictPayloadDiffers = (local: typeof notes[number], incoming: typeof notes[number]) => {
    const localComparable = {
      title: local.title,
      content: local.isLocked ? "" : local.content,
      preview: local.isLocked ? "" : local.preview,
      folderId: local.folderId,
      folderName: local.folderName,
      tags: [...local.tags].sort(),
      isPinned: local.isPinned,
      isFavorite: local.isFavorite,
      isDeleted: local.isDeleted,
      isArchived: local.isArchived,
      isLocked: local.isLocked,
      encryptedContent: local.encryptedContent ?? null,
      encryptedPreview: local.encryptedPreview ?? null,
      encryptionNonce: local.encryptionNonce ?? null,
      lockedAt: local.lockedAt ?? null,
    };
    const incomingComparable = {
      title: incoming.title,
      content: incoming.isLocked ? "" : incoming.content,
      preview: incoming.isLocked ? "" : incoming.preview,
      folderId: incoming.folderId,
      folderName: incoming.folderName,
      tags: [...incoming.tags].sort(),
      isPinned: incoming.isPinned,
      isFavorite: incoming.isFavorite,
      isDeleted: incoming.isDeleted,
      isArchived: incoming.isArchived,
      isLocked: incoming.isLocked,
      encryptedContent: incoming.encryptedContent ?? null,
      encryptedPreview: incoming.encryptedPreview ?? null,
      encryptionNonce: incoming.encryptionNonce ?? null,
      lockedAt: incoming.lockedAt ?? null,
    };
    return JSON.stringify(localComparable) !== JSON.stringify(incomingComparable);
  };

  const buildLocalConflictBackup = useCallback(
    async (noteId: string) => {
      const localNote = notes.find((note) => note.id === noteId);
      if (!localNote) return null;
      const attachmentPayloads = await getAttachmentBackupPayloads();
      return createBackup(
        [localNote],
        folders.filter((folder) => folder.id === localNote.folderId),
        localNote.tags,
        true,
        attachmentPayloads.filter((attachment) => attachment.noteId === localNote.id),
        null,
      );
    },
    [folders, notes],
  );

  const conflictTitle = (conflict: SyncConflict) => {
    try {
      const remote = validateBackup(JSON.parse(conflict.remotePayload)).notes[0];
      const local = validateBackup(JSON.parse(conflict.localPayload)).notes[0];
      return remote?.title || local?.title || "Untitled Note";
    } catch {
      return "Untitled Note";
    }
  };

  const conflictPreview = (payload: string) => {
    try {
      const note = validateBackup(JSON.parse(payload)).notes[0];
      if (!note) return "No preview available.";
      if (note.isLocked) return "Locked note content is hidden.";
      return (note.preview || note.content || "No preview available.").slice(0, 180);
    } catch {
      return "No preview available.";
    }
  };

  const applyRemoteResolution = useCallback(
    async (payload: SyncConflictResolutionPayload) => {
      if (!payload.finalNotePayload) return "skipped";
      const finalBackup = validateBackup(payload.finalNotePayload);
      const finalNote = finalBackup.notes[0];
      if (!finalNote) return "skipped";
      if (payload.selectedResolution === "keep_both") {
        await restoreBackupMerge(finalBackup);
      } else {
        await replaceNoteFromBackup(finalNote);
        if (finalBackup.attachments?.length) {
          await restoreBackupAttachments(finalBackup.attachments);
        }
      }
      try {
        await resolveSyncConflict(
          payload.conflictId,
          payload.selectedResolution,
          payload.resolvedAt,
          payload.resultingNoteId ?? null,
        );
      } catch {
        // The conflict may only have existed on the resolving device.
      }
      notify({
        kind: "info",
        title:
          payload.selectedResolution === "keep_local"
            ? "Kept local version"
            : payload.selectedResolution === "keep_remote"
              ? "Kept remote version"
              : "Kept both versions",
      });
      return "applied";
    },
    [restoreBackupMerge],
  );

  const reloadConflicts = useCallback(async () => {
    const nextConflicts = await listSyncConflicts({ status: "unresolved" });
    setUnresolvedConflicts(nextConflicts);
    setSyncState((current) => ({
      ...current,
      conflicts: nextConflicts.length,
      status: nextConflicts.length > 0 ? "conflict" : current.pendingLocalChanges > 0 ? "idle" : "synced",
    }));
    return nextConflicts;
  }, []);

  const resolveConflict = useCallback(
    async (conflict: SyncConflict, resolution: SyncConflictResolution) => {
      const localBackup = validateBackup(JSON.parse(conflict.localPayload));
      const remoteBackup = validateBackup(JSON.parse(conflict.remotePayload));
      const remoteNote = remoteBackup.notes[0];
      if (!remoteNote) throw new Error("The preserved remote conflict payload is missing its note.");
      let resultEntityId: string | null = null;

      if (resolution === "keep_remote") {
        const confirmed = await confirmDialog({
          confirmLabel: "Keep theirs",
          message: "This will replace your current local version with the preserved remote version.",
          title: "Keep remote version?",
        });
        if (!confirmed) return;
        await replaceNoteFromBackup(remoteNote);
        if (remoteBackup.attachments?.length) {
          await restoreBackupAttachments(remoteBackup.attachments);
        }
      } else if (resolution === "keep_both") {
        const now = new Date().toISOString();
        const suffixDate = new Date(conflict.detectedAt).toLocaleString();
        const newNoteId = `note-conflict-${crypto.randomUUID()}`;
        const attachmentIdMap = new Map<string, string>();
        const clonedAttachments = remoteBackup.attachments?.map((attachment) => {
          const newAttachmentId = `attachment-conflict-${crypto.randomUUID()}`;
          attachmentIdMap.set(attachment.id, newAttachmentId);
          return {
            ...attachment,
            id: newAttachmentId,
            noteId: newNoteId,
          };
        });
        const remapContent = (value: string) => {
          let next = value;
          attachmentIdMap.forEach((newId, oldId) => {
            next = next.split(`attachment://${oldId}`).join(`attachment://${newId}`);
          });
          return next;
        };
        const clonedNote = {
          ...remoteNote,
          id: newNoteId,
          title: `${remoteNote.title || "Untitled Note"} (conflict from ${conflict.remoteDeviceId || "remote device"} - ${suffixDate})`,
          content: remoteNote.isLocked ? "" : remapContent(remoteNote.content),
          preview: remoteNote.isLocked ? "" : remoteNote.preview,
          createdAt: now,
          updatedAt: now,
        };
        await restoreBackupMerge({
          ...remoteBackup,
          notes: [clonedNote],
          noteTags: remoteBackup.noteTags.map((item) =>
            item.noteId === remoteNote.id ? { ...item, noteId: newNoteId } : item,
          ),
          attachments: clonedAttachments,
        });
        resultEntityId = newNoteId;
      }

      const resolvedAt = new Date().toISOString();
      await resolveSyncConflict(conflict.id, resolution, resolvedAt, resultEntityId);
      setActiveConflict(null);
      await reloadConflicts();
      notify({
        kind: "success",
        title:
          resolution === "keep_local"
            ? "Kept local version"
            : resolution === "keep_remote"
              ? "Kept remote version"
              : "Kept both versions",
        message: resolution === "keep_local" ? localBackup.notes[0]?.title : remoteNote.title,
      });
    },
    [reloadConflicts, restoreBackupMerge],
  );

  const applyRemoteChange = useCallback(
    async (record: SyncChangeRecord) => {
      if (record.entityType === "conflict_resolution") {
        return applyRemoteResolution(record.payload as SyncConflictResolutionPayload);
      }

      const backup = syncChangeToBackup(record);
      if (!backup) return "skipped";

      if (record.entityType === "note") {
        const incoming = backup.notes[0];
        const local = incoming ? notes.find((note) => note.id === incoming.id) : null;
        const hasUnsyncedLocalEdit = incoming ? dirtyNoteIdsAtSyncStart.current.has(incoming.id) : false;
        const remoteDiffers = incoming && local ? noteConflictPayloadDiffers(local, incoming) : false;
        if (incoming && local && hasUnsyncedLocalEdit && remoteDiffers) {
          const device = await getOrCreateDeviceIdentity();
          const localBackup = await buildLocalConflictBackup(incoming.id);
          if (!localBackup) return "skipped";
          const conflict = await createSyncConflict({
            id: `sync-conflict-${record.changeId}`,
            detectedAt: new Date().toISOString(),
            entityId: incoming.id,
            entityType: "note",
            localDeviceId: device.deviceId,
            localPayload: JSON.stringify(localBackup),
            remoteChangeId: record.changeId,
            remoteDeviceId: record.deviceId,
            remotePayload: JSON.stringify(backup),
            resolution: null,
            resolvedAt: null,
            resultEntityId: null,
            resolutionSyncedAt: null,
            status: "unresolved",
          });
          setActiveConflict(conflict);
          notify({
            kind: "info",
            title: "Sync conflict detected",
            message: "Both versions were preserved.",
          });
          return "conflict";
        }

        if (incoming && local && hasUnsyncedLocalEdit && !remoteDiffers) {
          return "skipped";
        }
      }

      await restoreBackupMerge(backup);
      return "applied";
    },
    [applyRemoteResolution, buildLocalConflictBackup, notes, restoreBackupMerge],
  );

  const handleSyncNow = () =>
    run("Syncing Google Drive", async () => {
      if (!session) throw new Error("Connect Google Drive first.");
      const password = await requestCloudEncryptionPassword(promptSecret, "sync", remoteCloudState);
      if (!password) return;
      const lastSyncAt = syncState.lastSyncAt ?? "1970-01-01T00:00:00.000Z";
      dirtyNoteIdsAtSyncStart.current = new Set(
        notes
          .filter((note) => Date.parse(note.updatedAt) > Date.parse(lastSyncAt))
          .map((note) => note.id),
      );
      setSyncState((current) => ({ ...current, status: "syncing" }));
      try {
        const summary = await runGoogleDriveSync({
          applyRemoteChange,
          attachments,
          folders,
          notes,
          password,
          settings,
          tags: availableTags,
        });
        setSyncState({
          conflicts: summary.conflicts,
          lastSyncAt: summary.syncedAt,
          pendingLocalChanges: 0,
          status: summary.conflicts > 0 ? "conflict" : "synced",
        });
        const nextConflicts = await reloadConflicts();
        if (!activeConflict && nextConflicts[0] && summary.conflicts > 0) {
          setActiveConflict(nextConflicts[0]);
        }
        notify({
          kind: summary.conflicts > 0 ? "info" : "success",
          title: summary.conflicts > 0 ? "Sync completed with conflicts" : "Sync complete",
          message:
            summary.conflicts > 0
              ? "Sync conflict detected. Both versions were preserved."
              : `${summary.uploaded} uploaded, ${summary.applied} applied, ${summary.skipped} skipped, ${summary.conflicts} conflicts.`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setSyncState((current) => ({
          ...current,
          status: /network|fetch|offline|Failed to fetch/i.test(message) ? "offline" : "error",
        }));
        throw error;
      }
      await refreshState(false);
    });

  const handleRefresh = () =>
    run("Refreshing Drive backups", async () => {
      if (!session) throw new Error("Connect Google Drive first.");
      const nextBackups = await listCloudBackups();
      setBackups(nextBackups);
      notify({ kind: "success", title: "Drive backup list refreshed" });
    });

  const handleRestore = (entry: CloudBackupManifestEntry) =>
    run("Restoring Drive backup", async () => {
      const confirmed = await confirmDialog({
        confirmLabel: "Merge restore",
        message:
          "This will decrypt the selected Drive backup locally and merge it into your current notes. Existing local data will not be wiped.",
        title: "Restore encrypted Drive backup?",
      });
      if (!confirmed) return;
      const password = await requestCloudEncryptionPassword(promptSecret, "restore", remoteCloudState);
      if (!password) return;
      let backup;
      try {
        backup = await downloadAndDecryptCloudBackup(entry, password);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          detail
            ? `Could not decrypt this selected backup from ${new Date(entry.createdAt).toLocaleString()}. ${detail}`
            : `Could not decrypt this selected backup from ${new Date(entry.createdAt).toLocaleString()}.`,
        );
      }
      await restoreBackupMerge(backup);
      await markCloudRestoreComplete();
      setLastRestoreAt(new Date().toISOString());
      await refreshState(false);
    });

  const handleRetryRemoteCheck = () =>
    run("Checking Google Drive cloud data", async () => {
      if (!session) throw new Error("Connect Google Drive first.");
      await refreshState(false);
      notify({ kind: "success", title: "Google Drive cloud state refreshed" });
    });

  const handleConfigureCloudEncryption = () =>
    run(
      encryptionStatus === "needsExistingPassword"
        ? "Verifying Cloud Encryption Password"
        : "Setting Cloud Encryption Password",
      async () => {
        if (!session) throw new Error("Connect Google Drive first.");
        const password = await requestCloudEncryptionPassword(promptSecret, "backup", remoteCloudState);
        if (!password) return;
        await refreshState(false);
        notify({ kind: "success", title: "Cloud Encryption Password configured" });
      },
    );

  const remoteStateLabel =
    remoteCloudState?.kind === "empty"
      ? "No cloud data found"
      : remoteCloudState?.kind === "existingEncrypted"
        ? "Existing encrypted cloud data found"
        : remoteCloudState?.kind === "unknown"
          ? "Could not check"
          : session
            ? "Checking..."
            : "Not checked";

  const encryptionStatusLabel =
    encryptionStatus === "configured"
      ? "Configured"
      : encryptionStatus === "needsExistingPassword"
        ? "Needs existing password"
        : encryptionStatus === "notConfigured"
          ? "Not configured"
          : "Unknown";

  return (
    <div className="space-y-4 text-sm text-slate-300">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Sync provider</p>
          <p className="mt-2 font-medium text-white">Google Drive appDataFolder</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Connection status</p>
          <p className="mt-2 font-medium text-white">{session ? "Connected" : "Not connected"}</p>
          {session?.email ? <p className="mt-1 text-xs text-slate-500">{session.email}</p> : null}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Last backup</p>
          <p className="mt-2 text-slate-200">{lastBackupAt ? new Date(lastBackupAt).toLocaleString() : "Never"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Last restore</p>
          <p className="mt-2 text-slate-200">{lastRestoreAt ? new Date(lastRestoreAt).toLocaleString() : "Never"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Last sync</p>
          <p className="mt-2 text-slate-200">{syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toLocaleString() : "Never"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Sync status</p>
          <p className="mt-2 font-medium text-white">{syncState.status}</p>
          <p className="mt-1 text-xs text-slate-500">
            {syncState.pendingLocalChanges} pending local change{syncState.pendingLocalChanges === 1 ? "" : "s"}
            {syncState.conflicts ? ` · ${syncState.conflicts} conflict${syncState.conflicts === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Cloud encryption</p>
          <p className="mt-2 font-medium text-white">{encryptionStatusLabel}</p>
          <p className="mt-1 text-xs text-slate-500">Separate from the Lock Password.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Remote state</p>
          <p className="mt-2 font-medium text-white">{remoteStateLabel}</p>
          {remoteCloudState?.error ? <p className="mt-1 text-xs text-amber-200">{remoteCloudState.error}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!session ? (
          <button className="rounded-xl bg-lumo-violet px-3 py-2 text-xs font-medium text-white transition hover:bg-lumo-violet/90 disabled:opacity-60" disabled={isBusy} type="button" onClick={handleConnect}>
            Connect Google Drive
          </button>
        ) : (
          <button className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60" disabled={isBusy} type="button" onClick={handleDisconnect}>
            Disconnect
          </button>
        )}
        <button className="rounded-xl border border-lumo-teal/20 bg-lumo-teal/10 px-3 py-2 text-xs font-medium text-lumo-teal transition hover:bg-lumo-teal/15 disabled:opacity-60" disabled={isBusy || !session} type="button" onClick={handleBackup}>
          Back up now
        </button>
        <button className="rounded-xl border border-lumo-teal/20 bg-lumo-teal/10 px-3 py-2 text-xs font-medium text-lumo-teal transition hover:bg-lumo-teal/15 disabled:opacity-60" disabled={isBusy || !session} type="button" onClick={handleSyncNow}>
          Sync now
        </button>
        <button className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60" disabled={isBusy || !session} type="button" onClick={handleRefresh}>
          Refresh backup list
        </button>
        {session && encryptionStatus !== "configured" && remoteCloudState?.kind !== "unknown" ? (
          <button className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60" disabled={isBusy} type="button" onClick={handleConfigureCloudEncryption}>
            {encryptionStatus === "needsExistingPassword" ? "Enter Cloud Encryption Password" : "Set Cloud Encryption Password"}
          </button>
        ) : null}
        {session && (!remoteCloudState || remoteCloudState.kind === "unknown") ? (
          <button className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60" disabled={isBusy} type="button" onClick={handleRetryRemoteCheck}>
            Retry remote check
          </button>
        ) : null}
        {statusText ? <span className="self-center text-xs text-slate-500">{statusText}...</span> : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-slate-200">Unresolved sync conflicts</p>
            <p className="mt-1 text-xs text-slate-500">
              {unresolvedConflicts.length} unresolved conflict{unresolvedConflicts.length === 1 ? "" : "s"}
            </p>
          </div>
          <button className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60" disabled={isBusy} type="button" onClick={() => void reloadConflicts()}>
            Refresh
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {unresolvedConflicts.length === 0 ? (
            <p className="text-xs text-slate-500">No unresolved conflicts.</p>
          ) : (
            unresolvedConflicts.map((conflict) => (
              <div key={conflict.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
                <div>
                  <p className="text-sm text-slate-200">{conflictTitle(conflict)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Detected {new Date(conflict.detectedAt).toLocaleString()} · Local {conflict.localDeviceId || "this device"} · Remote {conflict.remoteDeviceId || "remote device"}
                  </p>
                </div>
                <button className="rounded-lg border border-lumo-teal/20 bg-lumo-teal/10 px-3 py-2 text-xs font-medium text-lumo-teal transition hover:bg-lumo-teal/15 disabled:opacity-60" disabled={isBusy} type="button" onClick={() => setActiveConflict(conflict)}>
                  Resolve
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-slate-200">Available Drive backups</p>
          <span className="text-xs text-slate-500">{backups.length} found</span>
        </div>
        <div className="mt-3 space-y-2">
          {backups.length === 0 ? (
            <p className="text-xs text-slate-500">Connect and refresh to list encrypted backups in appDataFolder.</p>
          ) : (
            backups.map((backup) => (
              <div key={backup.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
                <div>
                  <p className="text-sm text-slate-200">{new Date(backup.createdAt).toLocaleString()}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {backup.deviceName} · {backup.appVersion} · {formatBytes(backup.size)}
                  </p>
                </div>
                <button className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60" disabled={isBusy} type="button" onClick={() => handleRestore(backup)}>
                  Restore from Drive
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-2 text-xs leading-5 text-slate-500">
        <p>Google sign-in is optional. Lumo remains local-first and fully usable offline without Drive.</p>
        <p>Drive backups and sync change records are encrypted before upload to hidden app-specific appDataFolder storage. Google Drive does not receive plaintext notes or attachments.</p>
        <p>The Cloud Encryption Password protects Google Drive backups and sync records. It is separate from the Lock Password.</p>
        <p>If Google Drive already contains encrypted Lumo data, this device must enter the existing Cloud Encryption Password instead of creating a new one.</p>
        <p>Sync v1 is manual and stores conflicts until you choose how to resolve them.</p>
      </div>
      {activeConflict ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-night-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-white">Resolve sync conflict</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Both versions were preserved. Choose what should sync across devices.</p>
              </div>
              <button className="rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-white" type="button" onClick={() => setActiveConflict(null)}>
                Close
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <p className="text-sm font-medium text-slate-200">{conflictTitle(activeConflict)}</p>
              <p className="mt-1 text-xs text-slate-500">
                Local {activeConflict.localDeviceId || "this device"} · Remote {activeConflict.remoteDeviceId || "remote device"} · Detected {new Date(activeConflict.detectedAt).toLocaleString()}
              </p>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Mine</p>
                <p className="mt-2 text-xs leading-5 text-slate-300">{conflictPreview(activeConflict.localPayload)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Theirs</p>
                <p className="mt-2 text-xs leading-5 text-slate-300">{conflictPreview(activeConflict.remotePayload)}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60" disabled={isBusy} type="button" onClick={() => setActiveConflict(null)}>
                Decide later
              </button>
              <button className="rounded-xl border border-lumo-teal/20 bg-lumo-teal/10 px-3 py-2 text-xs font-medium text-lumo-teal transition hover:bg-lumo-teal/15 disabled:opacity-60" disabled={isBusy} type="button" onClick={() => void resolveConflict(activeConflict, "keep_local")}>
                Keep mine
              </button>
              <button className="rounded-xl border border-lumo-teal/20 bg-lumo-teal/10 px-3 py-2 text-xs font-medium text-lumo-teal transition hover:bg-lumo-teal/15 disabled:opacity-60" disabled={isBusy} type="button" onClick={() => void resolveConflict(activeConflict, "keep_remote")}>
                Keep theirs
              </button>
              <button className="rounded-xl bg-lumo-violet px-3 py-2 text-xs font-medium text-white transition hover:bg-lumo-violet/90 disabled:opacity-60" disabled={isBusy} type="button" onClick={() => void resolveConflict(activeConflict, "keep_both")}>
                Keep both
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <SecretPromptModal prompt={secretPrompt} onClose={() => setSecretPrompt(null)} />
    </div>
  );
}

export function SettingsScreen() {
  const [searchIndexStatus, setSearchIndexStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [appVersion, setAppVersion] = useState("");
  const { changeLockPassword, configureLockPassword, lockPasswordConfigured } = useNotes();

  useEffect(() => {
    let mounted = true;
    void getVersion()
      .then((version) => {
        if (mounted) setAppVersion(version);
      })
      .catch(() => {
        if (mounted) setAppVersion("Unknown");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleRebuildSearchIndex = async () => {
    setSearchIndexStatus("working");
    try {
      await rebuildSearchIndex();
      setSearchIndexStatus("done");
      notify({ kind: "success", title: "Search index rebuilt" });
    } catch {
      setSearchIndexStatus("error");
      notifyError("Could not rebuild search index", "SQLite search index rebuild failed.");
    }
  };

  return (
    <main className="column-panel editor-glow min-h-0 overflow-hidden">
      <div className="scroll-area h-full overflow-y-auto px-5 py-7 md:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-7">
            <p className="text-sm font-medium text-lumo-teal">Preferences</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Settings</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Configure Lumo Notes while keeping everything local to this device.
            </p>
          </div>

          <div className="grid gap-5">
            <SettingsCard title="Appearance">
              <ThemePicker />
              <AccentPicker />
              <AdvancedThemeColors />
            </SettingsCard>

            <SettingsCard title="Editor">
              <SettingSelect
                label="Font size"
                name="editorFontSize"
                options={[
                  { label: "Small", value: "small" },
                  { label: "Medium", value: "medium" },
                  { label: "Large", value: "large" },
                ]}
              />
              <SettingSelect
                label="Line height"
                name="editorLineHeight"
                options={[
                  { label: "Compact", value: "compact" },
                  { label: "Comfortable", value: "comfortable" },
                  { label: "Spacious", value: "spacious" },
                ]}
              />
              <SettingSelect
                helper="Changes the debounce before local SQLite writes."
                label="Autosave delay"
                name="autosaveDelay"
                options={[
                  { label: "Fast", value: "fast" },
                  { label: "Normal", value: "normal" },
                  { label: "Relaxed", value: "relaxed" },
                ]}
              />
            </SettingsCard>

            <SettingsCard title="Behavior">
              <SettingSelect
                label="Startup behavior"
                name="startupBehavior"
                options={[
                  { label: "Open last selected note", value: "lastNote" },
                  { label: "Open All Notes", value: "allNotes" },
                ]}
              />
              <SettingToggle
                helper="Controls confirmations for permanent deletion actions."
                label="Confirm before permanent delete"
                name="confirmPermanentDelete"
              />
              <SettingSelect
                label="New note title"
                name="newNoteTitleBehavior"
                options={[
                  { label: "Untitled Note", value: "untitled" },
                  { label: "Date/time title", value: "dateTime" },
                  { label: "First line as title after typing", value: "firstLine" },
                ]}
              />
            </SettingsCard>

            <SettingsCard title="Backup & Export">
              <SettingToggle label="Include YAML frontmatter in Markdown exports" name="markdownExportFrontmatter" />
              <SettingToggle label="Include trashed notes in full backups" name="backupIncludeTrash" />
              <SettingSelect
                label="Default export action"
                name="defaultExportAction"
                options={[
                  { label: "Markdown selected note", value: "markdownSelected" },
                  { label: "Full JSON backup", value: "jsonBackup" },
                ]}
              />
            </SettingsCard>

            <SettingsCard title="Sync">
              <SyncSettingsPanel appVersion={appVersion || "Unknown"} />
            </SettingsCard>

            <SettingsCard title="Privacy / Locked Notes">
              <div className="space-y-3 text-sm text-slate-300">
                <p>
                  Locked notes are encrypted locally with your Lock Password. If you forget this password,
                  locked notes cannot be recovered.
                </p>
                <p className="text-slate-500">
                  Titles, folders, and tags remain visible. Locked note bodies and previews are not stored
                  as plaintext, are excluded from the SQLite content index, and remain encrypted in backups.
                </p>
                <p className="text-slate-500">
                  Attachments on locked notes are encrypted at rest. Opening an encrypted attachment creates
                  a temporary decrypted copy that is cleared when locked sessions are closed or the app restarts.
                </p>
                <p className="text-slate-500">
                  Password recovery is not available. Changing the Lock Password re-encrypts locked notes
                  and encrypted attachments, then closes the current unlocked session.
                </p>
                <p className="text-slate-500">
                  Optional Google Drive backups use hidden appDataFolder storage and are encrypted before upload.
                  The Cloud Encryption Password is separate from the Lock Password and cannot be recovered by Lumo.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <span className="text-xs text-slate-500">
                    Status: {lockPasswordConfigured ? "Lock password configured" : "No lock password yet"}
                  </span>
                  {!lockPasswordConfigured ? (
                    <button
                      className="rounded-xl border border-lumo-teal/20 bg-lumo-teal/10 px-3 py-2 text-xs font-medium text-lumo-teal transition hover:bg-lumo-teal/15"
                      type="button"
                      onClick={() => void configureLockPassword()}
                    >
                      Set Lock Password
                    </button>
                  ) : null}
                  {lockPasswordConfigured ? (
                    <button
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] hover:text-white"
                      type="button"
                      onClick={() => void changeLockPassword()}
                    >
                      Change Lock Password
                    </button>
                  ) : null}
                </div>
              </div>
            </SettingsCard>

            <SettingsCard title="Keyboard Shortcuts">
              <div className="grid gap-2 sm:grid-cols-2">
                {shortcuts.map(([keys, action]) => (
                  <div key={keys} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="text-sm text-slate-300">{action}</span>
                    <span className="text-xs text-slate-500">{keys}</span>
                  </div>
                ))}
              </div>
            </SettingsCard>

            <SettingsCard title="About">
              <div className="space-y-2 text-sm text-slate-300">
                <p><span className="text-slate-500">App:</span> Lumo Notes</p>
                <p><span className="text-slate-500">Tagline:</span> Thoughts. Organized. Illuminated.</p>
                <p><span className="text-slate-500">Version:</span> {appVersion || "Loading..."}</p>
                <p className="text-slate-500">
                  Your notes are stored locally on this device. Use Export Backup to keep a safe copy.
                </p>
                <p className="text-slate-500">
                  Locked notes and locked attachments are encrypted locally. If you forget the Lock Password,
                  locked notes cannot be recovered. Exported unlocked locked notes are written as plaintext.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-3">
                  <button
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={searchIndexStatus === "working"}
                    onClick={handleRebuildSearchIndex}
                  >
                    {searchIndexStatus === "working" ? "Rebuilding..." : "Rebuild search index"}
                  </button>
                  {searchIndexStatus === "done" ? (
                    <span className="text-xs text-lumo-teal">Search index rebuilt.</span>
                  ) : null}
                  {searchIndexStatus === "error" ? (
                    <span className="text-xs text-rose-300">Could not rebuild search index.</span>
                  ) : null}
                </div>
              </div>
            </SettingsCard>
          </div>
        </div>
      </div>
    </main>
  );
}
