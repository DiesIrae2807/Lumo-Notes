import { useSettings } from "../store/settingsStore";
import type { AppSettings } from "../types/settings";
import { useState, type CSSProperties, type ReactNode } from "react";
import { rebuildSearchIndex } from "../services/database";
import { notify, notifyError } from "../utils/toast";

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
  value: AppSettings["accent"];
}> = [
  { colors: ["#9c7cf4", "#59d5ca"], description: "Default", label: "Violet / Teal", value: "teal" },
  { colors: ["#9c7cf4", "#7fb2ff"], description: "Cool blue", label: "Blue", value: "blue" },
  { colors: ["#9c7cf4", "#5ee6a8"], description: "Fresh green", label: "Green", value: "green" },
  { colors: ["#9c7cf4", "#ff6f91"], description: "Soft rose", label: "Rose", value: "rose" },
  { colors: ["#9c7cf4", "#f6c85f"], description: "Warm amber", label: "Amber", value: "amber" },
];

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
                <p><span className="text-slate-500">Version:</span> 0.1.0</p>
                <p className="text-slate-500">Your notes are stored locally on this device.</p>
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
