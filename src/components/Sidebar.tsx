import { BrandMark } from "./BrandMark";
import { SectionHeader } from "./SectionHeader";
import { collections, navigation, tags } from "../data/mockData";

const navGlyphs: Record<string, string> = {
  "All Notes": "A",
  Favorites: "F",
  Recent: "R",
  Starred: "S",
  Trash: "T",
};

function IconDot({ active, label }: { active?: boolean; label: string }) {
  return (
    <span
      className={`grid h-4 w-4 place-items-center rounded-md border text-[10px] font-semibold ${
        active
          ? "border-lumo-teal/70 bg-lumo-teal/20 text-lumo-teal"
          : "border-slate-600 bg-slate-800/60 text-slate-400"
      }`}
    >
      {navGlyphs[label]}
    </span>
  );
}

export function Sidebar() {
  return (
    <aside className="column-panel hidden min-h-0 flex-col overflow-hidden p-3 lg:flex">
      <button className="mb-4 flex w-full items-center justify-between rounded-xl border border-lumo-violet/20 bg-lumo-violet/[0.08] px-3 py-2.5 text-sm text-white transition hover:border-lumo-violet/40 active:scale-[0.99]">
        <span className="flex items-center gap-2">
          <BrandMark size="sm" />
          <span>New Note</span>
        </span>
        <span className="text-xs text-slate-400">Ctrl N</span>
      </button>

      <nav className="space-y-1">
        {navigation.map((item) => (
          <button
            key={item.label}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition active:scale-[0.99] ${
              item.active
                ? "border border-lumo-teal/20 bg-lumo-teal/10 text-white"
                : "text-slate-300 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <IconDot active={item.active} label={item.label} />
            <span className="flex-1 text-left">{item.label}</span>
            {item.count ? <span className="text-xs text-slate-500">{item.count}</span> : null}
          </button>
        ))}
      </nav>

      <div className="my-6 h-px bg-white/10" />

      <div className="space-y-3">
        <SectionHeader title="Views" action="+" />
        <div className="space-y-1">
          {collections.map((collection) => (
            <button
              key={collection.label}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.04] hover:text-white active:scale-[0.99]"
            >
              <span className={`h-2.5 w-2.5 rounded ${collection.color}`} />
              <span>{collection.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-3 border-t border-white/10 pt-5">
        <SectionHeader title="Tags" action="+" />
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag.label}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-lumo-violet/40 hover:text-white active:scale-95"
            >
              {tag.label}
            </button>
          ))}
        </div>
        <button className="w-full rounded-xl border border-dashed border-white/10 px-3 py-2 text-left text-sm text-slate-500 transition hover:border-lumo-teal/30 hover:text-slate-300">
          + New tag
        </button>
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-white/10 pt-4">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-lumo-violet text-sm font-semibold text-white">
          AS
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">Alex Smith</p>
          <p className="truncate text-xs text-slate-500">alex@lumonotes.app</p>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:text-white">
          +
        </button>
      </div>
    </aside>
  );
}
