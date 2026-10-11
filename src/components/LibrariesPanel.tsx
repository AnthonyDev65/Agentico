import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HugeiconsIcon } from "@hugeicons/react";
import { CubeIcon, Refresh01Icon, Download01Icon, Delete01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import type { Project } from "@/components/Workspace";
import { cn } from "@/lib/utils";

type Lib = { name: string; range: string; dev: boolean; installed: string | null };
type Libraries = { manager: string; libs: Lib[] };
type NpmResult = { name: string; version: string; description: string };

export default function LibrariesPanel({ project }: { project: Project }) {
  const [data, setData] = useState<Libraries | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NpmResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [dev, setDev] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setData(await invoke<Libraries>("libraries_list", { projectPath: project.path }));
    } catch {
      /* no-op */
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  // Búsqueda en el registro de npm (con debounce).
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=12`,
        );
        const j = await r.json();
        setResults(
          (j.objects ?? []).map((o: any) => ({
            name: o.package.name,
            version: o.package.version,
            description: o.package.description ?? "",
          })),
        );
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [query]);

  const add = async (name: string) => {
    setInstalling(name);
    setNote(null);
    try {
      const out = await invoke<string>("library_add", { projectPath: project.path, name, dev });
      setNote(out.trim().slice(-800));
      setQuery("");
      setResults(null);
      refresh();
    } catch (e) {
      setNote(String(e).slice(-800));
    } finally {
      setInstalling(null);
    }
  };

  const remove = async (name: string) => {
    setInstalling(name);
    setNote(null);
    try {
      const out = await invoke<string>("library_remove", { projectPath: project.path, name });
      setNote(out.trim().slice(-800));
      refresh();
    } catch (e) {
      setNote(String(e).slice(-800));
    } finally {
      setInstalling(null);
    }
  };

  const deps = data?.libs.filter((l) => !l.dev) ?? [];
  const devDeps = data?.libs.filter((l) => l.dev) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-3 text-xs text-zinc-400">
        <HugeiconsIcon icon={CubeIcon} size={14} />
        <span className="font-medium text-zinc-200">Librerías</span>
        {data && (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
            {data.manager}
          </span>
        )}
        <button
          type="button"
          onClick={refresh}
          title="Refrescar"
          className="ml-auto flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <HugeiconsIcon icon={Refresh01Icon} size={14} />
        </button>
      </div>

      {/* Buscar / instalar */}
      <div className="border-b border-zinc-800 bg-[#121212] p-2">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) add(query.trim());
            }}
            placeholder="Buscar o escribir paquete (ej. zod, react@18)…"
            className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-[#1a1a1a] px-2 py-1 text-xs text-zinc-100 outline-none focus:border-indigo-500/60"
          />
          <div className="flex items-center overflow-hidden rounded-md border border-zinc-800 text-[11px]">
            <button
              type="button"
              onClick={() => setDev(false)}
              className={cn("px-2 py-1", !dev ? "bg-zinc-700 text-white" : "text-zinc-400")}
            >
              dep
            </button>
            <button
              type="button"
              onClick={() => setDev(true)}
              className={cn("px-2 py-1", dev ? "bg-zinc-700 text-white" : "text-zinc-400")}
            >
              dev
            </button>
          </div>
          <button
            type="button"
            onClick={() => query.trim() && add(query.trim())}
            disabled={!query.trim() || !!installing}
            className="shrink-0 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Instalar
          </button>
        </div>

        {query.trim() && (
          <div className="mt-2 max-h-56 overflow-auto rounded border border-zinc-800">
            {searching && <div className="p-2 text-[11px] text-zinc-600">buscando…</div>}
            {!searching && results && results.length === 0 && (
              <div className="p-2 text-[11px] text-zinc-600">
                sin resultados (puedes instalar el nombre exacto con “Instalar”)
              </div>
            )}
            {results?.map((r) => (
              <div
                key={r.name}
                className="flex items-center gap-2 border-b border-zinc-800/60 px-2 py-1.5 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-zinc-200">
                    {r.name} <span className="text-zinc-600">{r.version}</span>
                  </div>
                  <div className="truncate text-[10px] text-zinc-500">{r.description}</div>
                </div>
                <button
                  type="button"
                  onClick={() => add(r.name)}
                  disabled={!!installing}
                  title="Instalar"
                  className="flex shrink-0 items-center rounded bg-indigo-600 px-2 py-0.5 text-[11px] text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  {installing === r.name ? (
                    <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={Download01Icon} size={12} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {installing && (
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-400">
          <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" /> procesando {installing}…
        </div>
      )}
      {note && (
        <div className="max-h-28 overflow-auto whitespace-pre-wrap border-b border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[10px] text-zinc-400">
          {note}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <LibGroup title="Dependencies" libs={deps} onRemove={remove} installing={installing} />
        <LibGroup title="Dev dependencies" libs={devDeps} onRemove={remove} installing={installing} />
      </div>
    </div>
  );
}

function LibGroup({
  title,
  libs,
  onRemove,
  installing,
}: {
  title: string;
  libs: Lib[];
  onRemove: (name: string) => void;
  installing: string | null;
}) {
  return (
    <div className="mb-3">
      <div className="px-1 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {title} <span className="text-zinc-600">{libs.length}</span>
      </div>
      {libs.length === 0 ? (
        <div className="px-1 text-[11px] text-zinc-700">—</div>
      ) : (
        <div className="flex flex-col">
          {libs.map((l) => (
            <div
              key={l.name}
              className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-zinc-800/40"
            >
              <HugeiconsIcon icon={CubeIcon} size={13} className="shrink-0 text-zinc-600" />
              <span className="truncate text-[13px] text-zinc-200">{l.name}</span>
              <span className="shrink-0 text-[10px] text-zinc-600">{l.range}</span>
              {l.installed ? (
                <span className="shrink-0 text-[10px] text-emerald-500/70">· {l.installed}</span>
              ) : (
                <span className="shrink-0 text-[10px] text-amber-500/70">· no instalado</span>
              )}
              <button
                type="button"
                onClick={() => onRemove(l.name)}
                disabled={!!installing}
                title="Desinstalar"
                className="ml-auto text-zinc-500 opacity-0 transition hover:text-red-400 group-hover:opacity-100 disabled:opacity-40"
              >
                <HugeiconsIcon icon={Delete01Icon} size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
