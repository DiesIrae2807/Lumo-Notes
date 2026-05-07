import { Extension } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const findHighlightPluginKey = new PluginKey<DecorationSet>("lumoFindHighlights");

export type FindHighlightMeta = {
  activeIndex: number;
  ranges: Array<{ from: number; to: number }>;
};

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
      width: {
        default: null,
        parseHTML: (element) => {
          const value = element.getAttribute("data-width") ?? element.getAttribute("width");
          return value ? Number.parseInt(value, 10) : null;
        },
        renderHTML: (attributes) =>
          attributes.width
            ? {
                "data-width": attributes.width,
                style: `width: ${attributes.width}px;`,
              }
            : {},
      },
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

const FindHighlightExtension = Extension.create({
  name: "findHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: findHighlightPluginKey,
        props: {
          decorations(state) {
            return findHighlightPluginKey.getState(state);
          },
        },
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(transaction, decorations, _oldState, newState) {
            const meta = transaction.getMeta(findHighlightPluginKey) as FindHighlightMeta | null;
            if (meta) {
              return DecorationSet.create(
                newState.doc,
                meta.ranges.map((range, index) =>
                  Decoration.inline(range.from, range.to, {
                    class: index === meta.activeIndex ? "rich-editor-find-hit-active" : "rich-editor-find-hit",
                  }),
                ),
              );
            }

            return decorations.map(transaction.mapping, transaction.doc);
          },
        },
      }),
    ];
  },
});

export const richTextExtensions = [
  AccentHeadingAttribute,
  FindHighlightExtension,
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
