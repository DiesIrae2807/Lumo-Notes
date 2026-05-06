export function InsightsIcon({ active = false, className = "" }: { active?: boolean; className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        className={`transition-colors duration-150 ${
          active ? "fill-[#101827] stroke-lumo-violet" : "fill-[#101827] stroke-[#243044]"
        }`}
        strokeWidth="1.4"
      />
      <path
        d="M10.5 20.5L15 15.5L21.5 11.5"
        className={active ? "stroke-lumo-teal" : "stroke-[#6F7A91]"}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle
        cx="10.5"
        cy="20.5"
        r="2.2"
        className={active ? "fill-[#101827] stroke-lumo-teal" : "fill-[#101827] stroke-[#6F7A91]"}
        strokeWidth="1.3"
      />
      <circle cx="15" cy="15.5" r="2.6" className={active ? "fill-lumo-teal" : "fill-[#6F7A91]"} />
      <circle
        cx="21.5"
        cy="11.5"
        r="2.2"
        className={active ? "fill-[#101827] stroke-lumo-violet" : "fill-[#101827] stroke-[#6F7A91]"}
        strokeWidth="1.3"
      />
      <circle
        cx="16"
        cy="16"
        r="8.5"
        className={active ? "stroke-lumo-violet opacity-60" : "stroke-[#243044] opacity-70"}
        strokeWidth="1"
      />
    </svg>
  );
}
