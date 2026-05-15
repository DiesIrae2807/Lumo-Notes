import { useSettings } from "../store/settingsStore";
import {
  defaultCustomThemeDark,
  defaultCustomThemeLight,
  defaultSettings,
  type AppSettings,
  type CustomThemeColors,
} from "../types/settings";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { rebuildSearchIndex } from "../services/database";
import { notify, notifyError } from "../utils/toast";
import { confirmDialog } from "../utils/confirm";
import { useNotes } from "../store/notesStore";
import { getVersion } from "@tauri-apps/api/app";

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

export function SettingsScreen() {
  const [searchIndexStatus, setSearchIndexStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [appVersion, setAppVersion] = useState("");
  const { configureLockPassword, lockAllNotes, lockPasswordConfigured } = useNotes();

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
                  Attachment files are not encrypted yet. Locking a note protects the note text only.
                </p>
                <p className="text-slate-500">
                  Password recovery is not available. Password changes are disabled until full re-encryption
                  tooling is added.
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
                  <button
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] hover:text-white"
                    type="button"
                    onClick={() => void lockAllNotes()}
                  >
                    Lock all unlocked notes
                  </button>
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
