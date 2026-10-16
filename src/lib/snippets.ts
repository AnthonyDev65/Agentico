import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EditorState, type Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { snippet, snippetCompletion, type CompletionContext } from "@codemirror/autocomplete";

// Librería global de snippets del usuario (persistida en snippets.json vía Rust).
// Sintaxis del cuerpo: `${1:nombre}` / `${2}` son tab stops (Tab salta entre ellos);
// cualquier otro `${...}` (template literals) se inserta literal.

export type SnippetLang = "all" | "js" | "css" | "html" | "py" | "rs" | "md" | "json" | "sql" | "other";

export type UserSnippet = {
  id: string;
  name: string;
  prefix: string;
  lang: SnippetLang;
  description?: string;
  body: string;
};

export const LANG_LABELS: Record<SnippetLang, string> = {
  all: "Todos",
  js: "JS / TS",
  css: "CSS",
  html: "HTML",
  py: "Python",
  rs: "Rust",
  md: "Markdown",
  json: "JSON",
  sql: "SQL",
  other: "Otro",
};

export function langOfFile(name: string): SnippetLang {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts", "vue", "svelte"].includes(ext)) return "js";
  if (["css", "scss", "less"].includes(ext)) return "css";
  if (["html", "htm"].includes(ext)) return "html";
  if (ext === "py") return "py";
  if (ext === "rs") return "rs";
  if (["md", "markdown", "mdx"].includes(ext)) return "md";
  if (ext === "json") return "json";
  if (ext === "sql") return "sql";
  return "other";
}

// ── Store mínimo (módulo) ──

let snippets: UserSnippet[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export async function loadSnippets() {
  if (loaded) return;
  loaded = true;
  try {
    const data = await invoke<UserSnippet[]>("snippets_load");
    snippets = Array.isArray(data) ? data : [];
    emit();
  } catch {
    loaded = false;
  }
}

async function persist(next: UserSnippet[]) {
  snippets = next;
  emit();
  await invoke("snippets_save", { snippets: next });
}

export function upsertSnippet(s: UserSnippet) {
  const exists = snippets.some((x) => x.id === s.id);
  return persist(exists ? snippets.map((x) => (x.id === s.id ? s : x)) : [...snippets, s]);
}

export function deleteSnippet(id: string) {
  return persist(snippets.filter((x) => x.id !== id));
}

export function newSnippetId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function useSnippets(): UserSnippet[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snippets,
  );
}

export function snippetsFor(lang: SnippetLang) {
  return snippets.filter((s) => s.lang === "all" || s.lang === lang);
}

// ── Integración con CodeMirror ──

// Convierte el cuerpo a plantilla de CodeMirror: solo `${N}` / `${N:texto}` son
// campos; el resto de `${` / `#{` y llaves escapadas se insertan literales.
export function toTemplate(body: string) {
  return body
    .replace(/\\([{}])/g, "\\\\$1")
    .replace(/([$#])\{(?!\d+(?::[^}]*)?\})/g, "$1\\{");
}

// Inserta un snippet en la posición/selección actual del editor.
export function insertSnippet(view: EditorView, s: UserSnippet) {
  const { from, to } = view.state.selection.main;
  snippet(toTemplate(s.body))(view, { label: s.prefix }, from, to);
  view.focus();
}

// Fuente de autocompletado: sugiere los snippets del usuario por prefijo.
function userSnippetSource(lang: SnippetLang) {
  return (context: CompletionContext) => {
    const word = context.matchBefore(/[\w$!.-]+/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const list = snippetsFor(lang);
    if (!list.length) return null;
    return {
      from: word.from,
      options: list.map((s) =>
        snippetCompletion(toTemplate(s.body), {
          label: s.prefix || s.name,
          detail: s.name,
          info: s.description || s.body.slice(0, 300),
          type: "text",
          boost: 50,
        }),
      ),
      validFor: /^[\w$!.-]*$/,
    };
  };
}

export function userSnippetsExtension(fileName: string): Extension {
  const lang = langOfFile(fileName);
  return EditorState.languageData.of(() => [{ autocomplete: userSnippetSource(lang) }]);
}
