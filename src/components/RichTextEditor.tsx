import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Attachment } from "../types/note";
import { editorHtmlToMarkdown, markdownToEditorHtml } from "../utils/richTextMarkdown";
import { getAttachmentDataUrl } from "../services/database";

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

const extensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3],
    },
  }),
  Link.configure({
    autolink: true,
    HTMLAttributes: {
      class: "rich-editor-link",
    },
    openOnClick: false,
  }),
  Image.configure({
    HTMLAttributes: {
      class: "rich-editor-image",
    },
  }),
  TaskList.configure({
    HTMLAttributes: {
      class: "rich-editor-task-list",
    },
  }),
  TaskItem.configure({
    nested: true,
  }),
];

export function runRichTextAction(editor: TiptapEditor | null, action: RichTextAction) {
  if (!editor) return;
  const chain = editor.chain().focus();

  if (action === "bold") chain.toggleBold().run();
  if (action === "italic") chain.toggleItalic().run();
  if (action === "heading") chain.toggleHeading({ level: 2 }).run();
  if (action === "bullet") chain.toggleBulletList().run();
  if (action === "numbered") chain.toggleOrderedList().run();
  if (action === "quote") chain.toggleBlockquote().run();
  if (action === "code") chain.toggleCode().run();
  if (action === "checkbox") chain.toggleTaskList().run();
  if (action === "accentHeading") chain.toggleHeading({ level: 2 }).run();
  if (action === "link") {
    const selectedText = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      " ",
    );
    const title = window.prompt("Linked note title", selectedText || "");
    if (!title?.trim()) return;
    const alias = selectedText && selectedText !== title ? selectedText : title;
    chain
      .insertContent(`<a href="internal:${encodeURIComponent(title.trim())}">${alias}</a>`)
      .run();
  }
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
  const html = useMemo(() => markdownToEditorHtml(content, attachmentUrls.current), [content]);

  const editor = useEditor({
    content: html,
    editorProps: {
      attributes: {
        class: `rich-editor-prose ${isFocusMode && isTypewriter ? "rich-editor-typewriter" : ""}`,
        spellcheck: "true",
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement | null;
        const link = target?.closest("a");
        if (!link) return false;
        const href = link.getAttribute("href") ?? "";
        if (href.startsWith("internal:")) {
          event.preventDefault();
          onInternalLinkClick?.(decodeURIComponent(href.slice("internal:".length)));
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
        if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "k") {
          event.preventDefault();
          window.dispatchEvent(new Event("lumo-rich-internal-link"));
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        blur: () => {
          onBlur?.();
          return false;
        },
      },
    },
    extensions,
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
      window.dispatchEvent(
        new CustomEvent("lumo-rich-selection-state", {
          detail: {
            bold: editor.isActive("bold"),
            bullet: editor.isActive("bulletList"),
            checkbox: editor.isActive("taskList"),
            code: editor.isActive("code"),
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
  }, [editor, onReady]);

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
    const link = () => runRichTextAction(editor, "link");

    window.addEventListener("lumo-editor-undo", undo);
    window.addEventListener("lumo-editor-redo", redo);
    window.addEventListener("lumo-rich-internal-link", link);
    return () => {
      window.removeEventListener("lumo-editor-undo", undo);
      window.removeEventListener("lumo-editor-redo", redo);
      window.removeEventListener("lumo-rich-internal-link", link);
    };
  }, [editor]);

  const insertAttachmentLabel = useCallback(() => {
    if (!attachments.length) return null;
    return attachments.map((attachment) => attachment.filename).join(", ");
  }, [attachments]);

  return (
    <div className="rich-editor-shell" data-attachment-labels={insertAttachmentLabel() ?? undefined}>
      <EditorContent editor={editor} />
    </div>
  );
}
