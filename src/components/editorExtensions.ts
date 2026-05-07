import { Extension } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";

const AccentHeadingAttribute = Extension.create({
  name: "accentHeadingAttribute",
  addGlobalAttributes() {
    return [
      {
        types: ["heading"],
        attributes: {
          accent: {
            default: false,
            parseHTML: (element) => element.getAttribute("data-accent-heading") === "true",
            renderHTML: (attributes) =>
              attributes.accent
                ? {
                    "data-accent-heading": "true",
                  }
                : {},
          },
        },
      },
    ];
  },
});

const AttachmentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      attachmentSrc: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-attachment-src"),
        renderHTML: (attributes) =>
          attributes.attachmentSrc
            ? {
                "data-attachment-src": attributes.attachmentSrc,
              }
            : {},
      },
    };
  },
});

export const richTextExtensions = [
  AccentHeadingAttribute,
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3],
    },
  }),
  Link.configure({
    autolink: true,
    HTMLAttributes: {
      class: "rich-editor-link",
      rel: null,
      target: null,
    },
    isAllowedUri: (url, { defaultValidate }) =>
      url.startsWith("internal:") || url.startsWith("attachment://") || defaultValidate(url),
    openOnClick: false,
    protocols: ["internal", "attachment"],
  }),
  AttachmentImage.configure({
    allowBase64: true,
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
