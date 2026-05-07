import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Attachment } from "../types/note";
import { getAttachmentDataUrl } from "../services/database";
import { markdownToEditorHtml } from "../utils/richTextMarkdown";

type RichTextPreviewProps = {
  attachments?: Attachment[];
  content: string;
  onAttachmentClick?: (id: string) => void;
  onInternalLinkClick?: (title: string) => void;
};

const previewExtensions = [
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

export function RichTextPreview({
  attachments = [],
  content,
  onAttachmentClick,
  onInternalLinkClick,
}: RichTextPreviewProps) {
  const [attachmentUrlsVersion, setAttachmentUrlsVersion] = useState(0);
  const attachmentUrls = useRef<Record<string, string>>({});
  const html = useMemo(
    () => markdownToEditorHtml(content, attachmentUrls.current),
    [attachmentUrlsVersion, content],
  );

  const editor = useEditor(
    {
      content: html,
      editable: false,
      editorProps: {
        attributes: {
          class: "rich-editor-prose rich-editor-preview-prose",
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
      },
      extensions: previewExtensions,
      immediatelyRender: false,
    },
    [],
  );

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(html, { emitUpdate: false });
  }, [editor, html]);

  useEffect(() => {
    let isStale = false;
    const imageAttachments = attachments.filter((attachment) => attachment.mimeType.startsWith("image/"));
    if (imageAttachments.length === 0) return;

    Promise.all(
      imageAttachments.map(async (attachment) => {
        if (attachmentUrls.current[attachment.id]) return;
        attachmentUrls.current[attachment.id] = await getAttachmentDataUrl(attachment.id);
      }),
    )
      .then(() => {
        if (!isStale) setAttachmentUrlsVersion((version) => version + 1);
      })
      .catch(() => undefined);

    return () => {
      isStale = true;
    };
  }, [attachments]);

  if (!content.trim()) {
    return (
      <div className="rich-editor-shell rich-editor-preview-shell rich-editor-preview-empty">
        Start writing to see a rendered preview.
      </div>
    );
  }

  return (
    <div className="rich-editor-shell rich-editor-preview-shell">
      <EditorContent editor={editor} />
    </div>
  );
}
