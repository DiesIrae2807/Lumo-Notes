import { BrandMark } from "./BrandMark";
import { SectionHeader } from "./SectionHeader";
import { collections, navigation, tags } from "../data/mockData";

function IconDot({ active }: { active?: boolean }) {
  return (
    <span
      className={`h-2.5 w-2.5 rounded-full border ${
        active
          ? "border-lumo-teal bg-lumo-teal shadow-[0_0_18px_rgba(89,213,202,0.35)]"
          : "border-slate-500 bg-slate-700"
      }`}
    />
  );
}

export function Sidebar() {
  return (
    <aside className="panel hidden min-h-0 flex-col overflow-hidden p-4 lg:flex">
      <div className="mb-7 flex items-center gap-3">
        <BrandMark />
        <div>
          <h1 className="text-lg font-semibold text-white">Lumo Notes</h1>
          <p className="text-xs text-slate-400">Thoughts. Organized. Illuminated.</p>
        </div>
      </div>

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
            <IconDot active={item.active} />
            <span className="flex-1 text-left">{item.label}</span>
            {item.count ? <span className="text-xs text-slate-500">{item.count}</span> : null}
          </button>
        ))}
      </nav>

      <div className="my-6 h-px bg-white/10" />

      <div className="space-y-3">
        <SectionHeader title="Collections" action="+" />
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

      <div className="mt-auto space-y-3 pt-6">
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
    </aside>
  );
}
