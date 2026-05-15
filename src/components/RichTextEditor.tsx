import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Attachment } from "../types/note";
import { editorHtmlToMarkdown, markdownToEditorHtml } from "../utils/richTextMarkdown";
import { getAttachmentDataUrl, openExternalUrl } from "../services/database";
import { findHighlightPluginKey, richTextExtensions, type FindHighlightMeta } from "./editorExtensions";
import {
  BoldIcon,
  CodeIcon,
  HighlightIcon,
  ItalicIcon,
  LinkIcon,
  UnderlineIcon,
} from "./icons/AppIcons";

export type RichTextAction =
  | "bold"
  | "italic"
  | "underline"
  | "highlight"
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
  onAttachmentReferenceDeleted?: (id: string) => Promise<void> | void;
  onAttachmentSaveAs?: (id: string) => Promise<void> | void;
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
  height: number;
  id: string;
  pos: number;
  width: number;
  x: number;
  y: number;
};

type TextContextMenu = FloatingPosition & {
  selectedText: string;
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

const attachmentIdsFromMarkdown = (markdown: string) =>
  new Set(
    Array.from(markdown.matchAll(/attachment:\/\/([^)]+)/g), (match) => {
      const id = match[1].trim();
      try {
        return decodeURIComponent(id);
      } catch {
        return id;
      }
    }).filter(Boolean),
  );

const setAttachmentImageWidthInMarkdown = (markdown: string, attachmentId: string, width: number) => {
  const escapedId = attachmentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`!\\[([^\\]]*)\\]\\(attachment://${escapedId}\\)(?:\\{width=\\d+\\})?`, "g");
  return markdown.replace(pattern, (_match, alt) => `![${alt}](attachment://${attachmentId}){width=${width}}`);
};

export function runRichTextAction(editor: TiptapEditor | null, action: RichTextAction) {
  if (!editor) return;
  const chain = editor.chain().focus();

  if (action === "bold") chain.toggleBold().run();
  if (action === "italic") chain.toggleItalic().run();
  if (action === "underline") {
    if (editor.isActive("underline")) {
      editor.chain().focus().unsetMark("underline").run();
    } else {
      editor.chain().focus().setMark("underline").run();
    }
  }
  if (action === "highlight") {
    if (editor.isActive("highlight")) {
      editor.chain().focus().unsetMark("highlight").run();
    } else {
      editor.chain().focus().setMark("highlight").run();
    }
  }
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
  onAttachmentReferenceDeleted,
  onAttachmentSaveAs,
  onBlur,
  onChange,
  onInternalLinkClick,
  onReady,
}: RichTextEditorProps) {
  const isApplyingContent = useRef(false);
  const suppressNextEditorUpdate = useRef(false);
  const latestMarkdown = useRef(content);
  const onAttachmentReferenceDeletedRef = useRef(onAttachmentReferenceDeleted);
  const attachmentUrls = useRef<Record<string, string>>({});
  const shellRef = useRef<HTMLDivElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const isPointerSelecting = useRef(false);
  const editorInstanceRef = useRef<TiptapEditor | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const [findPanelPosition, setFindPanelPosition] = useState<FloatingPosition | null>(null);
  const [bubblePosition, setBubblePosition] = useState<FloatingPosition | null>(null);
  const [linkPopover, setLinkPopover] = useState<LinkPopover | null>(null);
  const [attachmentPopover, setAttachmentPopover] = useState<AttachmentPopover | null>(null);
  const [slashPosition, setSlashPosition] = useState<FloatingPosition | null>(null);
  const [textContextMenu, setTextContextMenu] = useState<TextContextMenu | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const [findTotal, setFindTotal] = useState(0);
  const [fullscreenAttachmentId, setFullscreenAttachmentId] = useState<string | null>(null);
  const html = useMemo(() => markdownToEditorHtml(content, attachmentUrls.current), [content]);

  const selectedAttachment = attachmentPopover
    ? attachments.find((attachment) => attachment.id === attachmentPopover.id)
    : null;
  const fullscreenAttachment = fullscreenAttachmentId
    ? attachments.find((attachment) => attachment.id === fullscreenAttachmentId)
    : null;

  useEffect(() => {
    onAttachmentReferenceDeletedRef.current = onAttachmentReferenceDeleted;
  }, [onAttachmentReferenceDeleted]);

  const hideFloatingUi = useCallback(() => {
    setBubblePosition(null);
    setLinkPopover(null);
    setAttachmentPopover(null);
    setSlashPosition(null);
    setTextContextMenu(null);
    selectedImageRef.current = null;
  }, []);

  const updateBubblePosition = useCallback(
    (currentEditor: TiptapEditor) => {
      const { from, to } = currentEditor.state.selection;
      if (!(currentEditor.state.selection instanceof TextSelection) || from === to) {
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
    if (!(view.state.selection instanceof TextSelection) || from === to) {
      setBubblePosition(null);
      return;
    }

    const coords = view.coordsAtPos(from);
    setBubblePosition(positionFromCoords(shellRef.current, coords, -64, -54));
    setSlashPosition(null);
    setLinkPopover(null);
    setAttachmentPopover(null);
  }, []);

  const measureImagePopover = useCallback((image: HTMLImageElement, pos: number, attachmentId: string) => {
    const shellRect = shellRef.current?.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    if (!shellRect || imageRect.width < 8 || imageRect.height < 8) return null;

    return {
      id: attachmentId,
      height: Math.round(imageRect.height),
      left: clamp(imageRect.left - shellRect.left, 12, Math.max(12, shellRect.width - 260)),
      pos,
      top: clamp(imageRect.top - shellRect.top - 48, 12, Math.max(12, shellRect.height - 92)),
      width: Math.round(imageRect.width),
      x: imageRect.left - shellRect.left,
      y: imageRect.top - shellRect.top,
    };
  }, []);

  const imageElementAtPos = useCallback((currentEditor: TiptapEditor, pos: number) => {
    const dom = currentEditor.view.nodeDOM(pos);
    if (dom instanceof HTMLImageElement) return dom;
    if (dom instanceof HTMLElement) return dom.querySelector("img");
    return null;
  }, []);

  const clearStaleAttachmentPopover = useCallback((currentEditor: TiptapEditor) => {
    setAttachmentPopover((current) => {
      if (!current) return current;
      const node = currentEditor.state.doc.nodeAt(current.pos);
      if (node?.type.name === "image" && imageElementAtPos(currentEditor, current.pos)) {
        return current;
      }
      selectedImageRef.current = null;
      return null;
    });
  }, [imageElementAtPos]);

  const openImagePopover = useCallback((image: HTMLImageElement, pos: number) => {
    const attachmentSrc = image.getAttribute("data-attachment-src") ?? image.getAttribute("src") ?? "";
    const attachmentId = attachmentSrc.startsWith("attachment://")
      ? attachmentSrc.slice("attachment://".length)
      : "";
    if (!attachmentId) return false;

    selectedImageRef.current = image;
    const applyMeasurement = () => {
      const next = measureImagePopover(image, pos, attachmentId);
      if (next) setAttachmentPopover(next);
    };

    const measured = measureImagePopover(image, pos, attachmentId);
    if (measured) {
      setAttachmentPopover(measured);
    } else {
      window.requestAnimationFrame(applyMeasurement);
      if (!image.complete) {
        image.addEventListener("load", applyMeasurement, { once: true });
      }
    }
    setLinkPopover(null);
    setSlashPosition(null);
    setBubblePosition(null);
    return true;
  }, [measureImagePopover]);

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
          const imagePos = editor?.view.posAtDOM(image, 0) ?? pos;
          if (openImagePopover(image as HTMLImageElement, imagePos)) {
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
        contextmenu: (view, event) => {
          const target = event.target as HTMLElement | null;
          const image = target?.closest("img");
          if (image) {
            const pos = view.posAtDOM(image, 0);
            if (openImagePopover(image as HTMLImageElement, pos)) {
              event.preventDefault();
              return true;
            }
            return false;
          }

          const { from, to } = view.state.selection;
          const clickedPos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          const text =
            view.state.selection instanceof TextSelection && from !== to
              ? view.state.doc.textBetween(from, to, " ").trim()
              : "";
          const clickedInsideSelection =
            Boolean(clickedPos) &&
            view.state.selection instanceof TextSelection &&
            from !== to &&
            clickedPos! >= from &&
            clickedPos! <= to;

          if (clickedPos && !clickedInsideSelection) {
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, clickedPos)));
          }

          event.preventDefault();
          setBubblePosition(null);
          setLinkPopover(null);
          setAttachmentPopover(null);
          setSlashPosition(null);
          setTextContextMenu({
            ...positionFromCoords(shellRef.current, { left: event.clientX, top: event.clientY }, 8, 12),
            selectedText: clickedInsideSelection ? text : "",
          });
          return true;
        },
        mousedown: (view, event) => {
          const target = event.target as HTMLElement | null;
          const image = target?.closest("img") as HTMLImageElement | null;
          if (image) {
            isPointerSelecting.current = false;
            setBubblePosition(null);
            const pos = view.posAtDOM(image, 0);
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
            window.requestAnimationFrame(() => openImagePopover(image, pos));
            event.preventDefault();
            return true;
          }
          if (target?.closest(".rich-editor-popover") || target?.closest(".rich-editor-image-resize-handle")) {
            isPointerSelecting.current = false;
            setBubblePosition(null);
            return false;
          }
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
      if (editor.state.selection instanceof NodeSelection && editor.state.selection.node.type.name === "image") {
        setBubblePosition(null);
      } else if (!isPointerSelecting.current) {
        updateBubblePosition(editor);
      }
      window.dispatchEvent(
        new CustomEvent("lumo-rich-selection-state", {
          detail: {
            bold: editor.isActive("bold"),
            highlight: editor.isActive("highlight"),
            bullet: editor.isActive("bulletList"),
            checkbox: editor.isActive("taskList"),
            code: editor.isActive("code"),
            accentHeading: editor.isActive("heading", { level: 2, accent: true }),
            heading: editor.isActive("heading", { level: 2 }),
            italic: editor.isActive("italic"),
            underline: editor.isActive("underline"),
            numbered: editor.isActive("orderedList"),
            quote: editor.isActive("blockquote"),
          },
        }),
      );
    },
    onTransaction: ({ editor }) => {
      clearStaleAttachmentPopover(editor);
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
      if (suppressNextEditorUpdate.current) {
        suppressNextEditorUpdate.current = false;
        return;
      }
      const markdown = editorHtmlToMarkdown(editor.getHTML(), attachmentUrls.current);
      const previousAttachmentIds = attachmentIdsFromMarkdown(latestMarkdown.current);
      const nextAttachmentIds = attachmentIdsFromMarkdown(markdown);
      previousAttachmentIds.forEach((id) => {
        if (!nextAttachmentIds.has(id)) {
          delete attachmentUrls.current[id];
        }
      });
      latestMarkdown.current = markdown;
      onChange(markdown, "typing");
    },
  }, [noteId]);

  useEffect(() => {
    onReady?.(editor ?? null);
    editorInstanceRef.current = editor ?? null;
  }, [editor, onReady]);

  useEffect(() => {
    hideFloatingUi();
    setFullscreenAttachmentId(null);
  }, [hideFloatingUi, noteId]);

  const applyEditorContent = useCallback((nextContent: string) => {
    if (!editor || editor.isDestroyed) return;
    try {
      isApplyingContent.current = true;
      editor.commands.setContent(markdownToEditorHtml(nextContent, attachmentUrls.current), { emitUpdate: false });
    } catch (error) {
      console.error("Could not apply rich editor content", error);
    } finally {
      isApplyingContent.current = false;
    }
  }, [editor]);

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

    latestMarkdown.current = content;
    applyEditorContent(content);
  }, [applyEditorContent, content, editor, noteId]);

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
        if (isStale || !editor || editor.isDestroyed) return;
        applyEditorContent(latestMarkdown.current);
      })
      .catch(() => undefined);

    return () => {
      isStale = true;
    };
  }, [applyEditorContent, attachments, editor]);

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
    if (!textContextMenu) return;

    const close = () => setTextContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [textContextMenu]);

  const copySelectedText = useCallback(async () => {
    if (!editor) return;
    const text = selectedText(editor);
    if (!text.trim()) return;
    await navigator.clipboard?.writeText(text).catch(() => {
      document.execCommand("copy");
    });
    setTextContextMenu(null);
    editor.commands.focus();
  }, [editor]);

  const cutSelectedText = useCallback(async () => {
    if (!editor) return;
    const text = selectedText(editor);
    if (!text.trim()) return;
    await navigator.clipboard?.writeText(text).catch(() => {
      document.execCommand("copy");
    });
    editor.chain().focus().deleteSelection().run();
    setTextContextMenu(null);
  }, [editor]);

  const pasteIntoEditor = useCallback(async () => {
    if (!editor) return;
    const text = await navigator.clipboard?.readText().catch(() => "");
    if (text) {
      editor.chain().focus().insertContent(text).run();
    } else {
      editor.commands.focus();
      document.execCommand("paste");
    }
    setTextContextMenu(null);
  }, [editor]);

  const undoEditorChange = useCallback(() => {
    editor?.chain().focus().undo().run();
    setTextContextMenu(null);
  }, [editor]);

  const redoEditorChange = useCallback(() => {
    editor?.chain().focus().redo().run();
    setTextContextMenu(null);
  }, [editor]);

  const searchSelectedTextOnInternet = useCallback(async () => {
    const query = (textContextMenu?.selectedText || "").trim();
    if (!query) return;
    await openExternalUrl(`https://www.google.com/search?q=${encodeURIComponent(query)}`).catch(() => {
      window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    });
    setTextContextMenu(null);
    editor?.commands.focus();
  }, [editor, textContextMenu]);

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

  const applyFindHighlights = useCallback(
    (ranges: Array<{ from: number; to: number }>, activeIndex: number) => {
      if (!editor) return;
      const meta: FindHighlightMeta = { activeIndex, ranges };
      editor.view.dispatch(editor.state.tr.setMeta(findHighlightPluginKey, meta));
    },
    [editor],
  );

  const scrollFindMatchIntoView = useCallback(
    (match: { from: number; to: number }) => {
      if (!editor) return;
      const coords = editor.view.coordsAtPos(match.from);
      const scrollContainer = shellRef.current?.closest(".scroll-area");
      const containerRect = scrollContainer?.getBoundingClientRect();
      if (!scrollContainer || !containerRect) return;

      if (coords.top < containerRect.top + 80 || coords.bottom > containerRect.bottom - 80) {
        scrollContainer.scrollBy({
          behavior: "smooth",
          top: coords.top - containerRect.top - 140,
        });
      }
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
        applyFindHighlights([], -1);
        return;
      }

      const nextIndex = direction === 1
        ? (findIndex + 1) % matches.length
        : (findIndex - 1 + matches.length) % matches.length;
      const match = matches[nextIndex];
      setFindIndex(nextIndex);
      applyFindHighlights(matches, nextIndex);
      scrollFindMatchIntoView(match);
      window.setTimeout(() => findInputRef.current?.focus(), 0);
    },
    [applyFindHighlights, editor, findIndex, findMatches, scrollFindMatchIntoView],
  );

  const removeSelectedAttachmentReference = useCallback(() => {
    if (!editor || !attachmentPopover) return;
    const attachmentId = attachmentPopover.id;
    editor.chain().focus().deleteRange({ from: attachmentPopover.pos, to: attachmentPopover.pos + 1 }).run();
    delete attachmentUrls.current[attachmentId];
    void onAttachmentReferenceDeletedRef.current?.(attachmentId);
    setAttachmentPopover(null);
  }, [attachmentPopover, editor]);

  const copySelectedAttachmentReference = useCallback(async (cut = false) => {
    if (!attachmentPopover || !selectedAttachment) return;
    const markdown = selectedAttachment.mimeType.startsWith("image/")
      ? `![${selectedAttachment.filename}](attachment://${selectedAttachment.id})`
      : `[${selectedAttachment.filename}](attachment://${selectedAttachment.id})`;
    await navigator.clipboard?.writeText(markdown).catch(() => undefined);
    if (cut) removeSelectedAttachmentReference();
  }, [attachmentPopover, removeSelectedAttachmentReference, selectedAttachment]);

  const startImageResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!editor || !attachmentPopover) return;
    event.preventDefault();
    event.stopPropagation();
    setBubblePosition(null);

    const startX = event.clientX;
    const startWidth = attachmentPopover.width;
    const maxWidth = Math.max(180, (shellRef.current?.clientWidth ?? 900) - 48);
    const selection = editor.state.selection;
    const imagePos = selection instanceof NodeSelection && selection.node.type.name === "image"
      ? selection.from
      : attachmentPopover.pos;
    const image = imageElementAtPos(editor, imagePos) ?? selectedImageRef.current;
    if (image) selectedImageRef.current = image;
    const attachmentId = attachmentPopover.id;
    const attachmentSource = `attachment://${attachmentId}`;
    let finalWidth = startWidth;

    const onMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.round(clamp(startWidth + moveEvent.clientX - startX, 140, maxWidth));
      finalWidth = nextWidth;
      if (image) {
        image.style.width = `${nextWidth}px`;
        image.setAttribute("data-width", String(nextWidth));
        image.setAttribute("data-attachment-id", attachmentId);
        image.setAttribute("data-attachment-src", attachmentSource);
        const shellRect = shellRef.current?.getBoundingClientRect();
        const imageRect = image.getBoundingClientRect();
        if (shellRect) {
          setAttachmentPopover((current) =>
            current
              ? {
                  ...current,
                  height: Math.round(imageRect.height),
                  left: clamp(imageRect.left - shellRect.left, 12, Math.max(12, shellRect.width - 260)),
                  top: clamp(imageRect.top - shellRect.top - 48, 12, Math.max(12, shellRect.height - 92)),
                  width: Math.round(imageRect.width),
                  x: imageRect.left - shellRect.left,
                  y: imageRect.top - shellRect.top,
                }
              : current,
          );
        }
        return;
      }
      setAttachmentPopover((current) => current ? { ...current, width: nextWidth } : current);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const resizedMarkdown = setAttachmentImageWidthInMarkdown(latestMarkdown.current, attachmentId, finalWidth);
      if (resizedMarkdown !== latestMarkdown.current) {
        latestMarkdown.current = resizedMarkdown;
        onChange(resizedMarkdown, "typing");
        suppressNextEditorUpdate.current = true;
      }
      editor
        .chain()
        .focus()
        .setNodeSelection(imagePos)
        .updateAttributes("image", {
          attachmentId,
          attachmentSrc: attachmentSource,
          src: attachmentUrls.current[attachmentId] ?? attachmentSource,
          width: finalWidth,
        })
        .run();
      window.requestAnimationFrame(() => {
        const nextImage = imageElementAtPos(editor, imagePos);
        if (!nextImage) return;
        selectedImageRef.current = nextImage;
        const next = measureImagePopover(nextImage, imagePos, attachmentPopover.id);
        if (next) setAttachmentPopover(next);
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [attachmentPopover, editor, imageElementAtPos, measureImagePopover]);

  return (
    <div
      ref={shellRef}
      className={`rich-editor-shell ${isFocusMode ? "rich-editor-shell-focus" : "rich-editor-shell-open"}`}
      data-attachment-labels={insertAttachmentLabel() ?? undefined}
      data-empty={content.trim() ? undefined : "true"}
      onContextMenu={(event) => event.preventDefault()}
    >
      <EditorContent editor={editor} />
      {bubblePosition ? (
        <div
          className="rich-editor-popover rich-editor-bubble"
          style={{ left: bubblePosition.left, top: bubblePosition.top }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {[
            ["bold", "Bold", BoldIcon],
            ["italic", "Italic", ItalicIcon],
            ["underline", "Underline", UnderlineIcon],
            ["highlight", "Highlight", HighlightIcon],
            ["link", "Link", LinkIcon],
            ["code", "Code", CodeIcon],
          ].map(([action, label, Icon]) => (
            <button
              key={action as string}
              className="rich-editor-popover-button rich-editor-popover-icon-button"
              onClick={() => runRichTextAction(editor ?? null, action as RichTextAction)}
              aria-label={label as string}
              title={label as string}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
      ) : null}
      {textContextMenu ? (
        <div
          className="rich-editor-popover rich-editor-text-context-menu"
          style={{ left: textContextMenu.left, top: textContextMenu.top }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            className="rich-editor-context-item"
            disabled={!textContextMenu.selectedText.trim()}
            onClick={() => void copySelectedText()}
          >
            Copy
          </button>
          <button
            className="rich-editor-context-item"
            disabled={!textContextMenu.selectedText.trim()}
            onClick={() => void cutSelectedText()}
          >
            Cut
          </button>
          <button className="rich-editor-context-item" onClick={() => void pasteIntoEditor()}>
            Paste
          </button>
          <span className="rich-editor-context-separator" />
          <button
            className="rich-editor-context-item"
            disabled={!editor?.can().undo()}
            onClick={undoEditorChange}
          >
            Undo
          </button>
          <button
            className="rich-editor-context-item"
            disabled={!editor?.can().redo()}
            onClick={redoEditorChange}
          >
            Redo
          </button>
          <span className="rich-editor-context-separator" />
          <button
            className="rich-editor-context-item"
            disabled={!textContextMenu.selectedText.trim()}
            onClick={() => void searchSelectedTextOnInternet()}
          >
            Search on the internet
          </button>
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
      {attachmentPopover && attachmentPopover.width >= 8 && attachmentPopover.height >= 8 ? (
        <>
          <div
            className="rich-editor-image-resize-frame"
            style={{
              height: attachmentPopover.height,
              left: attachmentPopover.x,
              top: attachmentPopover.y,
              width: attachmentPopover.width,
            }}
          >
            <button
              className="rich-editor-image-resize-handle"
              onPointerDown={startImageResize}
              aria-label="Resize image"
              title="Drag to resize"
            />
          </div>
          <div
            className="rich-editor-popover rich-editor-attachment-popover"
            style={{ left: attachmentPopover.left, top: attachmentPopover.top }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <button
              className="rich-editor-popover-button"
              onClick={() => setFullscreenAttachmentId(attachmentPopover.id)}
            >
              Open
            </button>
            <button
              className="rich-editor-popover-button"
              onClick={() => void onAttachmentSaveAs?.(attachmentPopover.id)}
            >
              Save as
            </button>
            <button
              className="rich-editor-popover-button"
              onClick={() => void copySelectedAttachmentReference(false)}
            >
              Copy
            </button>
            <button
              className="rich-editor-popover-button"
              onClick={() => void copySelectedAttachmentReference(true)}
            >
              Cut
            </button>
            <button
              className="rich-editor-popover-button rich-editor-popover-danger"
              onClick={removeSelectedAttachmentReference}
            >
              Remove
            </button>
          </div>
        </>
      ) : null}
      {fullscreenAttachment && attachmentUrls.current[fullscreenAttachment.id] ? (
        <div
          className="rich-editor-image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={fullscreenAttachment.filename}
          onClick={() => setFullscreenAttachmentId(null)}
        >
          <div className="rich-editor-image-lightbox-bar" onClick={(event) => event.stopPropagation()}>
            <span>{fullscreenAttachment.filename}</span>
            <button
              className="rich-editor-popover-button"
              onClick={() => void onAttachmentSaveAs?.(fullscreenAttachment.id)}
            >
              Save as
            </button>
            <button
              className="rich-editor-popover-button"
              onClick={() => setFullscreenAttachmentId(null)}
              aria-label="Close image preview"
            >
              Close
            </button>
          </div>
          <img src={attachmentUrls.current[fullscreenAttachment.id]} alt={fullscreenAttachment.filename} />
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
              applyFindHighlights(matches, matches.length ? 0 : -1);
              if (matches[0]) scrollFindMatchIntoView(matches[0]);
              window.setTimeout(() => findInputRef.current?.focus(), 0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                applyFindHighlights([], -1);
                setFindOpen(false);
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
          <button
            type="button"
            onClick={() => {
              applyFindHighlights([], -1);
              setFindOpen(false);
            }}
            aria-label="Close find"
            title="Close find"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </form>
      ) : null}
    </div>
  );
}
