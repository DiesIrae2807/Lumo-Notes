import type { ReactNode } from "react";

type IconProps = {
  className?: string;
  size?: number;
};

function SvgIcon({
  children,
  className,
  size = 16,
  viewBox = "0 0 24 24",
}: IconProps & { children: ReactNode; viewBox?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox={viewBox}
      width={size}
    >
      {children}
    </svg>
  );
}

export function AllNotesIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M7 3.75h7.2L18 7.55v12.7H7a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2Z" />
      <path d="M14 3.9v3.85h3.8" />
      <path d="M8.8 11h5.8M8.8 14.4h6.4M8.8 17.8h4.3" />
    </SvgIcon>
  );
}

export function ArchiveIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4.2 7.4h15.6" />
      <path d="M5.25 7.4l.9 12.1h11.7l.9-12.1" />
      <path d="M7 3.75h10l1.15 3.65H5.85L7 3.75Z" />
      <path d="M9.2 11.75h5.6" />
    </SvgIcon>
  );
}

export function AttachmentIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M8.6 12.4l4.95-4.95a3.15 3.15 0 1 1 4.45 4.45l-6.15 6.15a4.45 4.45 0 0 1-6.3-6.3l6.55-6.55" />
      <path d="M15.2 10.25l-6.1 6.1a1.75 1.75 0 0 1-2.45-2.5l5.35-5.35" />
    </SvgIcon>
  );
}

export function BoldIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M8 5h5.1a3.1 3.1 0 0 1 0 6.2H8V5Z" />
      <path d="M8 11.2h6a3.4 3.4 0 0 1 0 6.8H8v-6.8Z" />
      <path d="M8 5v13" />
    </SvgIcon>
  );
}

export function BulletListIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M9 6.5h10" />
      <path d="M9 12h10" />
      <path d="M9 17.5h10" />
      <path d="M5 6.5h.01M5 12h.01M5 17.5h.01" />
    </SvgIcon>
  );
}

export function CheckSquareIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect height="13.5" rx="3" width="13.5" x="5.25" y="5.25" />
      <path d="M8.6 12.1l2.05 2.05L15.6 9.2" />
    </SvgIcon>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M9.4 8.2L5.6 12l3.8 3.8" />
      <path d="M14.6 8.2l3.8 3.8-3.8 3.8" />
      <path d="M12.9 6.8l-1.8 10.4" />
    </SvgIcon>
  );
}

export function GraphIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="6.5" cy="12" r="2.4" />
      <circle cx="17.5" cy="6.5" r="2.4" />
      <circle cx="17.5" cy="17.5" r="2.4" />
      <path d="M8.7 10.9l6.65-3.3M8.7 13.1l6.65 3.3" />
    </SvgIcon>
  );
}

export function HeadingIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M6.5 5.5v13" />
      <path d="M17.5 5.5v13" />
      <path d="M6.5 12h11" />
    </SvgIcon>
  );
}

export function HighlightIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M6.4 14.8L14.8 6.4l2.8 2.8-8.4 8.4H6.4v-2.8Z" />
      <path d="M13.25 7.95l2.8 2.8" />
      <path d="M4.6 19.1h14.8" />
    </SvgIcon>
  );
}

export function ItalicIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M10 5h7" />
      <path d="M7 19h7" />
      <path d="M14 5l-4 14" />
    </SvgIcon>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M9.8 14.2l4.4-4.4" />
      <path d="M11.3 6.7l.85-.85a4 4 0 0 1 5.65 5.65l-1.15 1.15a4 4 0 0 1-5.65 0" />
      <path d="M12.7 17.3l-.85.85A4 4 0 0 1 6.2 12.5l1.15-1.15a4 4 0 0 1 5.65 0" />
    </SvgIcon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect height="9.5" rx="2.4" width="12.5" x="5.75" y="10.25" />
      <path d="M8.4 10.25V8.1a3.6 3.6 0 0 1 7.2 0v2.15" />
      <path d="M12 14.1v2.1" />
    </SvgIcon>
  );
}

export function UnlockIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect height="9.5" rx="2.4" width="12.5" x="5.75" y="10.25" />
      <path d="M8.4 10.25V8.1a3.6 3.6 0 0 1 6.4-2.25" />
      <path d="M12 14.1v2.1" />
    </SvgIcon>
  );
}

export function NumberedListIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M10 6.5h9" />
      <path d="M10 12h9" />
      <path d="M10 17.5h9" />
      <path d="M5.2 5.1v3M4.4 8.1H6" />
      <path d="M4.3 11.2a1.15 1.15 0 0 1 2.2.5c0 .55-.38.9-.9 1.3l-1.35 1h2.35" />
      <path d="M4.35 16.25h2.2l-1.2 1.15a1.1 1.1 0 1 1-.95 1.9" />
    </SvgIcon>
  );
}

export function QuoteIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M8.4 10.1h3.1v7H5.8v-5.2c0-3.55 1.4-5.65 4.25-6.55" />
      <path d="M16.1 10.1h3.1v7h-5.7v-5.2c0-3.55 1.4-5.65 4.25-6.55" />
    </SvgIcon>
  );
}

export function RecentIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4.8 6.8A8.15 8.15 0 1 1 4.2 12" />
      <path d="M4.8 4.35V6.8h2.45" />
      <path d="M12 7.8v4.65l3.05 1.9" />
    </SvgIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.1 13.2a7.5 7.5 0 0 0 .05-2.4l2-1.5-2-3.45-2.45.95a7.7 7.7 0 0 0-2.1-1.2L14.25 3h-4.5L9.4 5.6a7.7 7.7 0 0 0-2.1 1.2l-2.45-.95-2 3.45 2 1.5a7.5 7.5 0 0 0 .05 2.4l-2 1.5 2 3.45 2.45-.95a7.7 7.7 0 0 0 2.1 1.2l.35 2.6h4.5l.35-2.6a7.7 7.7 0 0 0 2.1-1.2l2.45.95 2-3.45-2-1.5Z" />
    </SvgIcon>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 4.4l2.25 4.55 5.02.73-3.63 3.55.86 5-4.5-2.36-4.5 2.36.86-5-3.63-3.55 5.02-.73L12 4.4Z" />
    </SvgIcon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4.8 7.2h14.4" />
      <path d="M9.2 7.2V5.1h5.6v2.1" />
      <path d="M7 7.2l.8 12h8.4l.8-12" />
      <path d="M10.2 10.5v5.4M13.8 10.5v5.4" />
    </SvgIcon>
  );
}

export function UnderlineIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M7 5.5v5.8a5 5 0 0 0 10 0V5.5" />
      <path d="M6 19h12" />
    </SvgIcon>
  );
}
