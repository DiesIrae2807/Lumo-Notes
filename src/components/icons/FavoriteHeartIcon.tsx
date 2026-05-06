export function FavoriteHeartIcon({ active = false, className = "" }: { active?: boolean; className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 20.2C8.9 17.55 5 14.38 5 10.25C5 7.85 6.84 6 9.13 6C10.43 6 11.45 6.58 12 7.45C12.55 6.58 13.57 6 14.87 6C17.16 6 19 7.85 19 10.25C19 14.38 15.1 17.55 12 20.2Z"
        className={
          active
            ? "fill-[#FF4D6D] stroke-[#FF4D6D] drop-shadow-[0_0_8px_rgba(255,77,109,0.35)]"
            : "fill-transparent stroke-current"
        }
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
