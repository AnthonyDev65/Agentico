import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Cancel01Icon,
  CodeSquareIcon,
  Delete02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import {
  LANG_LABELS,
  deleteSnippet,
  langOfFile,
  loadSnippets,
  newSnippetId,
  upsertSnippet,
  useSnippets,
  type SnippetLang,
  type UserSnippet,
} from "@/lib/snippets";
import { cn } from "@/lib/utils";

type Props = {
  fileName: string | null;
  // Si viene, abre directamente un snippet nuevo con este cuerpo (guardar selección).
  draftBody?: string | null;
  canInsert: boolean;
  onInsert: (s: UserSnippet) => void;
  onClose: () => void;
};

const blank = (lang: SnippetLang, body = ""): UserSnippet => ({
  id: newSnippetId(),
  name: "",
  prefix: "",
  lang,
  description: "",
  body,
});

// Quita la indentación común (al guardar una selección a media función).
function dedent(text: string) {
  const lines = text.replace(/\s+$/, "").split("\n");
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join("\n");
}

export default function SnippetsPanel({ fileName, draftBody, canInsert, onInsert, onClose }: Props) {
  const all = useSnippets();
  const fileLang = fileName ? langOfFile(fileName) : "all";
  const [query, setQuery] = useState("");
  const [onlyLang, setOnlyLang] = useState(true);
  const [edit, setEdit] = useState<UserSnippet | null>(() =>
    draftBody != null ? blank(fileLang, dedent(draftBody)) : null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSnippets();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((s) => !onlyLang || !fileName || s.lang === "all" || s.lang === fileLang)
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.prefix.toLowerCase().includes(q) ||
          s.body.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [all, query, onlyLang, fileLang, fileName]);

  const isNew = edit != null && !all.some((s) => s.id === edit.id);

  const save = async () => {
    if (!edit) return;
    if (!edit.name.trim()) return setError("Ponle un nombre.");
    if (!edit.body.trim()) return setError("El snippet está vacío.");
    const prefix = edit.prefix.trim() || edit.name.trim().toLowerCase().replace(/\s+/g, "-");
    try {
      await upsertSnippet({ ...edit, name: edit.name.trim(), prefix });
      setEdit(null);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="flex h-[min(620px,85vh)] w-[min(900px,92vw)] overflow-hidden rounded-xl border border-zinc-800 bg-[#161616] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Lista */}
        <div className="flex w-72 shrink-0 flex-col border-r border-zinc-800">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
            <HugeiconsIcon icon={CodeSquareIcon} size={15} className="text-indigo-400" />
            <span className="text-sm font-medium text-zinc-100">Snippets</span>
            <button
              type="button"
              onClick={() => {
                setEdit(blank(fileLang));
                setError(null);
              }}
              className="ml-auto flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
            >
              <HugeiconsIcon icon={Add01Icon} size={12} /> Nuevo
            </button>
          </div>
          <div className="flex flex-col gap-2 border-b border-zinc-800 p-2">
            <div className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-[#121212] px-2">
              <HugeiconsIcon icon={Search01Icon} size={12} className="text-zinc-500" />
              <input
                autoFocus={draftBody == null}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="h-7 flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
              />
            </div>
            {fileName && (
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={onlyLang}
                  onChange={(e) => setOnlyLang(e.target.checked)}
                  className="accent-indigo-500"
                />
                Solo {LANG_LABELS[fileLang]}
              </label>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {list.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-600">
                {all.length === 0
                  ? "Aún no tienes snippets. Selecciona código y usa clic derecho → «Guardar como snippet»."
                  : "Sin resultados"}
              </div>
            ) : (
              list.map((s) => (
                <div
                  key={s.id}
                  onClick={() => {
                    setEdit(s);
                    setError(null);
                  }}
                  onDoubleClick={() => canInsert && onInsert(s)}
                  className={cn(
                    "group cursor-pointer rounded-md px-2 py-1.5",
                    edit?.id === s.id ? "bg-zinc-800" : "hover:bg-zinc-800/50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs text-zinc-200">{s.name}</span>
                    <span className="ml-auto shrink-0 rounded bg-zinc-800 px-1 font-mono text-[10px] text-indigo-300">
                      {s.prefix}
                    </span>
                  </div>
                  <div className="truncate font-mono text-[10px] text-zinc-500">
                    {LANG_LABELS[s.lang]} · {s.body.split("\n")[0]}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Detalle / editor */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center border-b border-zinc-800 px-3 py-2.5">
            <span className="text-xs text-zinc-400">
              {edit ? (isNew ? "Nuevo snippet" : "Editar snippet") : "Selecciona un snippet"}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="ml-auto flex size-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={13} />
            </button>
          </div>

          {!edit ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-xs text-zinc-600">
              <div>Doble clic en un snippet para insertarlo en el cursor.</div>
              <div>
                También aparecen en el autocompletado al escribir su <span className="text-indigo-300">prefijo</span>.
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
              <div className="grid grid-cols-[1fr_140px_130px] gap-2">
                <Field label="Nombre">
                  <input
                    autoFocus={draftBody != null}
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                    placeholder="Fetch con manejo de errores"
                    className={inputCls}
                  />
                </Field>
                <Field label="Prefijo">
                  <input
                    value={edit.prefix}
                    onChange={(e) => setEdit({ ...edit, prefix: e.target.value.replace(/\s/g, "") })}
                    placeholder="fetchx"
                    className={cn(inputCls, "font-mono")}
                  />
                </Field>
                <Field label="Lenguaje">
                  <select
                    value={edit.lang}
                    onChange={(e) => setEdit({ ...edit, lang: e.target.value as SnippetLang })}
                    className={inputCls}
                  >
                    {(Object.keys(LANG_LABELS) as SnippetLang[]).map((l) => (
                      <option key={l} value={l}>
                        {LANG_LABELS[l]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Descripción (opcional)">
                <input
                  value={edit.description ?? ""}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <div className="flex min-h-0 flex-1 flex-col gap-1">
                <span className="text-[11px] text-zinc-500">
                  Código · usa <code className="text-indigo-300">{"${1:nombre}"}</code> para campos que se
                  rellenan con Tab
                </span>
                <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-zinc-800">
                  <CodeMirror
                    value={edit.body}
                    height="100%"
                    theme={oneDark}
                    onChange={(v) => setEdit((cur) => (cur ? { ...cur, body: v } : cur))}
                    basicSetup={{ foldGutter: false, autocompletion: false }}
                    className="h-full text-[12px]"
                  />
                </div>
              </div>
              {error && <div className="text-xs text-red-400">{error}</div>}
              <div className="flex items-center gap-2">
                {!isNew && (
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteSnippet(edit.id);
                      setEdit(null);
                    }}
                    className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={13} /> Eliminar
                  </button>
                )}
                <div className="ml-auto flex gap-2">
                  {!isNew && canInsert && (
                    <button
                      type="button"
                      onClick={() => onInsert(edit)}
                      className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Insertar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={save}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const inputCls =
  "h-8 w-full rounded-md border border-zinc-800 bg-[#121212] px-2 text-xs text-zinc-200 outline-none focus:border-indigo-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
