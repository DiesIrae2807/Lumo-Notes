export type NavItem = {
  label: string;
  count?: number;
  active?: boolean;
};

export type Collection = {
  label: string;
  color: string;
};

export type Tag = {
  label: string;
};

export type Note = {
  title: string;
  preview: string;
  tag: string;
  time: string;
  accent: "violet" | "teal" | "blue" | "rose" | "amber";
  active?: boolean;
};

export const navigation: NavItem[] = [
  { label: "All Notes", count: 128, active: true },
  { label: "Favorites", count: 16 },
  { label: "Recent" },
  { label: "Starred", count: 8 },
  { label: "Trash" },
];

export const collections: Collection[] = [
  { label: "Projects", color: "bg-lumo-violet" },
  { label: "Personal", color: "bg-lumo-teal" },
  { label: "Ideas", color: "bg-emerald-300" },
  { label: "Learning", color: "bg-violet-400" },
  { label: "Archive", color: "bg-indigo-200" },
];

export const tags: Tag[] = [
  { label: "work" },
  { label: "product" },
  { label: "design" },
  { label: "personal" },
  { label: "ideas" },
  { label: "planning" },
];

export const pinnedNotes: Note[] = [
  {
    title: "Project Aurora",
    preview: "Product vision, goals, and roadmap",
    tag: "Work",
    time: "2m ago",
    accent: "violet",
    active: true,
  },
  {
    title: "Branding Ideas",
    preview: "Color, typography, style, moodboard",
    tag: "Personal",
    time: "1h ago",
    accent: "rose",
  },
];

export const todayNotes: Note[] = [
  {
    title: "Design system exploration",
    preview: "Color, typography, components",
    tag: "Design",
    time: "3h ago",
    accent: "amber",
  },
  {
    title: "User interviews",
    preview: "What users need, learnings, gratitude",
    tag: "Personal",
    time: "5h ago",
    accent: "teal",
  },
  {
    title: "Marketing strategy",
    preview: "Positioning, messaging, channels",
    tag: "Work",
    time: "Yesterday",
    accent: "rose",
  },
];

export const weekNotes: Note[] = [
  {
    title: "User research synthesis",
    preview: "Insights from interviews and surveys",
    tag: "Product",
    time: "2d ago",
    accent: "rose",
  },
  {
    title: "Project Aurora - Wireframe",
    preview: "Design system, new flows, and tasks",
    tag: "Work",
    time: "Apr 20",
    accent: "teal",
  },
  {
    title: "Ideas backlog",
    preview: "Future ideas and inspiration",
    tag: "Ideas",
    time: "Apr 10",
    accent: "teal",
  },
];

export const relatedNotes = [
  { title: "Design system exploration", time: "3h ago", accent: "violet" },
  { title: "User research synthesis", time: "2d ago", accent: "teal" },
  { title: "Marketing strategy", time: "Yesterday", accent: "rose" },
] as const;
