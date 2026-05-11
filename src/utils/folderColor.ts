import type { CSSProperties } from "react";

const legacyFolderColors: Record<string, string> = {
  "bg-lumo-violet": "#9B6CFF",
  "bg-lumo-teal": "#5EE6D6",
  "bg-lumo-blue": "#7FB2FF",
  "bg-emerald-300": "#6EE7B7",
  "bg-violet-400": "#A78BFA",
  "bg-indigo-200": "#C7D2FE",
  "bg-rose-400": "#FB7185",
  "bg-amber-300": "#FCD34D",
  "bg-slate-400": "#94A3B8",
};

const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

export function normalizeFolderColor(value?: string, fallback = "#9B6CFF") {
  const trimmed = value?.trim() ?? "";
  if (hexColorPattern.test(trimmed)) return trimmed;
  return legacyFolderColors[trimmed] ?? fallback;
}

export function getFolderDotProps(value?: string, sizeClass = "h-2.5 w-2.5") {
  if (value && legacyFolderColors[value]) {
    return {
      className: `${sizeClass} rounded ${value}`,
      style: undefined,
    };
  }

  return {
    className: `${sizeClass} rounded`,
    style: { backgroundColor: normalizeFolderColor(value) } satisfies CSSProperties,
  };
}

export function getFolderChipStyle(value?: string): CSSProperties {
  const color = normalizeFolderColor(value, "#94A3B8");

  return {
    background: `color-mix(in srgb, ${color} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 34%, transparent)`,
    color,
  };
}
