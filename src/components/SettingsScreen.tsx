import { useSettings } from "../store/settingsStore";
import type { AppSettings } from "../types/settings";
import type { ReactNode } from "react";

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

function SettingsCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
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
        className={`relative h-6 w-11 rounded-full transition ${
          enabled ? "bg-lumo-teal/70" : "bg-slate-700"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
            enabled ? "left-6" : "left-1"
          }`}
        />
      </span>
    </button>
  );
}

export function SettingsScreen() {
  return (
    <main className="column-panel editor-glow col-span-1 min-h-0 overflow-hidden xl:col-span-2">
      <div className="scroll-area h-full overflow-y-auto px-8 py-7">
        <div className="mx-auto max-w-4xl">
          <div className="mb-7">
            <p className="text-sm font-medium text-lumo-teal">Preferences</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Settings</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Configure Lumo Notes while keeping everything local to this device.
            </p>
          </div>

          <div className="grid gap-5">
            <SettingsCard title="Appearance">
              <SettingSelect
                label="Theme"
                name="theme"
                options={[
                  { label: "Dark", value: "dark" },
                  { label: "Light", value: "light" },
                  { label: "System", value: "system" },
                ]}
              />
              <SettingSelect
                label="Accent"
                name="accent"
                options={[
                  { label: "Violet / Teal", value: "violetTeal" },
                  { label: "Blue", value: "blue" },
                  { label: "Green", value: "green" },
                  { label: "Rose", value: "rose" },
                  { label: "Amber", value: "amber" },
                ]}
              />
            </SettingsCard>

            <SettingsCard title="Editor">
              <SettingSelect
                label="Default editor mode"
                name="defaultEditorMode"
                options={[
                  { label: "Edit", value: "edit" },
                  { label: "Preview", value: "preview" },
                  { label: "Split", value: "split" },
                ]}
              />
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
              </div>
            </SettingsCard>
          </div>
        </div>
      </div>
    </main>
  );
}
