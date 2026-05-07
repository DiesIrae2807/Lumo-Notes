import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
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
    const selectedText = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      " ",
    );
    window.dispatchEvent(
      new CustomEvent<RichTextLinkRequest>("lumo-open-rich-link-dialog", {
        detail: { selectedText },
      }),
    );
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
          runRichTextAction(editor, "link");
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

    window.addEventListener("lumo-editor-undo", undo);
    window.addEventListener("lumo-editor-redo", redo);
    return () => {
      window.removeEventListener("lumo-editor-undo", undo);
      window.removeEventListener("lumo-editor-redo", redo);
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
