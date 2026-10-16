import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  DatabaseIcon,
  DatabaseAddIcon,
  Table01Icon,
  Key01Icon,
  PlayIcon,
  Refresh01Icon,
  Add01Icon,
  Delete02Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Search01Icon,
  Logout01Icon,
  Edit02Icon,
  SourceCodeIcon,
  TablePropertiesIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// Gestor de bases de datos PostgreSQL externas (estilo Supabase): conexiones guardadas,
// explorador de tablas, editor de filas (por clave primaria), estructura y editor SQL.
// Contraseñas en el Administrador de credenciales de Windows (comandos db_* en db.rs).

type Conn = { id: string; name: string; host: string; port: number; database: string; user: string; ssl: "disable" | "require" | "verify" };
type Col = { name: string; type: string; nullable: boolean; default: string | null; pk: boolean };
type Table = { schema: string; name: string; kind: string; estimate: number; columns: Col[] };
type QRes = { columns: string[]; rows: (string | null)[][]; affected: number; truncated: boolean };
type Page = { result: QRes; total: number; exact: boolean };
type Cell = { col: string; type: string; value: string | null };

const LS_CONNS = "agentico.db.connections";
const LS_SQL = "agentico.db.sql";
const PAGE = 100;

const loadConns = (): Conn[] => {
  try {
    const v = JSON.parse(localStorage.getItem(LS_CONNS) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const saveConns = (c: Conn[]) => {
  try {
    localStorage.setItem(LS_CONNS, JSON.stringify(c));
  } catch {
    /* no-op */
  }
};

/** postgres://user:pass@host:5432/db?sslmode=require → campos del formulario. */
function parseUrl(u: string): Partial<Conn> & { password?: string } | null {
  try {
    const x = new URL(u.trim().replace(/^postgresql:/, "postgres:").replace(/^postgres:/, "http:"));
    const ssl = x.searchParams.get("sslmode");
    return {
      host: x.hostname,
      port: Number(x.port) || 5432,
      database: decodeURIComponent(x.pathname.replace(/^\//, "")) || "postgres",
      user: decodeURIComponent(x.username),
      password: decodeURIComponent(x.password),
      ssl: ssl === "disable" ? "disable" : ssl === "verify-full" || ssl === "verify-ca" ? "verify" : "require",
    };
  } catch {
    return null;
  }
}

const fmt = (n: number) => n.toLocaleString("es");
const kindLabel: Record<string, string> = { view: "vista", matview: "vista mat.", foreign: "externa", partitioned: "particionada" };

// ───────────────────────────── Principal ─────────────────────────────

export default function DbManager({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  const [conns, setConns] = useState<Conn[]>(loadConns);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Conn | "new" | null>(() => (loadConns().length ? null : "new"));
  const [status, setStatus] = useState<{ busy: boolean; version?: string; error?: string }>({ busy: false });
  const [tables, setTables] = useState<Table[]>([]);
  const [sel, setSel] = useState<string | null>(null); // "schema.table"
  const [view, setView] = useState<"data" | "structure" | "sql">("data");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const close = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".cm-focused") && close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = conns.find((c) => c.id === activeId) ?? null;

  const loadSchema = async (id = activeId) => {
    if (!id) return;
    try {
      const t = await invoke<Table[]>("db_schema", { id });
      setTables(t);
      setSel((s) => (s && t.some((x) => `${x.schema}.${x.name}` === s) ? s : t[0] ? `${t[0].schema}.${t[0].name}` : null));
    } catch (e) {
      setStatus((s) => ({ ...s, error: String(e) }));
    }
  };

  const connect = async (c: Conn, password?: string) => {
    setStatus({ busy: true });
    setEditing(null);
    try {
      const version = await invoke<string>("db_connect", { conn: c, password: password ?? null });
      setActiveId(c.id);
      setStatus({ busy: false, version });
      setTables([]);
      setSel(null);
      await loadSchema(c.id);
    } catch (e) {
      setActiveId(null);
      setStatus({ busy: false, error: String(e) });
    }
  };

  const disconnect = async () => {
    if (activeId) await invoke("db_disconnect", { id: activeId }).catch(() => {});
    setActiveId(null);
    setTables([]);
    setSel(null);
    setStatus({ busy: false });
  };

  const saveConn = async (c: Conn, password: string | null, andConnect: boolean) => {
    const next = conns.some((x) => x.id === c.id) ? conns.map((x) => (x.id === c.id ? c : x)) : [...conns, c];
    setConns(next);
    saveConns(next);
    if (password !== null) await invoke("db_password_set", { id: c.id, password }).catch(() => {});
    if (andConnect) await connect(c);
    else setEditing(null);
  };

  const deleteConn = async (c: Conn) => {
    if (activeId === c.id) await disconnect();
    await invoke("db_password_delete", { id: c.id }).catch(() => {});
    const next = conns.filter((x) => x.id !== c.id);
    setConns(next);
    saveConns(next);
    setEditing(next.length ? null : "new");
  };

  const table = tables.find((t) => `${t.schema}.${t.name}` === sel) ?? null;
  const schemas = useMemo(() => {
    const q = search.trim().toLowerCase();
    const m = new Map<string, Table[]>();
    for (const t of tables) {
      if (q && !t.name.toLowerCase().includes(q)) continue;
      m.set(t.schema, [...(m.get(t.schema) ?? []), t]);
    }
    return [...m.entries()];
  }, [tables, search]);

  return createPortal(
    <>
      <div
        onMouseDown={close}
        className={cn("fixed inset-0 z-[79] bg-black/40 transition-opacity duration-300", visible ? "opacity-100" : "opacity-0")}
      />
      <div
        className={cn(
          "fixed bottom-3 left-3 top-11 z-[80] flex w-[1400px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#161616] shadow-2xl shadow-black/60 transition-transform duration-300 ease-out",
          visible ? "translate-x-0" : "-translate-x-[130%]",
        )}
      >
        {/* Cabecera */}
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-800 bg-[#1a1a1a] px-4">
          <HugeiconsIcon icon={DatabaseIcon} size={16} className="text-emerald-400" />
          <span className="text-sm font-semibold text-zinc-100">Base de datos</span>
          {active && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              {active.name} · {active.database}
              {status.version && <span className="text-emerald-300/50">· PostgreSQL {status.version.split(" ")[0]}</span>}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {active && (
              <button type="button" onClick={disconnect} className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
                <HugeiconsIcon icon={Logout01Icon} size={13} /> Desconectar
              </button>
            )}
            <button type="button" onClick={close} className="flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
              <HugeiconsIcon icon={Cancel01Icon} size={15} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Barra lateral: conexiones + tablas */}
          <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-[#141414]">
            <div className="flex flex-col gap-1 border-b border-zinc-800 p-2">
              {conns.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]",
                    activeId === c.id ? "bg-emerald-500/10 text-emerald-200" : "text-zinc-300 hover:bg-zinc-800/70",
                  )}
                >
                  <button type="button" onClick={() => connect(c)} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={`${c.user}@${c.host}:${c.port}/${c.database}`}>
                    <HugeiconsIcon icon={DatabaseIcon} size={13} className={activeId === c.id ? "text-emerald-400" : "text-zinc-500"} />
                    <span className="truncate">{c.name}</span>
                  </button>
                  <button type="button" onClick={() => setEditing(c)} title="Editar conexión" className="opacity-0 transition-opacity group-hover:opacity-100">
                    <HugeiconsIcon icon={Edit02Icon} size={12} className="text-zinc-500 hover:text-zinc-200" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200"
              >
                <HugeiconsIcon icon={DatabaseAddIcon} size={13} /> Nueva conexión
              </button>
            </div>

            {active && (
              <>
                <div className="flex items-center gap-1 p-2">
                  <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-zinc-800 bg-[#0f0f0f] px-2 py-1">
                    <HugeiconsIcon icon={Search01Icon} size={12} className="text-zinc-600" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar tabla…"
                      className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-200 outline-none placeholder:text-zinc-600"
                    />
                  </label>
                  <button type="button" onClick={() => loadSchema()} title="Recargar esquema" className="flex size-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
                    <HugeiconsIcon icon={Refresh01Icon} size={13} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                  {schemas.map(([schema, ts]) => (
                    <div key={schema} className="mb-2">
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{schema}</div>
                      {ts.map((t) => {
                        const key = `${t.schema}.${t.name}`;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setSel(key);
                              if (view === "sql") setView("data");
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px]",
                              sel === key && view !== "sql" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
                            )}
                          >
                            <HugeiconsIcon icon={Table01Icon} size={12} className={t.kind === "table" ? "text-zinc-500" : "text-sky-500"} />
                            <span className="min-w-0 flex-1 truncate">{t.name}</span>
                            {t.kind !== "table" && <span className="text-[9px] text-sky-500/80">{kindLabel[t.kind] ?? t.kind}</span>}
                            {t.estimate >= 0 && t.kind === "table" && <span className="text-[10px] text-zinc-600">{fmt(t.estimate)}</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {tables.length === 0 && <div className="px-2 py-4 text-center text-[11px] text-zinc-600">Sin tablas.</div>}
                </div>
              </>
            )}
          </aside>

          {/* Contenido */}
          <section className="flex min-w-0 flex-1 flex-col">
            {status.error && (
              <pre className="shrink-0 whitespace-pre-wrap border-b border-zinc-800 bg-red-500/10 px-4 py-2 font-mono text-[11px] text-red-300">{status.error}</pre>
            )}
            {editing ? (
              <ConnForm
                key={editing === "new" ? "new" : editing.id}
                initial={editing === "new" ? null : editing}
                onCancel={conns.length ? () => setEditing(null) : undefined}
                onSave={saveConn}
                onDelete={editing === "new" ? undefined : () => deleteConn(editing)}
              />
            ) : status.busy ? (
              <div className="m-auto text-sm text-zinc-500">Conectando…</div>
            ) : !active ? (
              <div className="m-auto flex flex-col items-center gap-3 text-center text-sm text-zinc-500">
                <HugeiconsIcon icon={DatabaseIcon} size={32} className="text-zinc-700" />
                Elige una conexión de la izquierda o crea una nueva.
              </div>
            ) : (
              <>
                {/* Pestañas */}
                <div className="flex h-10 shrink-0 items-center gap-1 border-b border-zinc-800 px-3">
                  {(
                    [
                      ["data", "Datos", Table01Icon],
                      ["structure", "Estructura", TablePropertiesIcon],
                      ["sql", "SQL", SourceCodeIcon],
                    ] as const
                  ).map(([k, label, icon]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setView(k)}
                      disabled={k !== "sql" && !table}
                      className={cn(
                        "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] disabled:opacity-40",
                        view === k ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
                      )}
                    >
                      <HugeiconsIcon icon={icon} size={13} /> {label}
                    </button>
                  ))}
                  {table && view !== "sql" && (
                    <span className="ml-2 truncate font-mono text-[12px] text-zinc-500">
                      {table.schema}.<span className="text-zinc-200">{table.name}</span>
                    </span>
                  )}
                </div>
                {view === "sql" ? (
                  <SqlEditor connId={active.id} onSchemaChange={() => loadSchema()} />
                ) : table ? (
                  view === "data" ? (
                    <DataView key={`${active.id}:${sel}`} connId={active.id} table={table} />
                  ) : (
                    <Structure table={table} />
                  )
                ) : (
                  <div className="m-auto text-sm text-zinc-600">Elige una tabla.</div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ───────────────────────────── Conexión ─────────────────────────────

function ConnForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Conn | null;
  onSave: (c: Conn, password: string | null, andConnect: boolean) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [c, setC] = useState<Conn>(
    initial ?? { id: crypto.randomUUID(), name: "", host: "", port: 5432, database: "postgres", user: "postgres", ssl: "require" },
  );
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [test, setTest] = useState<{ busy?: boolean; ok?: string; error?: string }>({});
  const [armed, setArmed] = useState(false);

  const fromUrl = (u: string) => {
    setUrl(u);
    const p = parseUrl(u);
    if (!p?.host) return;
    setC((x) => ({ ...x, host: p.host!, port: p.port!, database: p.database!, user: p.user || x.user, ssl: p.ssl!, name: x.name || p.host!.split(".")[0] }));
    if (p.password) setPassword(p.password);
  };

  const runTest = async () => {
    setTest({ busy: true });
    const id = `__test__${c.id}`;
    try {
      // La contraseña guardada está bajo el id real: se prueba con él si no hay una nueva.
      const v = await invoke<string>("db_connect", {
        conn: { ...c, id: password || !initial ? id : c.id },
        // Sin contraseña nueva en una conexión guardada: se usa la del Administrador de credenciales.
        password: password || (initial ? null : ""),
      });
      setTest({ ok: `Conectado · PostgreSQL ${v}` });
    } catch (e) {
      setTest({ error: String(e) });
    } finally {
      if (password || !initial) invoke("db_disconnect", { id }).catch(() => {});
    }
  };

  const valid = c.host.trim() && c.database.trim() && c.user.trim() && c.port > 0;
  const field = "h-8 rounded-md border border-zinc-800 bg-[#0f0f0f] px-2.5 text-[12px] text-zinc-100 outline-none focus:border-emerald-500/60";
  const label = "flex flex-col gap-1 text-[11px] text-zinc-500";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <div>
          <div className="text-base font-semibold text-zinc-100">{initial ? "Editar conexión" : "Nueva conexión PostgreSQL"}</div>
          <div className="mt-1 text-[12px] text-zinc-500">
            Funciona con cualquier Postgres externo: Supabase, Neon, Railway, RDS, un servidor propio… La contraseña se guarda en el
            Administrador de credenciales de Windows.
          </div>
        </div>

        <label className={label}>
          Pegar URL de conexión (opcional)
          <input
            value={url}
            onChange={(e) => fromUrl(e.target.value)}
            placeholder="postgresql://usuario:contraseña@host:5432/basedatos?sslmode=require"
            spellCheck={false}
            className={cn(field, "font-mono")}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={cn(label, "col-span-2")}>
            Nombre
            <input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Producción, Supabase…" className={field} />
          </label>
          <label className={label}>
            Host
            <input value={c.host} onChange={(e) => setC({ ...c, host: e.target.value.trim() })} placeholder="db.xxxx.supabase.co" spellCheck={false} className={cn(field, "font-mono")} />
          </label>
          <label className={label}>
            Puerto
            <input type="number" value={c.port} onChange={(e) => setC({ ...c, port: Number(e.target.value) || 5432 })} className={cn(field, "font-mono")} />
          </label>
          <label className={label}>
            Base de datos
            <input value={c.database} onChange={(e) => setC({ ...c, database: e.target.value.trim() })} spellCheck={false} className={cn(field, "font-mono")} />
          </label>
          <label className={label}>
            Usuario
            <input value={c.user} onChange={(e) => setC({ ...c, user: e.target.value.trim() })} spellCheck={false} className={cn(field, "font-mono")} />
          </label>
          <label className={cn(label, "col-span-2")}>
            Contraseña {initial && <span className="text-zinc-600">(vacío = mantener la guardada)</span>}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          </label>
          <label className={cn(label, "col-span-2")}>
            SSL
            <div className="flex gap-1.5">
              {(
                [
                  ["require", "Requerido", "Cifrado (como psql por defecto). Recomendado."],
                  ["verify", "Verificar certificado", "Cifrado + certificado válido para el host."],
                  ["disable", "Sin SSL", "Solo para bases locales."],
                ] as const
              ).map(([k, l, t]) => (
                <button
                  key={k}
                  type="button"
                  title={t}
                  onClick={() => setC({ ...c, ssl: k })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px]",
                    c.ssl === k ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-600",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </label>
        </div>

        {test.ok && <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">{test.ok}</div>}
        {test.error && <pre className="whitespace-pre-wrap rounded-md bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-300">{test.error}</pre>}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!valid}
            onClick={() => onSave({ ...c, name: c.name.trim() || c.host }, password || (initial ? null : ""), true)}
            className="rounded-md bg-emerald-600 px-4 py-2 text-[12px] font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            Guardar y conectar
          </button>
          <button
            type="button"
            disabled={!valid || test.busy}
            onClick={runTest}
            className="rounded-md border border-zinc-700 px-3 py-2 text-[12px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
          >
            {test.busy ? "Probando…" : "Probar conexión"}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-[12px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
              Cancelar
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => (armed ? onDelete() : setArmed(true))}
              onMouseLeave={() => setArmed(false)}
              className={cn(
                "ml-auto rounded-md px-3 py-2 text-[12px]",
                armed ? "bg-red-600 text-white hover:bg-red-500" : "text-red-400 hover:bg-red-500/10",
              )}
            >
              {armed ? "¿Eliminar conexión?" : "Eliminar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Datos ─────────────────────────────

function DataView({ connId, table }: { connId: string; table: Table }) {
  const [page, setPage] = useState(0);
  const [order, setOrder] = useState<{ col: string; desc: boolean } | null>(() => {
    const pk = table.columns.find((c) => c.pk);
    return pk ? { col: pk.name, desc: false } : null;
  });
  const [filterDraft, setFilterDraft] = useState("");
  const [filter, setFilter] = useState("");
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [edit, setEdit] = useState<{ row: number; col: number; value: string; isNull: boolean } | null>(null);
  const [inserting, setInserting] = useState<Record<string, { value: string; isNull: boolean }> | null>(null);
  const [armedDelete, setArmedDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const pkCols = table.columns.filter((c) => c.pk);
  const editable = table.kind === "table" || table.kind === "partitioned";
  const canEditRows = editable && pkCols.length > 0;
  const colType = (name: string) => table.columns.find((c) => c.name === name)?.type ?? "text";

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await invoke<Page>("db_rows", {
        id: connId,
        schema: table.schema,
        table: table.name,
        limit: PAGE,
        offset: page * PAGE,
        orderBy: order?.col ?? null,
        desc: order?.desc ?? false,
        filter: filter || null,
      });
      setData(p);
      setSelected(new Set());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, order?.col, order?.desc, filter]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const rows = data?.result.rows ?? [];
  const cols = data?.result.columns ?? table.columns.map((c) => c.name);
  const keyOf = (row: (string | null)[]): Cell[] =>
    pkCols.map((pk) => ({ col: pk.name, type: pk.type, value: row[cols.indexOf(pk.name)] ?? null }));

  const saveEdit = async () => {
    if (!edit) return;
    const row = rows[edit.row];
    const col = cols[edit.col];
    const value = edit.isNull ? null : edit.value;
    if (value === row[edit.col]) return setEdit(null);
    try {
      await invoke<number>("db_update", {
        id: connId,
        schema: table.schema,
        table: table.name,
        key: keyOf(row),
        set: [{ col, type: colType(col), value }],
      });
      // Recarga la fila (el servidor puede normalizar el valor, p. ej. fechas o json).
      setEdit(null);
      await load();
      setNotice("Guardado");
    } catch (e) {
      setError(String(e));
    }
  };

  const doInsert = async () => {
    if (!inserting) return;
    const values: Cell[] = Object.entries(inserting)
      .filter(([, v]) => v.isNull || v.value !== "")
      .map(([col, v]) => ({ col, type: colType(col), value: v.isNull ? null : v.value }));
    try {
      await invoke<number>("db_insert", { id: connId, schema: table.schema, table: table.name, values });
      setInserting(null);
      await load();
      setNotice("Fila insertada");
    } catch (e) {
      setError(String(e));
    }
  };

  const doDelete = async () => {
    try {
      const n = await invoke<number>("db_delete", {
        id: connId,
        schema: table.schema,
        table: table.name,
        keys: [...selected].map((i) => keyOf(rows[i])),
      });
      setArmedDelete(false);
      await load();
      setNotice(`${n} fila(s) borrada(s)`);
    } catch (e) {
      setArmedDelete(false);
      setError(String(e));
    }
  };

  const total = data?.total ?? 0;
  const from = total ? page * PAGE + 1 : 0;
  const to = Math.min(total, page * PAGE + rows.length);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Barra de herramientas */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <label className="flex min-w-[260px] flex-1 items-center gap-1.5 rounded-md border border-zinc-800 bg-[#0f0f0f] px-2 py-1">
          <span className="font-mono text-[11px] text-zinc-600">WHERE</span>
          <input
            value={filterDraft}
            onChange={(e) => setFilterDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(0);
                setFilter(filterDraft.trim());
              }
            }}
            placeholder="email ILIKE '%@gmail.com' AND created_at > now() - interval '7 days'   (Enter)"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-zinc-200 outline-none placeholder:text-zinc-700"
          />
          {filter && (
            <button
              type="button"
              onClick={() => {
                setFilterDraft("");
                setFilter("");
                setPage(0);
              }}
              className="text-zinc-500 hover:text-zinc-200"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          )}
        </label>
        <button type="button" onClick={load} title="Recargar" className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
          <HugeiconsIcon icon={Refresh01Icon} size={13} className={loading ? "animate-spin" : ""} />
        </button>
        {editable && (
          <button
            type="button"
            onClick={() => setInserting(Object.fromEntries(table.columns.map((c) => [c.name, { value: "", isNull: false }])))}
            className="flex h-7 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-[12px] font-medium text-white hover:bg-emerald-500"
          >
            <HugeiconsIcon icon={Add01Icon} size={13} /> Insertar fila
          </button>
        )}
        {selected.size > 0 && canEditRows && (
          <button
            type="button"
            onClick={() => (armedDelete ? doDelete() : setArmedDelete(true))}
            onMouseLeave={() => setArmedDelete(false)}
            className={cn(
              "flex h-7 items-center gap-1 rounded-md px-2.5 text-[12px]",
              armedDelete ? "bg-red-600 text-white hover:bg-red-500" : "text-red-400 hover:bg-red-500/10",
            )}
          >
            <HugeiconsIcon icon={Delete02Icon} size={13} /> {armedDelete ? `¿Borrar ${selected.size}?` : `Borrar ${selected.size}`}
          </button>
        )}
        {notice && <span className="text-[11px] text-emerald-400">{notice}</span>}
      </div>

      {!canEditRows && editable && (
        <div className="shrink-0 border-b border-zinc-800 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
          Esta tabla no tiene clave primaria: puedes insertar filas, pero editar o borrar no es seguro (usa el editor SQL).
        </div>
      )}
      {!editable && (
        <div className="shrink-0 border-b border-zinc-800 bg-sky-500/10 px-3 py-1.5 text-[11px] text-sky-300">Es una vista: solo lectura.</div>
      )}
      {error && <pre className="shrink-0 whitespace-pre-wrap border-b border-zinc-800 bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-300">{error}</pre>}

      {/* Formulario de inserción */}
      {inserting && (
        <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-zinc-800 bg-[#121212] p-3">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-zinc-200">
            Nueva fila
            <span className="text-[11px] font-normal text-zinc-500">vacío = valor por defecto</span>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={doInsert} className="rounded-md bg-emerald-600 px-3 py-1 text-[12px] text-white hover:bg-emerald-500">
                Insertar
              </button>
              <button type="button" onClick={() => setInserting(null)} className="rounded-md px-3 py-1 text-[12px] text-zinc-400 hover:bg-zinc-800">
                Cancelar
              </button>
            </div>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
            {table.columns.map((c) => {
              const v = inserting[c.name];
              return (
                <label key={c.name} className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                    {c.pk && <HugeiconsIcon icon={Key01Icon} size={10} className="text-amber-400" />}
                    <span className="font-mono text-zinc-200">{c.name}</span>
                    <span className="truncate font-mono text-zinc-600">{c.type}</span>
                    {c.nullable && (
                      <button
                        type="button"
                        onClick={() => setInserting({ ...inserting, [c.name]: { ...v, isNull: !v.isNull } })}
                        className={cn("ml-auto rounded px-1 text-[10px]", v.isNull ? "bg-zinc-700 text-zinc-100" : "text-zinc-600 hover:text-zinc-300")}
                      >
                        NULL
                      </button>
                    )}
                  </span>
                  <input
                    value={v.isNull ? "" : v.value}
                    disabled={v.isNull}
                    onChange={(e) => setInserting({ ...inserting, [c.name]: { value: e.target.value, isNull: false } })}
                    placeholder={v.isNull ? "NULL" : c.default ?? (c.nullable ? "NULL" : "")}
                    spellCheck={false}
                    className="h-7 rounded border border-zinc-800 bg-[#0f0f0f] px-2 font-mono text-[12px] text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-emerald-500/60 disabled:opacity-50"
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-separate border-spacing-0 text-[12px]">
          <thead className="sticky top-0 z-10 bg-[#1a1a1a]">
            <tr>
              {canEditRows && (
                <th className="w-8 border-b border-r border-zinc-800 px-2">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((_, i) => i)) : new Set())}
                  />
                </th>
              )}
              {cols.map((name) => {
                const meta = table.columns.find((c) => c.name === name);
                const sorted = order?.col === name;
                return (
                  <th key={name} className="border-b border-r border-zinc-800 px-0 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => {
                        setPage(0);
                        setOrder(sorted ? { col: name, desc: !order!.desc } : { col: name, desc: false });
                      }}
                      className="flex w-full min-w-[120px] max-w-[320px] flex-col items-start px-2.5 py-1.5 hover:bg-zinc-800/60"
                    >
                      <span className="flex items-center gap-1 font-mono text-zinc-200">
                        {meta?.pk && <HugeiconsIcon icon={Key01Icon} size={10} className="text-amber-400" />}
                        {name}
                        {sorted && <span className="text-emerald-400">{order!.desc ? "↓" : "↑"}</span>}
                      </span>
                      <span className="truncate font-mono text-[10px] text-zinc-600">{meta?.type}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={cn("group", selected.has(ri) ? "bg-emerald-500/5" : "hover:bg-zinc-800/30")}>
                {canEditRows && (
                  <td className="border-b border-r border-zinc-800/70 px-2 text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(ri)}
                      onChange={(e) => {
                        const n = new Set(selected);
                        if (e.target.checked) n.add(ri);
                        else n.delete(ri);
                        setSelected(n);
                      }}
                    />
                  </td>
                )}
                {row.map((v, ci) =>
                  edit && edit.row === ri && edit.col === ci ? (
                    <td key={ci} className="border-b border-r border-emerald-500/60 bg-[#0f0f0f] p-0">
                      <div className="flex items-center">
                        <input
                          autoFocus
                          value={edit.isNull ? "" : edit.value}
                          placeholder={edit.isNull ? "NULL" : ""}
                          onChange={(e) => setEdit({ ...edit, value: e.target.value, isNull: false })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") {
                              e.stopPropagation();
                              setEdit(null);
                            }
                          }}
                          onBlur={() => setTimeout(() => setEdit((x) => (x === edit ? null : x)), 150)}
                          className="h-7 min-w-[160px] flex-1 bg-transparent px-2 font-mono text-[12px] text-zinc-100 outline-none placeholder:italic placeholder:text-zinc-600"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setEdit({ ...edit, isNull: true, value: "" })}
                          title="Poner NULL"
                          className="px-1.5 text-[10px] text-zinc-500 hover:text-zinc-200"
                        >
                          NULL
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={saveEdit}
                          className="px-1.5 text-[10px] text-emerald-400 hover:text-emerald-300"
                        >
                          Guardar
                        </button>
                      </div>
                    </td>
                  ) : (
                    <td
                      key={ci}
                      onDoubleClick={() => canEditRows && setEdit({ row: ri, col: ci, value: v ?? "", isNull: v === null })}
                      title={v ?? "NULL"}
                      className={cn(
                        "max-w-[320px] truncate border-b border-r border-zinc-800/70 px-2.5 py-1 font-mono",
                        v === null ? "italic text-zinc-600" : "text-zinc-300",
                        canEditRows && "cursor-text",
                      )}
                    >
                      {v === null ? "NULL" : v}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !error && <div className="p-8 text-center text-[12px] text-zinc-600">Sin filas.</div>}
      </div>

      {/* Pie: paginación */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-zinc-800 px-3 text-[11px] text-zinc-500">
        {canEditRows && <span>Doble clic en una celda para editarla</span>}
        <span className="ml-auto">
          {fmt(from)}–{fmt(to)} de {data?.exact === false ? "≈" : ""}
          {fmt(total)}
        </span>
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
          className="flex size-6 items-center justify-center rounded hover:bg-zinc-800 disabled:opacity-30"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={13} />
        </button>
        <button
          type="button"
          disabled={to >= total}
          onClick={() => setPage((p) => p + 1)}
          className="flex size-6 items-center justify-center rounded hover:bg-zinc-800 disabled:opacity-30"
        >
          <HugeiconsIcon icon={ArrowRight01Icon} size={13} />
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────── Estructura ─────────────────────────────

function Structure({ table }: { table: Table }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <table className="w-full max-w-4xl border-separate border-spacing-0 text-[12px]">
        <thead>
          <tr className="text-left text-[11px] text-zinc-500">
            {["Columna", "Tipo", "Nulo", "Por defecto"].map((h) => (
              <th key={h} className="border-b border-zinc-800 px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.columns.map((c) => (
            <tr key={c.name} className="hover:bg-zinc-800/30">
              <td className="border-b border-zinc-800/70 px-3 py-1.5 font-mono text-zinc-100">
                <span className="flex items-center gap-1.5">
                  {c.pk && <HugeiconsIcon icon={Key01Icon} size={11} className="text-amber-400" />}
                  {c.name}
                </span>
              </td>
              <td className="border-b border-zinc-800/70 px-3 py-1.5 font-mono text-sky-300">{c.type}</td>
              <td className="border-b border-zinc-800/70 px-3 py-1.5 text-zinc-400">{c.nullable ? "sí" : "no"}</td>
              <td className="border-b border-zinc-800/70 px-3 py-1.5 font-mono text-zinc-500">{c.default ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────── SQL ─────────────────────────────

function SqlEditor({ connId, onSchemaChange }: { connId: string; onSchemaChange: () => void }) {
  const [sql, setSql] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_SQL) ?? "{}")[connId] ?? "SELECT now();";
    } catch {
      return "SELECT now();";
    }
  });
  const [results, setResults] = useState<QRes[] | null>(null);
  const [tab, setTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [ms, setMs] = useState(0);
  const runRef = useRef<() => void>(() => {});
  const selRef = useRef("");

  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(LS_SQL) ?? "{}");
      all[connId] = sql;
      localStorage.setItem(LS_SQL, JSON.stringify(all));
    } catch {
      /* no-op */
    }
  }, [sql, connId]);

  const run = async () => {
    const text = (selRef.current.trim() || sql).trim();
    if (!text || running) return;
    setRunning(true);
    setError(null);
    const t0 = performance.now();
    try {
      const r = await invoke<QRes[]>("db_query", { id: connId, sql: text });
      setResults(r);
      setTab(Math.max(0, r.findIndex((x) => x.columns.length > 0)));
      // DDL → el esquema puede haber cambiado.
      if (/\b(create|alter|drop|rename|truncate)\b/i.test(text)) onSchemaChange();
    } catch (e) {
      setResults(null);
      setError(String(e));
    } finally {
      setMs(Math.round(performance.now() - t0));
      setRunning(false);
    }
  };
  runRef.current = run;

  const extensions = useMemo(
    () => [
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              runRef.current();
              return true;
            },
          },
        ]),
      ),
    ],
    [],
  );

  const cur = results?.[tab];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="h-[40%] min-h-[140px] shrink-0 overflow-hidden border-b border-zinc-800">
        <CodeMirror
          value={sql}
          onChange={setSql}
          theme={oneDark}
          height="100%"
          extensions={extensions}
          onUpdate={(u) => {
            const s = u.state.selection.main;
            selRef.current = s.empty ? "" : u.state.sliceDoc(s.from, s.to);
          }}
          className="h-full text-[13px]"
        />
      </div>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-800 px-3">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="flex h-7 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-[12px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          <HugeiconsIcon icon={PlayIcon} size={12} /> {running ? "Ejecutando…" : "Ejecutar"}
        </button>
        <span className="text-[11px] text-zinc-600">Ctrl+Enter · ejecuta la selección si hay</span>
        {results && results.length > 1 && (
          <div className="ml-3 flex gap-1">
            {results.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setTab(i)}
                className={cn("rounded px-2 py-0.5 text-[11px]", tab === i ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
        {(results || error) && <span className="ml-auto text-[11px] text-zinc-600">{ms} ms</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <pre className="whitespace-pre-wrap p-3 font-mono text-[12px] text-red-300">{error}</pre>
        ) : cur ? (
          cur.columns.length ? (
            <>
              <table className="border-separate border-spacing-0 text-[12px]">
                <thead className="sticky top-0 bg-[#1a1a1a]">
                  <tr>
                    {cur.columns.map((c, i) => (
                      <th key={i} className="border-b border-r border-zinc-800 px-2.5 py-1.5 text-left font-mono font-normal text-zinc-200">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cur.rows.map((r, ri) => (
                    <tr key={ri} className="hover:bg-zinc-800/30">
                      {r.map((v, ci) => (
                        <td
                          key={ci}
                          title={v ?? "NULL"}
                          className={cn("max-w-[360px] truncate border-b border-r border-zinc-800/70 px-2.5 py-1 font-mono", v === null ? "italic text-zinc-600" : "text-zinc-300")}
                        >
                          {v === null ? "NULL" : v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 text-[11px] text-zinc-600">
                {fmt(cur.rows.length)} fila(s){cur.truncated && " · mostrando las primeras 2.000"}
              </div>
            </>
          ) : (
            <div className="p-3 text-[12px] text-emerald-300">Hecho · {fmt(cur.affected)} fila(s) afectada(s)</div>
          )
        ) : (
          <div className="p-6 text-center text-[12px] text-zinc-600">Escribe SQL y pulsa Ctrl+Enter.</div>
        )}
      </div>
    </div>
  );
}
