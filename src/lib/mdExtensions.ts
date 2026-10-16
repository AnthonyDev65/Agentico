import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "@tiptap/markdown";
import Image from "@tiptap/extension-image";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { TableKit } from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import type { AnyExtension } from "@tiptap/core";

// Extensiones del editor Markdown visual. El archivo se guarda SIEMPRE como Markdown;
// lo que Markdown no tiene (subrayado, color) se escribe como HTML estándar que
// GitHub y las vistas previas entienden.

// Subrayado → <u>texto</u> (por defecto TipTap escribe ++texto++, que no es estándar).
const UnderlineHtml = Underline.extend({
  renderMarkdown(node: any, h: any) {
    return `<u>${h.renderChildren(node)}</u>`;
  },
});

// Color de texto → <span style="color: …">texto</span> (por defecto se perdía al guardar).
const TextStyleHtml = TextStyle.extend({
  renderMarkdown(node: any, h: any) {
    const inner = h.renderChildren(node);
    const color = node.attrs?.color;
    return color ? `<span style="color: ${color}">${inner}</span>` : inner;
  },
});

export function markdownExtensions(opts: { image?: AnyExtension; codeBlock?: AnyExtension } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      underline: false,
      link: { openOnClick: false, autolink: true },
      ...(opts.codeBlock ? { codeBlock: false } : {}),
    }),
    UnderlineHtml,
    Markdown.configure({ markedOptions: { gfm: true } }),
    opts.image ?? Image,
    TextStyleHtml,
    Color,
    TableKit,
    TaskList,
    TaskItem.configure({ nested: true }),
    ...(opts.codeBlock ? [opts.codeBlock] : []),
  ];
}
