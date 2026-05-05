import type { ReactNode } from "react";

type MarkdownPreviewProps = {
  content: string;
  onInternalLinkClick?: (title: string) => void;
};

type ListItem = {
  checked?: boolean;
  text: string;
};

const inlinePatterns =
  /(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;

function renderInline(text: string, onInternalLinkClick?: (title: string) => void): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(inlinePatterns)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    if (token.startsWith("[[") && token.endsWith("]]")) {
      const title = token.slice(2, -2).trim();
      nodes.push(
        <button
          key={`${index}-${token}`}
          className="markdown-internal-link"
          type="button"
          onClick={() => onInternalLinkClick?.(title)}
        >
          {title}
        </button>,
      );
    } else if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
      const labelEnd = token.indexOf("](");
      const label = token.slice(1, labelEnd);
      const href = token.slice(labelEnd + 2, -1);
      nodes.push(
        <a key={`${index}-${token}`} href={href} onClick={(event) => event.preventDefault()}>
          {label}
        </a>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={`${index}-${token}`}>{token.slice(1, -1)}</code>);
    } else if (
      (token.startsWith("**") && token.endsWith("**")) ||
      (token.startsWith("__") && token.endsWith("__"))
    ) {
      nodes.push(
        <strong key={`${index}-${token}`}>
          {renderInline(token.slice(2, -2), onInternalLinkClick)}
        </strong>,
      );
    } else if (
      (token.startsWith("*") && token.endsWith("*")) ||
      (token.startsWith("_") && token.endsWith("_"))
    ) {
      nodes.push(
        <em key={`${index}-${token}`}>
          {renderInline(token.slice(1, -1), onInternalLinkClick)}
        </em>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderInlineLines(
  lines: string[],
  keyPrefix: string,
  onInternalLinkClick?: (title: string) => void,
): ReactNode[] {
  return lines.flatMap((line, index) => {
    const nodes = renderInline(line, onInternalLinkClick);

    if (index === lines.length - 1) {
      return nodes;
    }

    return [...nodes, <br key={`${keyPrefix}-break-${index}`} />];
  });
}

function collectList(lines: string[], startIndex: number, ordered: boolean) {
  const items: ListItem[] = [];
  let index = startIndex;
  const pattern = ordered
    ? /^\s*\d+\.\s+(.*)$/
    : /^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/;

  while (index < lines.length) {
    const match = lines[index].match(pattern);
    if (!match) break;

    if (ordered) {
      items.push({ text: match[1] });
    } else {
      items.push({
        checked: match[1] ? match[1].toLowerCase() === "x" : undefined,
        text: match[2],
      });
    }

    index += 1;
  }

  return { items, nextIndex: index };
}

export function MarkdownPreview({ content, onInternalLinkClick }: MarkdownPreviewProps) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) index += 1;

      blocks.push(
        <pre key={`code-${index}`}>
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      const Tag = `h${level}` as "h1" | "h2" | "h3";
      blocks.push(
        <Tag key={`heading-${index}`}>{renderInline(heading[2], onInternalLinkClick)}</Tag>,
      );
      index += 1;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const { items, nextIndex } = collectList(lines, index, false);
      blocks.push(
        <ul key={`ul-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`${item.text}-${itemIndex}`} className={item.checked !== undefined ? "task-item" : ""}>
              {item.checked !== undefined ? (
                <input type="checkbox" checked={item.checked} readOnly />
              ) : null}
              <span>{renderInline(item.text, onInternalLinkClick)}</span>
            </li>
          ))}
        </ul>,
      );
      index = nextIndex;
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const { items, nextIndex } = collectList(lines, index, true);
      blocks.push(
        <ol key={`ol-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`${item.text}-${itemIndex}`}>
              {renderInline(item.text, onInternalLinkClick)}
            </li>
          ))}
        </ol>,
      );
      index = nextIndex;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${index}`}>
          {renderInlineLines(quoteLines, `quote-${index}`, onInternalLinkClick)}
        </blockquote>,
      );
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;

    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trim().startsWith("```") &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index]) &&
      !/^>\s?/.test(lines[index])
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    blocks.push(
      <p key={`p-${index}`}>
        {renderInlineLines(paragraphLines, `p-${index}`, onInternalLinkClick)}
      </p>,
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="markdown-preview markdown-preview-empty">
        Start writing to see a rendered preview.
      </div>
    );
  }

  return <div className="markdown-preview">{blocks}</div>;
}
