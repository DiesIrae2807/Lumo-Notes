export function FocusIcon({ active = false, className = "" }: { active?: boolean; className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {active ? <rect x="3" y="3" width="18" height="18" rx="7" className="fill-lumo-violet/20" /> : null}
      <path
        d="M8 5H5V8M16 5H19V8M8 19H5V16M16 19H19V16"
        className={active ? "stroke-lumo-violet" : "stroke-current"}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2" className={active ? "fill-lumo-teal" : "fill-current"} />
    </svg>
  );
}
