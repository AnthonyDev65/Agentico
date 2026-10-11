import { useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import type { Extension } from "@codemirror/state";
import {
  javascript,
  javascriptLanguage,
  typescriptLanguage,
  jsxLanguage,
  tsxLanguage,
} from "@codemirror/lang-javascript";
import { json, jsonLanguage } from "@codemirror/lang-json";
import { html, htmlLanguage } from "@codemirror/lang-html";
import { css, cssLanguage } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { python, pythonLanguage } from "@codemirror/lang-python";
import { rust, rustLanguage } from "@codemirror/lang-rust";
import { StreamLanguage } from "@codemirror/language";
import { csharp } from "@codemirror/legacy-modes/mode/clike";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, SourceCodeIcon, EyeIcon } from "@hugeicons/core-free-icons";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import FileTree from "@/components/FileTree";
import ComponentPreview from "@/components/ComponentPreview";
import EnvEditor from "@/components/EnvEditor";
import MediaView from "@/components/MediaView";
import CsvEditor from "@/components/CsvEditor";
import MermaidView from "@/components/MermaidView";
import type { Project } from "@/components/Workspace";
import {
  fileIcon,
  isImageFile,
  isComponentFile,
  isEnvFile,
  isMarkdownFile,
  isCsvFile,
  isMermaidFile,
  mediaKindOf,
  type MediaKind,
} from "@/lib/fileIcons";
import { cn } from "@/lib/utils";

type OpenFile = {
  path: string;
  name: string;
  kind: "text" | "image" | "media";
  mediaKind?: MediaKind;
  content: string;
  dataUrl?: string;
  dirty: boolean;
  error?: string;
  preview?: boolean;
};

// ── IntelliSense ligero: autocompletado de palabras del documento + snippets ──

type Snip = { label: string; type: string; apply?: string; detail?: string };

// Fuente de autocompletado: snippets del lenguaje + identificadores del archivo.
function sourceFor(snippets: Snip[]) {
  return (context: any) => {
    const word = context.matchBefore(/[\w$]+/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const text: string = context.state.doc.toString();
    const set = new Set<string>();
    for (const m of text.matchAll(/[A-Za-z_$][\w$]*/g)) {
      if (m[0].length > 2) set.add(m[0]);
    }
    set.delete(word.text);
    const docWords = [...set]
      .sort()
      .slice(0, 400)
      .map((label) => ({ label, type: "variable" }));
    return {
      from: word.from,
      options: [...snippets, ...docWords],
      validFor: /^[\w$]*$/,
    };
  };
}

const JS_SNIPPETS: Snip[] = [
  { label: "console.log", type: "function", apply: "console.log()", detail: "log" },
  { label: "console.error", type: "function", apply: "console.error()" },
  { label: "function", type: "keyword", apply: "function name() {\n  \n}" },
  { label: "arrow", type: "keyword", apply: "const fn = () => {\n  \n}" },
  { label: "import", type: "keyword", apply: "import {  } from '';" },
  { label: "export", type: "keyword" },
  { label: "const", type: "keyword" },
  { label: "let", type: "keyword" },
  { label: "return", type: "keyword" },
  { label: "async", type: "keyword" },
  { label: "await", type: "keyword" },
  { label: "useState", type: "function", apply: "const [state, setState] = useState();" },
  { label: "useEffect", type: "function", apply: "useEffect(() => {\n  \n}, []);" },
  { label: "try", type: "keyword", apply: "try {\n  \n} catch (e) {\n  \n}" },
];
const CSS_SNIPPETS: Snip[] = [
  { label: "display", type: "property" },
  { label: "flex", type: "value" },
  { label: "grid", type: "value" },
  { label: "margin", type: "property" },
  { label: "padding", type: "property" },
  { label: "background", type: "property" },
  { label: "color", type: "property" },
];
const HTML_SNIPPETS: Snip[] = [
  { label: "div", type: "type", apply: "<div></div>" },
  { label: "a", type: "type", apply: '<a href=""></a>' },
  { label: "img", type: "type", apply: '<img src="" alt="" />' },
  { label: "script", type: "type", apply: "<script></script>" },
];
const PY_SNIPPETS: Snip[] = [
  { label: "def", type: "keyword", apply: "def name():\n    " },
  { label: "class", type: "keyword", apply: "class Name:\n    " },
  { label: "print", type: "function", apply: "print()" },
  { label: "import", type: "keyword" },
  { label: "for", type: "keyword", apply: "for i in range():\n    " },
];
const RS_SNIPPETS: Snip[] = [
  { label: "fn", type: "keyword", apply: "fn name() {\n    \n}" },
  { label: "let", type: "keyword" },
  { label: "println!", type: "function", apply: 'println!("");' },
  { label: "match", type: "keyword", apply: "match  {\n    \n}" },
];
const CS_SNIPPETS: Snip[] = [
  { label: "Console.WriteLine", type: "function", apply: 'Console.WriteLine();' },
  { label: "public", type: "keyword" },
  { label: "private", type: "keyword" },
  { label: "class", type: "keyword", apply: "class Name\n{\n    \n}" },
  { label: "void", type: "keyword" },
  { label: "using", type: "keyword", apply: "using ;" },
  { label: "namespace", type: "keyword", apply: "namespace Name;" },
  { label: "foreach", type: "keyword", apply: "foreach (var item in collection)\n{\n    \n}" },
  { label: "if", type: "keyword", apply: "if ()\n{\n    \n}" },
  { label: "var", type: "keyword" },
  { label: "async", type: "keyword" },
  { label: "await", type: "keyword" },
];

function withWords(support: Extension, lang: any, snippets: Snip[]): Extension[] {
  return [support, lang.data.of({ autocomplete: sourceFor(snippets) })];
}

function langFor(name: string): Extension[] {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return withWords(javascript({ jsx: true }), jsxLanguage, JS_SNIPPETS);
    case "ts":
      return withWords(javascript({ typescript: true }), typescriptLanguage, JS_SNIPPETS);
    case "tsx":
      return withWords(javascript({ jsx: true, typescript: true }), tsxLanguage, JS_SNIPPETS);
    case "mts":
    case "cts":
      return withWords(javascript({ typescript: true }), javascriptLanguage, JS_SNIPPETS);
    case "json":
      return withWords(json(), jsonLanguage, []);
    case "html":
    case "htm":
      return withWords(html(), htmlLanguage, HTML_SNIPPETS);
    case "css":
    case "scss":
    case "less":
      return withWords(css(), cssLanguage, CSS_SNIPPETS);
    case "md":
    case "markdown":
      return [markdown()];
    case "py":
      return withWords(python(), pythonLanguage, PY_SNIPPETS);
    case "rs":
      return withWords(rust(), rustLanguage, RS_SNIPPETS);
    case "cs": {
      const l = StreamLanguage.define(csharp);
      return withWords(l, l, CS_SNIPPETS);
    }
    case "xaml":
    case "csproj":
    case "props":
    case "targets":
    case "xml":
    case "config":
      return withWords(html(), htmlLanguage, HTML_SNIPPETS);
    default:
      return [];
  }
}

const EDITOR_SETUP = {
  foldGutter: true,
  highlightSelectionMatches: true,
  autocompletion: true,
  closeBrackets: true,
  bracketMatching: true,
  tabSize: 2,
};

export default function CodePanel({ project }: { project: Project }) {
  const [open, setOpen] = useState<OpenFile[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<string | null>(null);
  const activeFile = open.find((f) => f.path === active) ?? null;

  const openFile = async (path: string, name: string) => {
    setActive(path);
    if (open.some((f) => f.path === path)) return;

    if (isImageFile(name)) {
      try {
        const img = await invoke<{ media_type: string; data: string }>("read_image", { path });
        setOpen((prev) =>
          prev.some((f) => f.path === path)
            ? prev
            : [
                ...prev,
                {
                  path,
                  name,
                  kind: "image",
                  content: "",
                  dirty: false,
                  dataUrl: `data:${img.media_type};base64,${img.data}`,
                },
              ],
        );
      } catch (err) {
        setOpen((prev) =>
          prev.some((f) => f.path === path)
            ? prev
            : [...prev, { path, name, kind: "image", content: "", dirty: false, error: String(err) }],
        );
      }
      return;
    }

    const mk = mediaKindOf(name);
    if (mk) {
      setOpen((prev) =>
        prev.some((f) => f.path === path)
          ? prev
          : [...prev, { path, name, kind: "media", mediaKind: mk, content: "", dirty: false }],
      );
      return;
    }

    try {
      const content = await invoke<string>("fs_read", { path });
      setOpen((prev) =>
        prev.some((f) => f.path === path)
          ? prev
          : [...prev, { path, name, kind: "text", content, dirty: false }],
      );
    } catch (err) {
      setOpen((prev) =>
        prev.some((f) => f.path === path)
          ? prev
          : [...prev, { path, name, kind: "text", content: "", dirty: false, error: String(err) }],
      );
    }
  };

  const onChange = (val: string) => {
    if (!active) return;
    setOpen((prev) => prev.map((f) => (f.path === active ? { ...f, content: val, dirty: true } : f)));
  };

  const save = async (path: string) => {
    const f = open.find((x) => x.path === path);
    if (!f || f.error || f.kind !== "text") return;
    try {
      await invoke("fs_write", { path, content: f.content });
      setOpen((prev) => prev.map((x) => (x.path === path ? { ...x, dirty: false } : x)));
    } catch {
      /* TODO: error de guardado */
    }
  };

  const actuallyClose = (path: string) => {
    const idx = open.findIndex((f) => f.path === path);
    const rest = open.filter((f) => f.path !== path);
    setOpen(rest);
    if (active === path) {
      const n = rest[idx] ?? rest[idx - 1] ?? rest[0] ?? null;
      setActive(n ? n.path : null);
    }
  };

  // Cierra una pestaña; si tiene cambios sin guardar, pide confirmación.
  const requestClose = (path: string) => {
    const f = open.find((x) => x.path === path);
    if (f?.dirty) setPendingClose(path);
    else actuallyClose(path);
  };

  const confirmSaveClose = async () => {
    if (!pendingClose) return;
    await save(pendingClose);
    actuallyClose(pendingClose);
    setPendingClose(null);
  };
  const confirmDiscard = () => {
    if (!pendingClose) return;
    actuallyClose(pendingClose);
    setPendingClose(null);
  };

  const setPreview = (v: boolean) => {
    if (!active) return;
    setOpen((prev) => prev.map((f) => (f.path === active ? { ...f, preview: v } : f)));
  };

  const showToggle = activeFile?.kind === "text" && !activeFile.error && isComponentFile(activeFile.name);
  const showEnvToggle = activeFile?.kind === "text" && !activeFile.error && isEnvFile(activeFile.name);
  const showCsvToggle = activeFile?.kind === "text" && !activeFile.error && isCsvFile(activeFile.name);
  const showMermaidToggle =
    activeFile?.kind === "text" && !activeFile.error && isMermaidFile(activeFile.name);

  return (
    <div className="flex h-full min-h-0">
      {/* Árbol de archivos */}
      <div className="w-56 shrink-0 overflow-hidden border-r border-zinc-800 bg-[#121212]">
        <FileTree root={project.path} onOpenFile={openFile} activePath={active} />
      </div>

      {pendingClose &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
            onMouseDown={() => setPendingClose(null)}
          >
            <div
              className="w-96 rounded-xl border border-zinc-800 bg-[#161616] p-4 shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="mb-1 text-sm font-medium text-zinc-100">Cambios sin guardar</div>
              <div className="mb-4 text-xs text-zinc-400">
                «{open.find((f) => f.path === pendingClose)?.name}» tiene cambios sin guardar.
                ¿Quieres guardarlos antes de cerrar?
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingClose(null)}
                  className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmDiscard}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Cerrar sin guardar
                </button>
                <button
                  type="button"
                  onClick={confirmSaveClose}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                >
                  Guardar y cerrar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        {open.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-600">
            Selecciona un archivo del árbol
          </div>
        ) : (
          <>
            {/* Barra de pestañas + toggle Código/Preview */}
            <div className="flex h-9 shrink-0 items-stretch border-b border-zinc-800 bg-[#121212]">
              <div className="no-scrollbar flex min-w-0 flex-1 items-stretch overflow-x-auto">
                {open.map((f) => {
                  const { icon, color } = fileIcon(f.name);
                  return (
                    <div
                      key={f.path}
                      onClick={() => setActive(f.path)}
                      onMouseDown={(e) => {
                        if (e.button === 1) {
                          e.preventDefault();
                          requestClose(f.path);
                        }
                      }}
                      className={cn(
                        "group flex cursor-pointer items-center gap-2 border-r border-zinc-800 px-3 text-xs",
                        active === f.path
                          ? "bg-[#1e1e1e] text-zinc-100"
                          : "text-zinc-400 hover:bg-[#191919]",
                      )}
                    >
                      <HugeiconsIcon icon={icon} size={12} className={cn("shrink-0", color)} />
                      <span className="max-w-[140px] truncate">{f.name}</span>
                      {f.dirty && <span className="size-1.5 shrink-0 rounded-full bg-zinc-400" />}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestClose(f.path);
                        }}
                        aria-label="Cerrar archivo"
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded transition-opacity hover:bg-zinc-700",
                          f.dirty ? "opacity-70" : "opacity-0 group-hover:opacity-70",
                        )}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
              {showToggle && (
                <div className="flex shrink-0 items-center px-2">
                  <div className="flex overflow-hidden rounded-md border border-zinc-800 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPreview(false)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5",
                        !activeFile?.preview ? "bg-zinc-700 text-white" : "text-zinc-400",
                      )}
                    >
                      <HugeiconsIcon icon={SourceCodeIcon} size={12} /> Código
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreview(true)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5",
                        activeFile?.preview ? "bg-indigo-600 text-white" : "text-zinc-400",
                      )}
                    >
                      <HugeiconsIcon icon={EyeIcon} size={12} /> Preview
                    </button>
                  </div>
                </div>
              )}
              {showEnvToggle && (
                <div className="flex shrink-0 items-center px-2">
                  <div className="flex overflow-hidden rounded-md border border-zinc-800 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPreview(false)}
                      className={cn(
                        "px-2 py-0.5",
                        !activeFile?.preview ? "bg-zinc-700 text-white" : "text-zinc-400",
                      )}
                    >
                      Formulario
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreview(true)}
                      className={cn(
                        "px-2 py-0.5",
                        activeFile?.preview ? "bg-zinc-700 text-white" : "text-zinc-400",
                      )}
                    >
                      Texto
                    </button>
                  </div>
                </div>
              )}
              {showCsvToggle && (
                <div className="flex shrink-0 items-center px-2">
                  <div className="flex overflow-hidden rounded-md border border-zinc-800 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPreview(false)}
                      className={cn(
                        "px-2 py-0.5",
                        !activeFile?.preview ? "bg-zinc-700 text-white" : "text-zinc-400",
                      )}
                    >
                      Tabla
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreview(true)}
                      className={cn(
                        "px-2 py-0.5",
                        activeFile?.preview ? "bg-zinc-700 text-white" : "text-zinc-400",
                      )}
                    >
                      Texto
                    </button>
                  </div>
                </div>
              )}
              {showMermaidToggle && (
                <div className="flex shrink-0 items-center px-2">
                  <div className="flex overflow-hidden rounded-md border border-zinc-800 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPreview(false)}
                      className={cn(
                        "px-2 py-0.5",
                        !activeFile?.preview ? "bg-indigo-600 text-white" : "text-zinc-400",
                      )}
                    >
                      Diagrama
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreview(true)}
                      className={cn(
                        "px-2 py-0.5",
                        activeFile?.preview ? "bg-zinc-700 text-white" : "text-zinc-400",
                      )}
                    >
                      Código
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Cuerpo */}
            <div
              className="min-h-0 flex-1 overflow-hidden"
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                  e.preventDefault();
                  if (active) save(active);
                }
              }}
            >
              {!activeFile ? null : activeFile.error ? (
                <div className="p-4 text-sm text-zinc-500">
                  No se puede mostrar este archivo.
                  <div className="mt-1 text-xs text-zinc-600">{activeFile.error}</div>
                </div>
              ) : activeFile.kind === "image" ? (
                <div className="checker flex h-full items-center justify-center overflow-auto p-4">
                  <img
                    src={activeFile.dataUrl}
                    alt={activeFile.name}
                    className="max-h-full max-w-full object-contain shadow-lg shadow-black/40"
                  />
                </div>
              ) : activeFile.kind === "media" ? (
                <MediaView
                  path={activeFile.path}
                  name={activeFile.name}
                  kind={activeFile.mediaKind!}
                />
              ) : isEnvFile(activeFile.name) && !activeFile.preview ? (
                <EnvEditor
                  key={activeFile.path}
                  initialContent={activeFile.content}
                  onChange={onChange}
                />
              ) : isCsvFile(activeFile.name) && !activeFile.preview ? (
                <CsvEditor
                  key={activeFile.path}
                  initialContent={activeFile.content}
                  name={activeFile.name}
                  onChange={onChange}
                />
              ) : isMarkdownFile(activeFile.name) ? (
                <div data-color-mode="dark" className="h-full overflow-hidden">
                  <MDEditor
                    value={activeFile.content}
                    onChange={(v) => onChange(v ?? "")}
                    height="100%"
                    preview="live"
                    visibleDragbar={false}
                  />
                </div>
              ) : isMermaidFile(activeFile.name) && !activeFile.preview ? (
                <MermaidView code={activeFile.content} />
              ) : activeFile.preview && isComponentFile(activeFile.name) ? (
                <ComponentPreview
                  projectPath={project.path}
                  filePath={activeFile.path}
                  content={activeFile.content}
                />
              ) : (
                <CodeMirror
                  value={activeFile.content}
                  height="100%"
                  theme={oneDark}
                  extensions={langFor(activeFile.name)}
                  basicSetup={EDITOR_SETUP}
                  onChange={onChange}
                  className="h-full text-[13px]"
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
