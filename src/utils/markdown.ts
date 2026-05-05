import { parseInternalLinkText } from "./links";

export function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, (raw) => {
      const { targetTitle, alias } = parseInternalLinkText(raw);
      return alias || targetTitle;
    })
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function getPlainTextPreview(content: string, maxLength = 96) {
  const plain = markdownToPlainText(content);

  if (plain.length <= maxLength) {
    return plain;
  }

  const trimmed = plain.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
  return `${trimmed || plain.slice(0, maxLength).trim()}...`;
}

export function excerptFromMarkdown(markdown: string, maxLength = 220) {
  return getPlainTextPreview(markdown, maxLength);
}
