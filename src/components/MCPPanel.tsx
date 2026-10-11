import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlugSocketIcon,
  Add01Icon,
  Edit02Icon,
  Delete02Icon,
  Tick02Icon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import type { Project } from "@/components/Workspace";
import { cn } from "@/lib/utils";

type StdioServer = { command: string; args?: string[]; env?: Record<string, string> };
type RemoteServer = { type?: "sse" | "http"; url: string; headers?: Record<string, string> };
type Server = StdioServer | RemoteServer;
const isRemote = (s: Server): s is RemoteServer => typeof (s as RemoteServer).url === "string";

type Draft = {
  name: string;
  kind: "stdio" | "remote";
  command: string;
  args: string;
  env: string;
  transport: "sse" | "http";
  url: string;
  headers: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  kind: "stdio",
  command: "",
  args: "",
  env: "",
  transport: "sse",
  url: "",
  headers: "",
};

const linesToArr = (t: string) =>
  t.split("\n").map((l) => l.trim()).filter(Boolean);
const parseKV = (t: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of t.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
};
const kvToText = (o?: Record<string, string>) =>
  o ? Object.entries(o).map(([k, v]) => `${k}=${v}`).join("\n") : "";

function serverToDraft(name: string, s: Server): Draft {
  if (isRemote(s)) {
    return {
      ...EMPTY_DRAFT,
      name,
      kind: "remote",
      transport: s.type === "http" ? "http" : "sse",
      url: s.url,
      headers: kvToText(s.headers),
    };
  }
  return {
    ...EMPTY_DRAFT,
    name,
    kind: "stdio",
    command: s.command ?? "",
    args: (s.args ?? []).join("\n"),
    env: kvToText(s.env),
  };
}

function draftToServer(d: Draft): Server {
  if (d.kind === "remote") {
    const s: RemoteServer = { type: d.transport, url: d.url.trim() };
    const h = parseKV(d.headers);
    if (Object.keys(h).length) s.headers = h;
    return s;
  }
  const s: StdioServer = { command: d.command.trim() };
  const args = linesToArr(d.args);
  if (args.length) s.args = args;
  const env = parseKV(d.env);
  if (Object.keys(env).length) s.env = env;
  return s;
}

export default function MCPPanel({ project }: { project: Project }) {
  const file = project.path.replace(/[\\/]+$/, "") + "/.mcp.json";
  const [raw, setRaw] = useState<Record<string, any>>({});
  const [servers, setServers] = useState<Record<string, Server>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ draft: Draft; original: string | null } | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const txt = await invoke<string>("fs_read", { path: file });
      const obj = JSON.parse(txt);
      setRaw(obj && typeof obj === "object" ? obj : {});
      setServers(obj?.mcpServers && typeof obj.mcpServers === "object" ? obj.mcpServers : {});
    } catch {
      // No existe o JSON inválido → empezamos vacío.
      setRaw({});
      setServers({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    setEditing(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  const persist = async (next: Record<string, Server>) => {
    const obj = { ...raw, mcpServers: next };
    try {
      await invoke("fs_write", { path: file, content: JSON.stringify(obj, null, 2) });
      setRaw(obj);
      setServers(next);
      setEditing(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const save = () => {
    if (!editing) return;
    const name = editing.draft.name.trim();
    if (!name) {
      setError("El servidor necesita un nombre.");
      return;
    }
    if (editing.draft.kind === "stdio" && !editing.draft.command.trim()) {
      setError("Indica el comando a ejecutar.");
      return;
    }
    if (editing.draft.kind === "remote" && !editing.draft.url.trim()) {
      setError("Indica la URL del servidor.");
      return;
    }
    const next = { ...servers };
    if (editing.original && editing.original !== name) delete next[editing.original];
    next[name] = draftToServer(editing.draft);
    persist(next);
  };

  const remove = (name: string) => {
    const next = { ...servers };
    delete next[name];
    persist(next);
  };

  const names = Object.keys(servers);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 px-3 text-xs text-zinc-400">
        <HugeiconsIcon icon={PlugSocketIcon} size={14} className="text-indigo-400" />
        <span className="font-medium text-zinc-200">Servidores MCP</span>
        <span className="truncate text-[11px] text-zinc-600">· .mcp.json</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing({ draft: EMPTY_DRAFT, original: null })}
            className="flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
          >
            <HugeiconsIcon icon={Add01Icon} size={12} /> Agregar
          </button>
          <button
            type="button"
            onClick={load}
            title="Actualizar"
            className="flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={13} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded border border-red-900/50 bg-red-950/30 px-2 py-1.5 text-[11px] text-red-300">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {editing && (
          <ServerForm
            draft={editing.draft}
            onChange={(draft) => setEditing({ ...editing, draft })}
            onSubmit={save}
            onCancel={() => {
              setEditing(null);
              setError("");
            }}
          />
        )}

        {loading ? (
          <div className="text-xs text-zinc-500">cargando…</div>
        ) : names.length === 0 && !editing ? (
          <div className="mt-6 text-center text-xs text-zinc-600">
            No hay servidores MCP en este proyecto.
            <div className="mt-1 text-zinc-700">
              Agrega uno; se guardará en <span className="font-mono">.mcp.json</span> y Claude lo usará.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {names.map((name) => {
              const s = servers[name];
              const remote = isRemote(s);
              return (
                <div
                  key={name}
                  className="group flex items-center gap-3 rounded-lg border border-zinc-800 bg-[#1a1a1a] px-3 py-2"
                >
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                      remote ? "bg-sky-500/15 text-sky-300" : "bg-emerald-500/15 text-emerald-300",
                    )}
                  >
                    {remote ? (s as RemoteServer).type ?? "sse" : "stdio"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-zinc-100">{name}</div>
                    <div className="truncate font-mono text-[11px] text-zinc-500">
                      {remote
                        ? (s as RemoteServer).url
                        : [(s as StdioServer).command, ...((s as StdioServer).args ?? [])].join(" ")}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setEditing({ draft: serverToDraft(name, s), original: name })}
                      title="Editar"
                      className="flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    >
                      <HugeiconsIcon icon={Edit02Icon} size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(name)}
                      title="Eliminar"
                      className="flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ServerForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  return (
    <div className="mb-3 rounded-lg border border-indigo-900/40 bg-indigo-950/10 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <L label="Nombre">
          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="mi-servidor"
            spellCheck={false}
            className="w-48 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-indigo-500"
          />
        </L>
        <L label="Tipo">
          <select
            value={draft.kind}
            onChange={(e) => set({ kind: e.target.value as Draft["kind"] })}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-indigo-500"
          >
            <option value="stdio">stdio (comando local)</option>
            <option value="remote">remoto (sse / http)</option>
          </select>
        </L>
        {draft.kind === "remote" && (
          <L label="Transporte">
            <select
              value={draft.transport}
              onChange={(e) => set({ transport: e.target.value as Draft["transport"] })}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-indigo-500"
            >
              <option value="sse">sse</option>
              <option value="http">http</option>
            </select>
          </L>
        )}
      </div>

      {draft.kind === "stdio" ? (
        <>
          <L label="Comando">
            <input
              value={draft.command}
              onChange={(e) => set({ command: e.target.value })}
              placeholder="npx"
              spellCheck={false}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-indigo-500"
            />
          </L>
          <L label="Argumentos (uno por línea)">
            <textarea
              value={draft.args}
              onChange={(e) => set({ args: e.target.value })}
              rows={3}
              placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/ruta"}
              spellCheck={false}
              className="w-full resize-y rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-indigo-500"
            />
          </L>
          <L label="Variables de entorno (CLAVE=valor, una por línea)">
            <textarea
              value={draft.env}
              onChange={(e) => set({ env: e.target.value })}
              rows={2}
              placeholder="API_KEY=xxxx"
              spellCheck={false}
              className="w-full resize-y rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-indigo-500"
            />
          </L>
        </>
      ) : (
        <>
          <L label="URL">
            <input
              value={draft.url}
              onChange={(e) => set({ url: e.target.value })}
              placeholder="https://servidor.ejemplo.com/sse"
              spellCheck={false}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-indigo-500"
            />
          </L>
          <L label="Cabeceras (CLAVE=valor, una por línea)">
            <textarea
              value={draft.headers}
              onChange={(e) => set({ headers: e.target.value })}
              rows={2}
              placeholder="Authorization=Bearer xxxx"
              spellCheck={false}
              className="w-full resize-y rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-indigo-500"
            />
          </L>
        </>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          className="flex items-center gap-1 rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
        >
          <HugeiconsIcon icon={Tick02Icon} size={12} /> Guardar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-2 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
