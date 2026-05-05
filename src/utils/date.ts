const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function isYesterday(date: string) {
  const value = new Date(date);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(value, yesterday);
}

export function isThisWeek(date: string) {
  const delta = Date.now() - new Date(date).getTime();
  return delta >= day && delta < day * 7 && !isYesterday(date);
}

export function formatRelativeTime(date: string) {
  const value = new Date(date);
  const delta = Date.now() - value.getTime();

  if (delta < minute) return "just now";

  const minutes = Math.floor(delta / minute);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  if (isYesterday(date)) return "Yesterday";

  const now = new Date();
  const options: Intl.DateTimeFormatOptions =
    value.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };

  return new Intl.DateTimeFormat(undefined, options).format(value);
}

export function formatMetadataDate(date: string) {
  const value = new Date(date);
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(value.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  };

  return new Intl.DateTimeFormat(undefined, options).format(value);
}
