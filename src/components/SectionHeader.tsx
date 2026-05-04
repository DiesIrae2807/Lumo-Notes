type SectionHeaderProps = {
  title: string;
  action?: string;
};

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
      <span>{title}</span>
      {action ? (
        <button className="rounded-full px-2 py-1 text-slate-400 transition hover:bg-white/5 hover:text-white active:scale-95">
          {action}
        </button>
      ) : null}
    </div>
  );
}
