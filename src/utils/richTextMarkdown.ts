const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const inlineMarkdownToHtml = (value: string, attachmentUrls: Record<string, string> = {}) => {
  let next = escapeHtml(value);
  next = next.replace(/!\[([^\]]*)\]\((attachment:\/\/[^)]+)\)(?:\{width=(\d+)\})?/g, (_match, alt, src, width) => {
    const id = String(src).slice("attachment://".length);
    const widthAttrs = width ? ` data-width="${width}" style="width: ${width}px;"` : "";
    return `<img src="${attachmentUrls[id] ?? src}" data-attachment-src="${src}" alt="${alt}"${widthAttrs} />`;
  });
  next = next.replace(/\[([^\]]+)\]\((attachment:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
  next = next.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  next = next.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<a href="internal:$1">$2</a>');
  next = next.replace(/\[\[([^\]]+)\]\]/g, '<a href="internal:$1">$1</a>');
  next = next.replace(/`([^`]+)`/g, "<code>$1</code>");
  next = next.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  next = next.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  next = next.replace(/==([^=]+)==/g, '<span data-accent-heading="true">$1</span>');
  return next;
};

export function markdownToEditorHtml(markdown: string, attachmentUrls: Record<string, string> = {}) {
  if (!markdown.trim()) return "";

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      blocks.push("<p></p>");
      index += 1;
      continue;
    }

    const fence = line.match(/^```/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const accentHeading = heading[2].match(/^==(.+)==$/);
      const text = accentHeading ? accentHeading[1] : heading[2];
      const accentAttribute = accentHeading ? ' data-accent-heading="true"' : "";
      blocks.push(`<h${level}${accentAttribute}>${inlineMarkdownToHtml(text, attachmentUrls)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote><p>${quote.map((item) => inlineMarkdownToHtml(item, attachmentUrls)).join("<br>")}</p></blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+\[[ xX]\]\s+/.test(lines[index])) {
        const checked = /\[[xX]\]/.test(lines[index]);
        const text = lines[index].replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "");
        items.push(`<li data-type="taskItem" data-checked="${checked ? "true" : "false"}"><label><input type="checkbox" ${checked ? "checked" : ""}><span></span></label><div><p>${inlineMarkdownToHtml(text, attachmentUrls)}</p></div></li>`);
        index += 1;
      }
      blocks.push(`<ul data-type="taskList">${items.join("")}</ul>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(`<li><p>${inlineMarkdownToHtml(lines[index].replace(/^\s*[-*+]\s+/, ""), attachmentUrls)}</p></li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(`<li><p>${inlineMarkdownToHtml(lines[index].replace(/^\s*\d+\.\s+/, ""), attachmentUrls)}</p></li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^>\s?/.test(lines[index]) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index]) &&
      !lines[index].startsWith("```")
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${paragraph.map((item) => inlineMarkdownToHtml(item, attachmentUrls)).join("<br>")}</p>`);
  }

  return blocks.join("");
}

const textContent = (node: Node): string => node.textContent ?? "";

function inlineNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";

  const children = Array.from(node.childNodes).map(inlineNodeToMarkdown).join("");
  const tag = node.tagName.toLowerCase();

  if (tag === "strong" || tag === "b") return `**${children}**`;
  if (tag === "em" || tag === "i") return `*${children}*`;
  if (tag === "code") return `\`${children}\``;
  if (tag === "br") return "\n";
  if (tag === "img") {
    const source = node.getAttribute("data-attachment-src") ?? node.getAttribute("src") ?? "";
    if (source.startsWith("data:")) {
      return "";
    }
    const width = node.getAttribute("data-width") ?? "";
    return `![${node.getAttribute("alt") ?? "image"}](${source})${width ? `{width=${width}}` : ""}`;
  }
  if (tag === "a") {
    const href = node.getAttribute("href") ?? "";
    if (href.startsWith("internal:")) {
      const target = decodeURIComponent(href.slice("internal:".length));
      return children && children !== target ? `[[${target}|${children}]]` : `[[${target}]]`;
    }
    return `[${children || href}](${href})`;
  }

  return children;
}

function blockNodeToMarkdown(node: Element): string {
  const tag = node.tagName.toLowerCase();
  const inline = () => Array.from(node.childNodes).map(inlineNodeToMarkdown).join("").trimEnd();

  if (/^h[1-6]$/.test(tag)) {
    const content = inline();
    return `${"#".repeat(Number(tag.slice(1)))} ${
      node.getAttribute("data-accent-heading") === "true" ? `==${content}==` : content
    }`;
  }
  if (tag === "p") return inline();
  if (tag === "blockquote") {
    return Array.from(node.childNodes)
      .map((child) => child instanceof Element ? blockNodeToMarkdown(child) : textContent(child))
      .join("\n")
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }
  if (tag === "pre") return `\`\`\`\n${textContent(node).replace(/\n$/, "")}\n\`\`\``;
  if (tag === "ul") {
    const isTaskList = node.getAttribute("data-type") === "taskList";
    return Array.from(node.children)
      .map((child) => {
        const text = Array.from(child.childNodes)
          .filter((item) => !(item instanceof HTMLLabelElement))
          .map(inlineNodeToMarkdown)
          .join("")
          .trim();
        if (isTaskList || child.getAttribute("data-type") === "taskItem") {
          return `- [${child.getAttribute("data-checked") === "true" ? "x" : " "}] ${text}`;
        }
        return `- ${text}`;
      })
      .join("\n");
  }
  if (tag === "ol") {
    return Array.from(node.children)
      .map((child, index) => `${index + 1}. ${Array.from(child.childNodes).map(inlineNodeToMarkdown).join("").trim()}`)
      .join("\n");
  }
  return inline();
}

export function editorHtmlToMarkdown(html: string) {
  const document = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html");
  const root = document.querySelector("main");
  if (!root) return "";

  return Array.from(root.children)
    .map(blockNodeToMarkdown)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
