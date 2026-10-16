import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEditor, EditorContent, useEditorState, NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import CodeBlock from "@tiptap/extension-code-block";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Link01Icon,
  Unlink01Icon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  CheckListIcon,
  Image01Icon,
  MoreHorizontalIcon,
  ArrowDown01Icon,
  QuoteDownIcon,
  SourceCodeIcon,
  CodeIcon,
  Flowchart01Icon,
  Table01Icon,
  MinusSignIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextClearIcon,
} from "@hugeicons/core-free-icons";
import { markdownExtensions } from "@/lib/mdExtensions";
import { MermaidDiagram } from "@/components/MermaidView";
import { DIAGRAM_TEMPLATES } from "@/lib/diagramTemplates";
import { cn } from "@/lib/utils";

// Editor Markdown visual («Diseñado»): se edita el documento ya formateado y se guarda
// como Markdown. Barra flotante: color · B U enlace · tipo de texto · listas · imagen · más.

const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, "");
const joinP = (a: string, b: string) => `${a.replace(/[\\/]+$/, "")}/${b}`;
const isRemote = (src: string) => /^(https?:|data:|blob:|asset:|http:\/\/asset\.localhost)/i.test(src);

// Frontmatter YAML (---) se conserva aparte: el editor no lo toca.
function splitFrontmatter(text: string) {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  return m ? { fm: m[0], body: text.slice(m[0].length) } : { fm: "", body: text };
}

// Imagen con ruta relativa al .md: se guarda relativa, se muestra vía asset protocol.
function localImage(baseDir: string) {
  return Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        src: {
          default: null,
          renderHTML: (attrs: { src?: string }) => {
            const src = attrs.src ?? "";
            if (!src || isRemote(src)) return { src };
            const abs = /^([a-zA-Z]:[\\/]|\/)/.test(src) ? src : joinP(baseDir, decodeURI(src));
            return { src: convertFileSrc(abs) };
          },
        },
      };
    },
  }).configure({ allowBase64: true });
}

// Bloque de código; los ```mermaid muestran además el diagrama debajo.
function CodeBlockView({ node }: any) {
  const lang = node.attrs.language as string | null;
  return (
    <NodeViewWrapper className="md-codeblock">
      {lang && <div className="md-codeblock-lang" contentEditable={false}>{lang}</div>}
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
      {lang === "mermaid" && node.textContent.trim() && (
        <div className="md-codeblock-diagram" contentEditable={false}>
          <MermaidDiagram code={node.textContent} />
        </div>
      )}
    </NodeViewWrapper>
  );
}
const CodeBlockMermaid = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});

export default function MarkdownEditor({
  path,
  content,
  onChange,
}: {
  path: string;
  content: string;
  onChange: (text: string) => void;
}) {
  const baseDir = dirOf(path);
  const fmRef = useRef(splitFrontmatter(content).fm);
  const lastEmitted = useRef(content);
  const [imgErr, setImgErr] = useState<string | null>(null);

  const extensions = useMemo(
    () => markdownExtensions({ image: localImage(baseDir), codeBlock: CodeBlockMermaid }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseDir],
  );

  // Guarda una imagen pegada en <carpeta del .md>/images/ y la inserta.
  const savePasted = async (file: File, editor: Editor) => {
    const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
    const name = `pegada-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.${ext}`;
    const data = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] ?? "");
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    try {
      await invoke("fs_write_base64", { path: joinP(joinP(baseDir, "images"), name), data });
      editor.chain().focus().setImage({ src: `images/${name}`, alt: "" }).run();
    } catch (e) {
      setImgErr(String(e));
    }
  };

  const editor = useEditor(
    {
      extensions,
      content: splitFrontmatter(content).body,
      contentType: "markdown",
      immediatelyRender: true,
      editorProps: {
        attributes: { class: "md-doc", spellcheck: "true" },
        handlePaste: (_view: unknown, event: ClipboardEvent) => {
          const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
          if (!file || !editorRef.current) return false;
          event.preventDefault();
          savePasted(file, editorRef.current);
          return true;
        },
      },
      onUpdate: ({ editor }: { editor: Editor }) => {
        const md = fmRef.current + (editor as any).getMarkdown();
        lastEmitted.current = md;
        onChange(md);
      },
    } as any,
    [extensions],
  );
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  // Cambios externos (vista RAW, Claude edita el archivo…) → recargar sin marcar cambios.
  useEffect(() => {
    if (!editor || content === lastEmitted.current) return;
    lastEmitted.current = content;
    const { fm, body } = splitFrontmatter(content);
    fmRef.current = fm;
    editor.commands.setContent(body, { contentType: "markdown", emitUpdate: false } as any);
  }, [content, editor]);

  const insertImageFromDisk = async () => {
    if (!editor) return;
    const picked = await openDialog({
      multiple: true,
      filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"] }],
    });
    const files = Array.isArray(picked) ? picked : picked ? [picked] : [];
    for (const f of files) {
      try {
        const name = await invoke<string>("fs_copy_into", { from: f, destDir: joinP(baseDir, "images") });
        editor.chain().focus().setImage({ src: `images/${name}`, alt: name.replace(/\.[^.]+$/, "") }).run();
      } catch (e) {
        setImgErr(String(e));
      }
    }
  };

  if (!editor) return null;

  return (
    <div className="relative h-full overflow-y-auto bg-[#121212]">
      <div className="sticky top-0 z-10 flex justify-center px-4 pb-2 pt-3">
        <Toolbar editor={editor} onImage={insertImageFromDisk} />
      </div>
      {imgErr && (
        <div className="mx-auto mb-2 max-w-3xl rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-300" onClick={() => setImgErr(null)}>
          No se pudo insertar la imagen: {imgErr}
        </div>
      )}
      <div className="mx-auto max-w-3xl px-8 pb-24 pt-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ───────────────────────────── Barra flotante ─────────────────────────────

const COLORS = [
  { v: null, label: "Por defecto" },
  { v: "#ec4899", label: "Rosa" },
  { v: "#ef4444", label: "Rojo" },
  { v: "#f97316", label: "Naranja" },
  { v: "#eab308", label: "Amarillo" },
  { v: "#22c55e", label: "Verde" },
  { v: "#06b6d4", label: "Cian" },
  { v: "#6366f1", label: "Índigo" },
  { v: "#a855f7", label: "Violeta" },
];

const BLOCKS = [
  { key: "h1", label: "Título", cls: "text-[20px] font-medium" },
  { key: "h2", label: "Subtítulo", cls: "text-[15px]" },
  { key: "h3", label: "Encabezado", cls: "text-[13px] font-semibold" },
  { key: "p", label: "Texto normal", cls: "text-[12px]" },
] as const;

function Toolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      underline: e.isActive("underline"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      link: e.isActive("link"),
      color: (e.getAttributes("textStyle").color as string | undefined) ?? null,
      block: e.isActive("heading", { level: 1 })
        ? "h1"
        : e.isActive("heading", { level: 2 })
          ? "h2"
          : e.isActive("heading", { level: 3 })
            ? "h3"
            : "p",
      list: e.isActive("taskList") ? "task" : e.isActive("orderedList") ? "ordered" : e.isActive("bulletList") ? "bullet" : null,
    }),
  });
  const [menu, setMenu] = useState<null | "color" | "block" | "list" | "link" | "more">(null);
  const [href, setHref] = useState("");
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => !barRef.current?.contains(e.target as Node) && setMenu(null);
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [menu]);

  const run = (fn: (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => {
    fn(editor.chain().focus()).run();
    setMenu(null);
  };
  const setBlock = (k: string) =>
    run((c) => (k === "p" ? c.setParagraph() : c.toggleHeading({ level: Number(k.slice(1)) as 1 | 2 | 3 })));
  const blockLabel = BLOCKS.find((b) => b.key === s.block)?.label ?? "Texto normal";
  const listIcon =
    s.list === "ordered" ? LeftToRightListNumberIcon : s.list === "task" ? CheckListIcon : LeftToRightListBulletIcon;

  const openLink = () => {
    setHref((editor.getAttributes("link").href as string) ?? "");
    setMenu(menu === "link" ? null : "link");
  };
  const applyLink = () => {
    const url = href.trim();
    if (!url) run((c) => c.extendMarkRange("link").unsetLink());
    else run((c) => c.extendMarkRange("link").setLink({ href: /^(https?:|mailto:|#|\.|\/)/.test(url) ? url : `https://${url}` }));
  };

  return (
    <div
      ref={barRef}
      onMouseDown={(e) => {
        // No quitar el foco/selección del documento al pulsar la barra (salvo en inputs).
        if (!(e.target as HTMLElement).closest("input")) e.preventDefault();
      }}
      className="relative flex h-12 items-stretch rounded-2xl border border-zinc-700/60 bg-[#2a2a2c]/95 text-zinc-100 shadow-xl shadow-black/40 backdrop-blur"
    >
      {/* Color */}
      <Group>
        <button type="button" title="Color del texto" onClick={() => setMenu(menu === "color" ? null : "color")} className="flex items-center gap-1.5 px-2">
          <span
            className={cn("size-6 rounded-lg border", s.color ? "border-transparent" : "border-zinc-500")}
            style={{ background: s.color ?? "transparent" }}
          />
          <HugeiconsIcon icon={ArrowDown01Icon} size={12} className="text-zinc-400" />
        </button>
        {menu === "color" && (
          <Pop className="grid w-44 grid-cols-5 gap-1.5 p-2">
            {COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                title={c.label}
                onClick={() => run((ch) => (c.v ? ch.setColor(c.v) : ch.unsetColor()))}
                className={cn(
                  "size-6 rounded-md border transition-transform hover:scale-110",
                  (s.color ?? null) === c.v ? "border-white" : "border-zinc-600",
                )}
                style={{ background: c.v ?? "linear-gradient(135deg,#3f3f46 45%,#ef4444 47%,#ef4444 53%,#3f3f46 55%)" }}
              />
            ))}
          </Pop>
        )}
      </Group>

      {/* B U enlace */}
      <Group>
        <Btn title="Negrita (Ctrl+B)" active={s.bold} onClick={() => run((c) => c.toggleBold())}>
          <span className={cn("text-[19px] font-bold", s.bold && "text-indigo-400")}>B</span>
        </Btn>
        <Btn title="Subrayado (Ctrl+U)" active={s.underline} onClick={() => run((c) => c.toggleUnderline())}>
          <span className={cn("text-[19px] underline underline-offset-4", s.underline && "text-indigo-400")}>U</span>
        </Btn>
        <Btn title="Enlace" active={s.link || menu === "link"} onClick={openLink}>
          <HugeiconsIcon icon={Link01Icon} size={19} className={s.link ? "text-indigo-400" : ""} />
        </Btn>
        {menu === "link" && (
          <Pop className="flex w-72 items-center gap-1.5 p-2">
            <input
              autoFocus
              value={href}
              onChange={(e) => setHref(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyLink();
                if (e.key === "Escape") setMenu(null);
              }}
              placeholder="https://…"
              className="h-7 min-w-0 flex-1 rounded-md border border-zinc-600 bg-[#1c1c1e] px-2 text-xs outline-none focus:border-indigo-500"
            />
            <button type="button" onClick={applyLink} className="rounded-md bg-indigo-600 px-2 py-1 text-xs">
              OK
            </button>
            {s.link && (
              <button type="button" title="Quitar enlace" onClick={() => run((c) => c.extendMarkRange("link").unsetLink())} className="p-1 text-zinc-400 hover:text-red-400">
                <HugeiconsIcon icon={Unlink01Icon} size={14} />
              </button>
            )}
          </Pop>
        )}
      </Group>

      {/* Tipo de texto */}
      <Group>
        <button
          type="button"
          onClick={() => setMenu(menu === "block" ? null : "block")}
          className={cn(
            "my-1.5 flex min-w-[9rem] items-center justify-between gap-2 rounded-lg px-3 text-[14px]",
            menu === "block" ? "bg-zinc-600/50" : "hover:bg-zinc-700/50",
          )}
        >
          {blockLabel}
          <HugeiconsIcon icon={ArrowDown01Icon} size={12} className={cn("text-zinc-400 transition-transform", menu === "block" && "rotate-180")} />
        </button>
        {menu === "block" && (
          <Pop className="w-40 overflow-hidden p-0">
            {BLOCKS.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setBlock(b.key)}
                className={cn(
                  "block w-full border-b border-zinc-700/60 px-3 py-2 text-left last:border-0 hover:bg-zinc-700/60",
                  b.cls,
                  s.block === b.key && "bg-zinc-700/80",
                )}
              >
                {b.label}
              </button>
            ))}
          </Pop>
        )}
      </Group>

      {/* Listas */}
      <Group>
        <Btn title="Listas" active={!!s.list || menu === "list"} onClick={() => setMenu(menu === "list" ? null : "list")}>
          <HugeiconsIcon icon={listIcon} size={19} className={s.list ? "text-indigo-400" : ""} />
        </Btn>
        {menu === "list" && (
          <Pop className="flex p-1">
            <PopIcon title="Viñetas" icon={LeftToRightListBulletIcon} active={s.list === "bullet"} onClick={() => run((c) => c.toggleBulletList())} />
            <PopIcon title="Numerada" icon={LeftToRightListNumberIcon} active={s.list === "ordered"} onClick={() => run((c) => c.toggleOrderedList())} />
            <PopIcon title="Tareas" icon={CheckListIcon} active={s.list === "task"} onClick={() => run((c) => c.toggleTaskList())} />
          </Pop>
        )}
      </Group>

      {/* Imagen + más */}
      <Group last>
        <Btn title="Insertar imagen (también puedes pegarla con Ctrl+V)" onClick={onImage}>
          <HugeiconsIcon icon={Image01Icon} size={19} />
        </Btn>
        <Btn title="Más" active={menu === "more"} onClick={() => setMenu(menu === "more" ? null : "more")}>
          <HugeiconsIcon icon={MoreHorizontalIcon} size={19} />
        </Btn>
        {menu === "more" && (
          <Pop className="right-0 w-56 p-1" alignRight>
            <MoreItem icon={TextItalicIcon} label="Cursiva" kbd="Ctrl+I" active={s.italic} onClick={() => run((c) => c.toggleItalic())} />
            <MoreItem icon={TextStrikethroughIcon} label="Tachado" active={s.strike} onClick={() => run((c) => c.toggleStrike())} />
            <MoreItem icon={CodeIcon} label="Código en línea" onClick={() => run((c) => c.toggleCode())} />
            <div className="my-1 h-px bg-zinc-700/70" />
            <MoreItem icon={QuoteDownIcon} label="Cita" onClick={() => run((c) => c.toggleBlockquote())} />
            <MoreItem icon={SourceCodeIcon} label="Bloque de código" onClick={() => run((c) => c.toggleCodeBlock())} />
            <MoreItem icon={Table01Icon} label="Tabla" onClick={() => run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))} />
            <MoreItem icon={MinusSignIcon} label="Línea divisoria" onClick={() => run((c) => c.setHorizontalRule())} />
            <div className="my-1 h-px bg-zinc-700/70" />
            <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-wide text-zinc-500">Diagrama</div>
            {DIAGRAM_TEMPLATES.map((t) => (
              <MoreItem
                key={t.key}
                icon={Flowchart01Icon}
                label={t.label}
                onClick={() => run((c) => c.insertContent({ type: "codeBlock", attrs: { language: "mermaid" }, content: [{ type: "text", text: t.code }] }))}
              />
            ))}
            <div className="my-1 h-px bg-zinc-700/70" />
            <MoreItem icon={TextClearIcon} label="Quitar formato" onClick={() => run((c) => c.unsetAllMarks().clearNodes())} />
          </Pop>
        )}
      </Group>
    </div>
  );
}

function Group({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return <div className={cn("relative flex items-stretch px-1.5", !last && "border-r border-zinc-700/70")}>{children}</div>;
}

function Btn({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "relative my-1.5 flex w-10 items-center justify-center rounded-lg transition-colors",
        active ? "bg-zinc-600/40" : "hover:bg-zinc-700/50",
      )}
    >
      {children}
    </button>
  );
}

function Pop({ children, className, alignRight }: { children: React.ReactNode; className?: string; alignRight?: boolean }) {
  return (
    <div
      className={cn(
        "absolute top-[calc(100%+6px)] z-20 rounded-xl border border-zinc-700/70 bg-[#2a2a2c] shadow-xl shadow-black/50",
        alignRight ? "right-0" : "left-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

function PopIcon({ title, icon, active, onClick }: { title: string; icon: any; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn("flex size-9 items-center justify-center rounded-lg", active ? "bg-zinc-600/60 text-indigo-300" : "hover:bg-zinc-700/60")}
    >
      <HugeiconsIcon icon={icon} size={16} />
    </button>
  );
}

function MoreItem({
  icon,
  label,
  kbd,
  active,
  onClick,
}: {
  icon: any;
  label: string;
  kbd?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs", active ? "bg-zinc-700/70 text-indigo-300" : "hover:bg-zinc-700/60")}
    >
      <HugeiconsIcon icon={icon} size={14} className="text-zinc-400" />
      {label}
      {kbd && <span className="ml-auto text-[10px] text-zinc-500">{kbd}</span>}
    </button>
  );
}
