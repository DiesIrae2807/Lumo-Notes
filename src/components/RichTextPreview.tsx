import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Attachment } from "../types/note";
import { getAttachmentDataUrl } from "../services/database";
import { markdownToEditorHtml } from "../utils/richTextMarkdown";
import { richTextExtensions } from "./editorExtensions";

type RichTextPreviewProps = {
  attachments?: Attachment[];
  content: string;
  onAttachmentClick?: (id: string) => void;
  onInternalLinkClick?: (title: string) => void;
};

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
      extensions: richTextExtensions,
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
