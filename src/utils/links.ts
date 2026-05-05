import type { Note } from "../types/note";

export type InternalLink = {
  targetTitle: string;
  alias: string | null;
  rawText: string;
  sourceNoteId: string;
};

export type ResolvedInternalLink = InternalLink & {
  targetNote: Note | null;
};

export function normalizeInternalLinkTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function parseInternalLinkText(rawText: string) {
  const body = rawText.replace(/^\[\[/, "").replace(/\]\]$/, "");
  const separatorIndex = body.indexOf("|");
  const rawTitle = separatorIndex >= 0 ? body.slice(0, separatorIndex) : body;
  const rawAlias = separatorIndex >= 0 ? body.slice(separatorIndex + 1) : "";
  const targetTitle = rawTitle.trim().replace(/\s+/g, " ");
  const alias = rawAlias.trim().replace(/\s+/g, " ");

  return {
    targetTitle,
    alias: alias || null,
  };
}

export function parseInternalLinks(content: string, sourceNoteId: string): InternalLink[] {
  const links: InternalLink[] = [];

  for (const match of content.matchAll(/\[\[([^\]]*)\]\]/g)) {
    const rawText = match[0];
    const { targetTitle, alias } = parseInternalLinkText(rawText);

    if (!targetTitle) {
      continue;
    }

    links.push({
      targetTitle,
      alias,
      rawText,
      sourceNoteId,
    });
  }

  return links;
}

export function resolveInternalLink(
  targetTitle: string,
  notes: Note[],
  includeDeleted = false,
) {
  const normalizedTarget = normalizeInternalLinkTitle(targetTitle);
  if (!normalizedTarget) {
    return null;
  }

  return (
    notes
      .filter((note) => includeDeleted || !note.isDeleted)
      .filter((note) => normalizeInternalLinkTitle(note.title) === normalizedTarget)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0] ?? null
  );
}

export function resolveInternalLinks(
  links: InternalLink[],
  notes: Note[],
  includeDeleted = false,
): ResolvedInternalLink[] {
  return links.map((link) => ({
    ...link,
    targetNote: resolveInternalLink(link.targetTitle, notes, includeDeleted),
  }));
}

export function uniqueResolvedNotes(links: ResolvedInternalLink[]) {
  const seen = new Set<string>();
  const result: Note[] = [];

  for (const link of links) {
    if (!link.targetNote || seen.has(link.targetNote.id)) {
      continue;
    }

    seen.add(link.targetNote.id);
    result.push(link.targetNote);
  }

  return result;
}
