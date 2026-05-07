import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Attachment } from "../types/note";
import { editorHtmlToMarkdown, markdownToEditorHtml } from "../utils/richTextMarkdown";
import { getAttachmentDataUrl } from "../services/database";
import { richTextExtensions } from "./editorExtensions";

export type RichTextAction =
  | "bold"
  | "italic"
  | "heading"
  | "accentHeading"
  | "bullet"
  | "numbered"
  | "quote"
  | "code"
  | "checkbox"
  | "link";

export type RichTextLinkRequest = {
  selectedText: string;
  title?: string;
};

type RichTextEditorProps = {
  attachments: Attachment[];
  content: string;
  isFocusMode?: boolean;
  isTypewriter?: boolean;
  noteId: string;
  onAttachmentClick?: (id: string) => void;
  onBlur?: () => void;
  onChange: (markdown: string, reason?: "typing" | "format") => void;
  onInternalLinkClick?: (title: string) => void;
  onReady?: (editor: TiptapEditor | null) => void;
};

type FloatingPosition = {
  left: number;
  top: number;
};

type LinkPopover = FloatingPosition & {
  label: string;
  title: string;
};

type AttachmentPopover = FloatingPosition & {
  id: string;
  pos: number;
};

type SlashCommand = {
  action: () => void;
  label: string;
  subtitle: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const positionFromCoords = (
  shell: HTMLDivElement | null,
  coords: { left: number; top: number },
  offsetY = -44,
  minTop = 12,
): FloatingPosition => {
  const rect = shell?.getBoundingClientRect();
  if (!rect) return { left: 16, top: 16 };
  return {
    left: clamp(coords.left - rect.left, 12, Math.max(12, rect.width - 220)),
    top: clamp(coords.top - rect.top + offsetY, minTop, Math.max(minTop, rect.height - 92)),
  };
};

const selectedText = (editor: TiptapEditor) =>
  editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, " ");

const dispatchLinkDialog = (detail: RichTextLinkRequest) => {
  window.dispatchEvent(
    new CustomEvent<RichTextLinkRequest>("lumo-open-rich-link-dialog", {
      detail,
    }),
  );
};

export function runRichTextAction(editor: TiptapEditor | null, action: RichTextAction) {
  if (!editor) return;
  const chain = editor.chain().focus();

  if (action === "bold") chain.toggleBold().run();
  if (action === "italic") chain.toggleItalic().run();
  if (action === "heading") {
    if (editor.isActive("heading", { level: 2, accent: false })) {
      chain.setParagraph().run();
    } else {
      chain.setNode("heading", { level: 2, accent: false }).run();
    }
  }
  if (action === "bullet") chain.toggleBulletList().run();
  if (action === "numbered") chain.toggleOrderedList().run();
  if (action === "quote") chain.toggleBlockquote().run();
  if (action === "code") chain.toggleCode().run();
  if (action === "checkbox") chain.toggleTaskList().run();
  if (action === "accentHeading") {
    if (editor.isActive("heading", { level: 2, accent: true })) {
      chain.setParagraph().run();
    } else {
      chain.setNode("heading", { level: 2, accent: true }).run();
    }
  }
  if (action === "link") {
    dispatchLinkDialog({ selectedText: selectedText(editor) });
  }
}

export function insertInternalRichTextLink(
  editor: TiptapEditor | null,
  title: string,
  displayText?: string,
) {
  const targetTitle = title.trim();
  if (!editor || !targetTitle) return;

  const label = displayText?.trim() || targetTitle;
  editor
    .chain()
    .focus()
    .insertContent({
      marks: [
        {
          type: "link",
          attrs: {
            href: `internal:${encodeURIComponent(targetTitle)}`,
          },
        },
      ],
      text: label,
      type: "text",
    })
    .run();
}

export function RichTextEditor({
  attachments,
  content,
  isFocusMode = false,
  isTypewriter = false,
  noteId,
  onAttachmentClick,
  onBlur,
  onChange,
  onInternalLinkClick,
  onReady,
}: RichTextEditorProps) {
  const isApplyingContent = useRef(false);
  const latestMarkdown = useRef(content);
  const attachmentUrls = useRef<Record<string, string>>({});
  const shellRef = useRef<HTMLDivElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const isPointerSelecting = useRef(false);
  const editorInstanceRef = useRef<TiptapEditor | null>(null);
  const [findPanelPosition, setFindPanelPosition] = useState<FloatingPosition | null>(null);
  const [bubblePosition, setBubblePosition] = useState<FloatingPosition | null>(null);
  const [linkPopover, setLinkPopover] = useState<LinkPopover | null>(null);
  const [attachmentPopover, setAttachmentPopover] = useState<AttachmentPopover | null>(null);
  const [slashPosition, setSlashPosition] = useState<FloatingPosition | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const [findTotal, setFindTotal] = useState(0);
  const html = useMemo(() => markdownToEditorHtml(content, attachmentUrls.current), [content]);

  const hideFloatingUi = useCallback(() => {
    setBubblePosition(null);
    setLinkPopover(null);
    setAttachmentPopover(null);
    setSlashPosition(null);
  }, []);

  const updateBubblePosition = useCallback(
    (currentEditor: TiptapEditor) => {
      const { from, to } = currentEditor.state.selection;
      if (from === to) {
        setBubblePosition(null);
        return;
      }

      const coords = currentEditor.view.coordsAtPos(from);
      setBubblePosition(positionFromCoords(shellRef.current, coords, -64, -54));
      setSlashPosition(null);
      setLinkPopover(null);
      setAttachmentPopover(null);
    },
    [],
  );

  const updateBubblePositionFromView = useCallback((view: EditorView) => {
    const { from, to } = view.state.selection;
    if (from === to) {
      setBubblePosition(null);
      return;
    }

    const coords = view.coordsAtPos(from);
    setBubblePosition(positionFromCoords(shellRef.current, coords, -64, -54));
    setSlashPosition(null);
    setLinkPopover(null);
    setAttachmentPopover(null);
  }, []);

  const editor = useEditor({
    content: html,
    editorProps: {
      attributes: {
        class: `rich-editor-prose ${isFocusMode && isTypewriter ? "rich-editor-typewriter" : ""}`,
        spellcheck: "true",
      },
      transformPastedHTML: (html) =>
        html
          .replace(/\sstyle=(".*?"|'.*?')/gi, "")
          .replace(/\sclass=(".*?"|'.*?')/gi, ""),
      transformPastedText: (text) => text.replace(/\u00a0/g, " "),
      handleClick: (_view, pos, event) => {
        const target = event.target as HTMLElement | null;
        const image = target?.closest("img");
        if (image) {
          const attachmentSrc = image.getAttribute("data-attachment-src") ?? image.getAttribute("src") ?? "";
          const attachmentId = attachmentSrc.startsWith("attachment://")
            ? attachmentSrc.slice("attachment://".length)
            : "";
          if (attachmentId) {
            event.preventDefault();
            const coords = positionFromCoords(shellRef.current, {
              left: event.clientX,
              top: event.clientY,
            });
            setAttachmentPopover({ ...coords, id: attachmentId, pos });
            setLinkPopover(null);
            setSlashPosition(null);
            setBubblePosition(null);
            return true;
          }
        }

        const link = target?.closest("a");
        if (!link) {
          hideFloatingUi();
          return false;
        }
        const href = link.getAttribute("href") ?? "";
        if (href.startsWith("internal:")) {
          event.preventDefault();
          editor?.chain().focus().setTextSelection(pos).extendMarkRange("link").run();
          const title = decodeURIComponent(href.slice("internal:".length));
          const coords = positionFromCoords(shellRef.current, {
            left: event.clientX,
            top: event.clientY,
          }, -64, -54);
          setLinkPopover({
            ...coords,
            label: link.textContent?.trim() || title,
            title,
          });
          setAttachmentPopover(null);
          setSlashPosition(null);
          setBubblePosition(null);
          return true;
        }
        if (href.startsWith("attachment://")) {
          event.preventDefault();
          onAttachmentClick?.(href.slice("attachment://".length));
          return true;
        }
        return false;
      },
      handleKeyDown: (_view, event) => {
        const key = event.key.toLowerCase();
      if (event.ctrlKey && key === "f") {
        event.preventDefault();
          const rect = shellRef.current?.getBoundingClientRect();
          const editorColumn = shellRef.current?.closest(".column-panel")?.getBoundingClientRect();
          if (rect && editorColumn) {
            setFindPanelPosition({
              left: Math.max(12, editorColumn.right - 342),
              top: Math.max(64, editorColumn.top + 22),
            });
          }
          setFindOpen(true);
          window.setTimeout(() => findInputRef.current?.focus(), 0);
          return true;
        }
        if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "k") {
          event.preventDefault();
          runRichTextAction(editor, "link");
          return true;
        }
        if (event.key === "/") {
          window.setTimeout(() => {
            if (!editor) return;
            const coords = editor.view.coordsAtPos(editor.state.selection.from);
            setSlashPosition(positionFromCoords(shellRef.current, coords, 16));
            setBubblePosition(null);
            setLinkPopover(null);
            setAttachmentPopover(null);
          }, 0);
          return false;
        }
        if (event.key === "Escape") {
          if (slashPosition || findOpen || linkPopover || attachmentPopover || bubblePosition) {
            event.preventDefault();
            setFindOpen(false);
            hideFloatingUi();
            return true;
          }
        }
        if (event.key === " " && editor) {
          const { $from } = editor.state.selection;
          const textBefore = $from.parent.textBetween(0, $from.parentOffset);
          if (/^\[(x|X| )?\]$/.test(textBefore)) {
            event.preventDefault();
            editor
              .chain()
              .focus()
              .deleteRange({ from: $from.start(), to: $from.pos })
              .toggleTaskList()
              .run();
            return true;
          }
        }
        return false;
      },
      handleDOMEvents: {
        mousedown: () => {
          isPointerSelecting.current = true;
          setBubblePosition(null);
          return false;
        },
        mouseup: (view) => {
          isPointerSelecting.current = false;
          window.setTimeout(() => {
            updateBubblePositionFromView(view);
          }, 80);
          return false;
        },
        blur: () => {
          onBlur?.();
          return false;
        },
      },
    },
    extensions: richTextExtensions,
    immediatelyRender: false,
    onCreate: ({ editor }) => {
      onReady?.(editor);
      window.dispatchEvent(
        new CustomEvent("lumo-editor-history-state", {
          detail: {
            canRedo: editor.can().redo(),
            canUndo: editor.can().undo(),
          },
        }),
      );
    },
    onDestroy: () => onReady?.(null),
    onSelectionUpdate: ({ editor }) => {
      if (!isPointerSelecting.current) updateBubblePosition(editor);
      window.dispatchEvent(
        new CustomEvent("lumo-rich-selection-state", {
          detail: {
            bold: editor.isActive("bold"),
            bullet: editor.isActive("bulletList"),
            checkbox: editor.isActive("taskList"),
            code: editor.isActive("code"),
            accentHeading: editor.isActive("heading", { level: 2, accent: true }),
            heading: editor.isActive("heading", { level: 2 }),
            italic: editor.isActive("italic"),
            numbered: editor.isActive("orderedList"),
            quote: editor.isActive("blockquote"),
          },
        }),
      );
    },
    onTransaction: ({ editor }) => {
      window.dispatchEvent(
        new CustomEvent("lumo-editor-history-state", {
          detail: {
            canRedo: editor.can().redo(),
            canUndo: editor.can().undo(),
          },
        }),
      );
    },
    onUpdate: ({ editor }) => {
      if (isApplyingContent.current) return;
      const markdown = editorHtmlToMarkdown(editor.getHTML());
      latestMarkdown.current = markdown;
      onChange(markdown, "typing");
    },
  }, [noteId]);

  useEffect(() => {
    onReady?.(editor ?? null);
    editorInstanceRef.current = editor ?? null;
  }, [editor, onReady]);

  useEffect(() => {
    const finishPointerSelection = () => {
      if (!isPointerSelecting.current) return;
      isPointerSelecting.current = false;
      window.setTimeout(() => {
        const currentEditor = editorInstanceRef.current;
        if (currentEditor) updateBubblePosition(currentEditor);
      }, 90);
    };

    window.addEventListener("mouseup", finishPointerSelection);
    window.addEventListener("pointerup", finishPointerSelection);
    return () => {
      window.removeEventListener("mouseup", finishPointerSelection);
      window.removeEventListener("pointerup", finishPointerSelection);
    };
  }, [updateBubblePosition]);

  useEffect(() => {
    if (!editor) return;
    if (content === latestMarkdown.current) return;

    isApplyingContent.current = true;
    latestMarkdown.current = content;
    editor.commands.setContent(markdownToEditorHtml(content, attachmentUrls.current), { emitUpdate: false });
    isApplyingContent.current = false;
  }, [content, editor, noteId]);

  useEffect(() => {
    let isStale = false;
    const imageAttachments = attachments.filter((attachment) => attachment.mimeType.startsWith("image/"));
    if (imageAttachments.length === 0) return;

    Promise.all(
      imageAttachments.map(async (attachment) => {
        if (attachmentUrls.current[attachment.id]) return;
        const url = await getAttachmentDataUrl(attachment.id);
        attachmentUrls.current[attachment.id] = url;
      }),
    )
      .then(() => {
        if (isStale || !editor) return;
        isApplyingContent.current = true;
        editor.commands.setContent(markdownToEditorHtml(latestMarkdown.current, attachmentUrls.current), { emitUpdate: false });
        isApplyingContent.current = false;
      })
      .catch(() => undefined);

    return () => {
      isStale = true;
    };
  }, [attachments, editor]);

  useEffect(() => {
    if (!editor) return;

    const undo = () => editor.chain().focus().undo().run();
    const redo = () => editor.chain().focus().redo().run();

    window.addEventListener("lumo-editor-undo", undo);
    window.addEventListener("lumo-editor-redo", redo);
    return () => {
      window.removeEventListener("lumo-editor-undo", undo);
      window.removeEventListener("lumo-editor-redo", redo);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    const focusHeading = (event: Event) => {
      const title = (event as CustomEvent<{ title: string }>).detail?.title?.trim();
      if (!title) return;

      let targetPosition: number | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (targetPosition !== null) return false;
        if (node.type.name === "heading" && node.textContent.trim() === title) {
          targetPosition = pos + 1;
          return false;
        }
        return true;
      });

      if (targetPosition !== null) {
        editor.chain().focus().setTextSelection(targetPosition).run();
      }
    };

    window.addEventListener("lumo-focus-note-heading", focusHeading);
    return () => window.removeEventListener("lumo-focus-note-heading", focusHeading);
  }, [editor]);

  const insertAttachmentLabel = useCallback(() => {
    if (!attachments.length) return null;
    return attachments.map((attachment) => attachment.filename).join(", ");
  }, [attachments]);

  const runSlashCommand = useCallback(
    (action: () => void) => {
      if (!editor) return;
      const { from } = editor.state.selection;
      if (from > 0 && editor.state.doc.textBetween(from - 1, from) === "/") {
        editor.chain().focus().deleteRange({ from: from - 1, to: from }).run();
      }
      action();
      setSlashPosition(null);
    },
    [editor],
  );

  const moveCurrentBlock = useCallback(
    (direction: -1 | 1) => {
      if (!editor) return;
      const { state, view } = editor;
      const { $from } = state.selection;
      let depth = $from.depth;

      while (depth > 0 && !$from.node(depth).isBlock) {
        depth -= 1;
      }

      if (depth <= 0) return;

      const parent = $from.node(depth - 1);
      const index = $from.index(depth - 1);
      const node = $from.node(depth);
      const from = $from.before(depth);
      const to = $from.after(depth);

      if (direction === -1) {
        if (index <= 0) return;
        const previous = parent.child(index - 1);
        const insertAt = from - previous.nodeSize;
        const transaction = state.tr.delete(from, to).insert(insertAt, node.copy(node.content)).scrollIntoView();
        view.dispatch(transaction);
        editor.commands.focus();
        return;
      }

      if (index >= parent.childCount - 1) return;
      const next = parent.child(index + 1);
      const insertAt = from + next.nodeSize;
      const transaction = state.tr.delete(from, to).insert(insertAt, node.copy(node.content)).scrollIntoView();
      view.dispatch(transaction);
      editor.commands.focus();
    },
    [editor],
  );

  const slashCommands: SlashCommand[] = useMemo(
    () => [
      {
        action: () => editor?.chain().focus().setNode("heading", { level: 2, accent: false }).run(),
        label: "Heading",
        subtitle: "Start a section",
      },
      {
        action: () => editor?.chain().focus().toggleTaskList().run(),
        label: "Checklist",
        subtitle: "Track tasks inline",
      },
      {
        action: () => editor?.chain().focus().toggleBulletList().run(),
        label: "Bulleted list",
        subtitle: "Create quick points",
      },
      {
        action: () => editor?.chain().focus().toggleBlockquote().run(),
        label: "Quote",
        subtitle: "Add a callout",
      },
      {
        action: () => editor?.chain().focus().toggleCodeBlock().run(),
        label: "Code block",
        subtitle: "Insert formatted code",
      },
      {
        action: () => runRichTextAction(editor ?? null, "link"),
        label: "Internal link",
        subtitle: "Link to another note",
      },
      {
        action: () => window.dispatchEvent(new Event("lumo-editor-attach-file")),
        label: "Attach file",
        subtitle: "Add image or file",
      },
      {
        action: () => moveCurrentBlock(-1),
        label: "Move block up",
        subtitle: "Reorder the current block",
      },
      {
        action: () => moveCurrentBlock(1),
        label: "Move block down",
        subtitle: "Reorder the current block",
      },
    ],
    [editor, moveCurrentBlock],
  );

  const findMatches = useCallback(
    (query: string) => {
      if (!editor || !query.trim()) return [];
      const needle = query.trim().toLowerCase();
      const matches: Array<{ from: number; to: number }> = [];

      editor.state.doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return true;
        const text = node.text.toLowerCase();
        let index = text.indexOf(needle);
        while (index !== -1) {
          matches.push({ from: pos + index, to: pos + index + needle.length });
          index = text.indexOf(needle, index + needle.length);
        }
        return true;
      });

      return matches;
    },
    [editor],
  );

  const selectFindMatch = useCallback(
    (query: string, direction: 1 | -1 = 1) => {
      if (!editor) return;
      const matches = findMatches(query);
      setFindTotal(matches.length);
      if (!matches.length) {
        setFindIndex(0);
        return;
      }

      const nextIndex = direction === 1
        ? (findIndex + 1) % matches.length
        : (findIndex - 1 + matches.length) % matches.length;
      const match = matches[nextIndex];
      setFindIndex(nextIndex);
      editor.chain().focus().setTextSelection(match).run();
    },
    [editor, findIndex, findMatches],
  );

  const removeSelectedAttachmentReference = useCallback(() => {
    if (!editor || !attachmentPopover) return;
    editor.chain().focus().deleteRange({ from: attachmentPopover.pos, to: attachmentPopover.pos + 1 }).run();
    setAttachmentPopover(null);
  }, [attachmentPopover, editor]);

  return (
    <div
      ref={shellRef}
      className="rich-editor-shell"
      data-attachment-labels={insertAttachmentLabel() ?? undefined}
      data-empty={content.trim() ? undefined : "true"}
    >
      <EditorContent editor={editor} />
      {bubblePosition ? (
        <div
          className="rich-editor-popover rich-editor-bubble"
          style={{ left: bubblePosition.left, top: bubblePosition.top }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {[
            ["bold", "B"],
            ["italic", "I"],
            ["link", "Link"],
            ["code", "Code"],
          ].map(([action, label]) => (
            <button
              key={action}
              className="rich-editor-popover-button"
              onClick={() => runRichTextAction(editor ?? null, action as RichTextAction)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {slashPosition ? (
        <div
          className="rich-editor-popover rich-editor-command-menu"
          style={{ left: slashPosition.left, top: slashPosition.top }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {slashCommands.map((command) => (
            <button
              key={command.label}
              className="rich-editor-command-item"
              onClick={() => runSlashCommand(command.action)}
            >
              <span className="font-medium text-slate-100">{command.label}</span>
              <span className="text-[11px] text-slate-500">{command.subtitle}</span>
            </button>
          ))}
        </div>
      ) : null}
      {linkPopover ? (
        <div
          className="rich-editor-popover rich-editor-link-popover"
          style={{ left: linkPopover.left, top: linkPopover.top }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{linkPopover.label}</p>
            <p className="truncate text-[11px] text-slate-500">{linkPopover.title}</p>
          </div>
          <button
            className="rich-editor-popover-button"
            onClick={() => {
              onInternalLinkClick?.(linkPopover.title);
              setLinkPopover(null);
            }}
          >
            Open
          </button>
          <button
            className="rich-editor-popover-button"
            onClick={() => {
              dispatchLinkDialog({
                selectedText: linkPopover.label,
                title: linkPopover.title,
              });
              setLinkPopover(null);
            }}
          >
            Edit
          </button>
          <button
            className="rich-editor-popover-button rich-editor-popover-danger"
            onClick={() => {
              editor?.chain().focus().extendMarkRange("link").unsetLink().run();
              setLinkPopover(null);
            }}
          >
            Remove
          </button>
        </div>
      ) : null}
      {attachmentPopover ? (
        <div
          className="rich-editor-popover rich-editor-attachment-popover"
          style={{ left: attachmentPopover.left, top: attachmentPopover.top }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            className="rich-editor-popover-button"
            onClick={() => {
              onAttachmentClick?.(attachmentPopover.id);
              setAttachmentPopover(null);
            }}
          >
            Open
          </button>
          <button
            className="rich-editor-popover-button"
            onClick={() => editor?.chain().focus().setNodeSelection(attachmentPopover.pos).updateAttributes("image", { width: 320 }).run()}
          >
            Small
          </button>
          <button
            className="rich-editor-popover-button"
            onClick={() => editor?.chain().focus().setNodeSelection(attachmentPopover.pos).updateAttributes("image", { width: null }).run()}
          >
            Full
          </button>
          <button
            className="rich-editor-popover-button rich-editor-popover-danger"
            onClick={removeSelectedAttachmentReference}
          >
            Remove ref
          </button>
        </div>
      ) : null}
      {findOpen ? (
        <form
          className="rich-editor-find-panel"
          style={findPanelPosition ? { left: findPanelPosition.left, right: "auto", top: findPanelPosition.top } : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            selectFindMatch(findQuery, 1);
          }}
        >
          <input
            ref={findInputRef}
            value={findQuery}
            onChange={(event) => {
              setFindQuery(event.target.value);
              setFindIndex(0);
              const matches = findMatches(event.target.value);
              setFindTotal(matches.length);
              if (matches[0]) {
                editor?.chain().focus().setTextSelection(matches[0]).run();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setFindOpen(false);
                editor?.commands.focus();
              }
            }}
            placeholder="Find in note"
          />
          <span>{findQuery.trim() ? `${findTotal ? findIndex + 1 : 0}/${findTotal}` : "0/0"}</span>
          <button type="button" onClick={() => selectFindMatch(findQuery, -1)} aria-label="Previous match" title="Previous match">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3.5L5.5 8L10 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="submit" aria-label="Next match" title="Next match">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" onClick={() => setFindOpen(false)} aria-label="Close find" title="Close find">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </form>
      ) : null}
    </div>
  );
}
