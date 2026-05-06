export function PinIcon({ active = false, className = "" }: { active?: boolean; className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <g transform="rotate(-18 12 12)">
        <path
          d="M9 4.8H15L14.2 10.4L17 13.2V15H13V20L12 21L11 20V15H7V13.2L9.8 10.4L9 4.8Z"
          className={
            active
              ? "fill-lumo-teal stroke-lumo-teal drop-shadow-[0_0_8px_rgba(94,230,214,0.45)]"
              : "fill-transparent stroke-current"
          }
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
