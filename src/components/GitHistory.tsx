import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Tick02Icon,
  GitBranchIcon,
  Search01Icon,
  Loading03Icon,
  Add01Icon,
  Delete02Icon,
  GitMergeIcon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { DiffView } from "@/components/GitDiff";
import { cn } from "@/lib/utils";

// Historial de commits (con detalle de archivos y diff) y gestión de ramas del panel Git.

export type Commit = {
  hash: string;
  short: string;
  parents: string[];
  author: string;
  email: string;
  date: string;
  subject: string;
  refs: string[];
};
type CFile = { path: string; old_path: string | null; status: string; additions: number; deletions: number };
type Branch = {
  name: string;
  short_hash: string;
  upstream: string;
  track: string;
  date: string;
  subject: string;
  current: boolean;
  remote: boolean;
};

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
export function relTime(iso: string) {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const s = (t - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [u, sec] of units) if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), u);
  return "ahora";
}

const STATUS_STYLE: Record<string, string> = {
  A: "text-emerald-400",
  M: "text-amber-400",
  D: "text-red-400",
  R: "text-sky-400",
  C: "text-sky-400",
};

function RefBadge({ r }: { r: string }) {
  const head = r.startsWith("HEAD -> ");
  const tag = r.startsWith("tag: ");
  const label = head ? r.slice(8) : tag ? r.slice(5) : r;
  const remote = !head && !tag && r.includes("/");
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1 text-[10px] leading-4",
        head
          ? "bg-indigo-500/20 text-indigo-300"
          : tag
            ? "bg-amber-500/15 text-amber-300"
            : remote
              ? "bg-zinc-700/50 text-zinc-400"
              : "bg-emerald-500/15 text-emerald-300",
      )}
    >
      {tag ? "🏷 " : ""}
      {label}
    </span>
  );
}

function CopyHash({ hash, short }: { hash: string; short: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await invoke("clipboard_write", { text: hash }).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      title="Copiar hash completo"
      className="flex items-center gap-1 rounded px-1 font-mono text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
    >
      <HugeiconsIcon icon={done ? Tick02Icon : Copy01Icon} size={11} />
      {short}
    </button>
  );
}

// ─────────────────────────── Historial ───────────────────────────

const PAGE = 100;

export function HistoryView({
  projectPath,
  refreshKey,
  focusHash,
  onNote,
  onChanged,
}: {
  projectPath: string;
  refreshKey: number;
  focusHash?: string | null;
  onNote: (t: string) => void;
  onChanged: () => void;
}) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [all, setAll] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(focusHash ?? null);
  const loadingRef = useRef(false);

  const load = async (reset: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const skip = reset ? 0 : commits.length;
      const page = await invoke<Commit[]>("git_log", { path: projectPath, skip, limit: PAGE, rev: null, all });
      setCommits((prev) => (reset ? page : [...prev, ...page]));
      setHasMore(page.length === PAGE);
      if (reset && !focusHash) setSelected((s) => s ?? page[0]?.hash ?? null);
    } catch (e) {
      onNote(String(e));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, refreshKey, all]);

  // Commit pedido desde «Ramas» que puede no estar en las páginas cargadas.
  const [extra, setExtra] = useState<Commit | null>(null);
  useEffect(() => {
    if (!focusHash) return;
    setSelected(focusHash);
    invoke<Commit[]>("git_log", { path: projectPath, skip: 0, limit: 1, rev: focusHash, all: false })
      .then((r) => setExtra(r[0] ?? null))
      .catch(() => setExtra(null));
  }, [focusHash, projectPath]);

  const q = query.trim().toLowerCase();
  const shown = q
    ? commits.filter(
        (c) =>
          c.subject.toLowerCase().includes(q) ||
          c.author.toLowerCase().includes(q) ||
          c.hash.startsWith(q) ||
          c.refs.some((r) => r.toLowerCase().includes(q)),
      )
    : commits;
  const current = commits.find((c) => c.hash === selected) ?? (extra?.hash === selected ? extra : null);
  // Seleccionar cualquier hash (p.ej. el padre), aunque no esté en las páginas cargadas.
  const selectHash = (h: string) => {
    setSelected(h);
    if (!commits.some((c) => c.hash === h))
      invoke<Commit[]>("git_log", { path: projectPath, skip: 0, limit: 1, rev: h, all: false })
        .then((r) => setExtra(r[0] ?? null))
        .catch(() => {});
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <div className="flex w-80 shrink-0 flex-col border-r border-zinc-800">
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 p-2">
          <div className="flex flex-1 items-center gap-1.5 rounded-md border border-zinc-800 bg-[#0d0d10] px-2">
            <HugeiconsIcon icon={Search01Icon} size={12} className="text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar mensaje, autor, hash…"
              className="h-7 flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
            />
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-zinc-400" title="Mostrar los commits de todas las ramas">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="accent-indigo-500" />
            Todas
          </label>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (!q && hasMore && el.scrollTop + el.clientHeight > el.scrollHeight - 200) load(false);
          }}
        >
          {shown.length === 0 && !loading && (
            <div className="p-4 text-center text-xs text-zinc-600">{commits.length ? "Sin resultados" : "Aún no hay commits"}</div>
          )}
          {shown.map((c, i) => {
            const merge = c.parents.length > 1;
            return (
              <button
                key={c.hash}
                type="button"
                onClick={() => setSelected(c.hash)}
                className={cn(
                  "group relative flex w-full gap-2.5 py-1.5 pl-3 pr-2 text-left",
                  selected === c.hash ? "bg-indigo-500/10" : "hover:bg-zinc-800/40",
                )}
              >
                {/* Línea de tiempo */}
                <span className="relative flex w-3 shrink-0 justify-center">
                  {i < shown.length - 1 && <span className="absolute top-3 h-[calc(100%+4px)] w-px bg-zinc-700" />}
                  <span
                    className={cn(
                      "relative mt-1 size-2.5 rounded-full border-2",
                      c.refs.some((r) => r.startsWith("HEAD"))
                        ? "border-indigo-400 bg-indigo-400"
                        : merge
                          ? "border-zinc-400 bg-[#121212]"
                          : "border-zinc-500 bg-zinc-500",
                    )}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className={cn("truncate text-xs", selected === c.hash ? "text-zinc-100" : "text-zinc-300")}>
                      {c.subject}
                    </span>
                  </span>
                  {c.refs.length > 0 && (
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {c.refs.map((r) => (
                        <RefBadge key={r} r={r} />
                      ))}
                    </span>
                  )}
                  <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
                    {c.author} · {relTime(c.date)} · <span className="font-mono">{c.short}</span>
                  </span>
                </span>
              </button>
            );
          })}
          {loading && (
            <div className="flex items-center justify-center gap-1.5 p-3 text-[11px] text-zinc-500">
              <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" /> Cargando…
            </div>
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1 bg-[#0d0d10]">
        {current ? (
          <CommitDetail
            key={current.hash}
            projectPath={projectPath}
            commit={current}
            onSelect={selectHash}
            onNote={onNote}
            onChanged={onChanged}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-600">Selecciona un commit</div>
        )}
      </div>
    </div>
  );
}

function CommitDetail({
  projectPath,
  commit,
  onSelect,
  onNote,
  onChanged,
}: {
  projectPath: string;
  commit: Commit;
  onSelect: (hash: string) => void;
  onNote: (t: string) => void;
  onChanged: () => void;
}) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<CFile[] | null>(null);
  const [file, setFile] = useState<CFile | null>(null);
  const [diff, setDiff] = useState("");
  const [branchName, setBranchName] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("git_commit_message", { path: projectPath, hash: commit.hash })
      .then(setMessage)
      .catch(() => setMessage(commit.subject));
    invoke<CFile[]>("git_commit_files", { path: projectPath, hash: commit.hash })
      .then((f) => {
        setFiles(f);
        setFile(f[0] ?? null);
      })
      .catch((e) => {
        setFiles([]);
        onNote(String(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit.hash]);

  useEffect(() => {
    if (!file) return setDiff("");
    invoke<string>("git_commit_diff", { path: projectPath, hash: commit.hash, file: file.path, oldPath: file.old_path })
      .then(setDiff)
      .catch((e) => setDiff(String(e)));
  }, [file, commit.hash, projectPath]);

  const [subject, ...rest] = (message || commit.subject).split("\n");
  const body = rest.join("\n").trim();
  const adds = files?.reduce((n, f) => n + Math.max(0, f.additions), 0) ?? 0;
  const dels = files?.reduce((n, f) => n + Math.max(0, f.deletions), 0) ?? 0;

  const createBranch = async () => {
    const name = branchName?.trim();
    if (!name) return;
    try {
      onNote(await invoke<string>("git_branch_create", { path: projectPath, name, start: commit.hash, checkout: false }));
      setBranchName(null);
      onChanged();
    } catch (e) {
      onNote(String(e));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-zinc-800 p-4">
        <div className="text-sm font-medium text-zinc-100">{subject}</div>
        {body && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap font-sans text-xs text-zinc-400">{body}</pre>}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="flex size-5 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-semibold uppercase text-indigo-300">
              {commit.author[0] ?? "?"}
            </span>
            <span className="text-zinc-300">{commit.author}</span>
            <span>&lt;{commit.email}&gt;</span>
          </span>
          <span title={new Date(commit.date).toLocaleString()}>{relTime(commit.date)}</span>
          <CopyHash hash={commit.hash} short={commit.short} />
          {commit.parents.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onSelect(p)}
              title="Ir al commit padre"
              className="flex items-center gap-0.5 font-mono hover:text-zinc-200"
            >
              padre <HugeiconsIcon icon={ArrowRight01Icon} size={10} /> {p.slice(0, 7)}
            </button>
          ))}
          {commit.refs.map((r) => (
            <RefBadge key={r} r={r} />
          ))}
          <span className="ml-auto">
            {branchName === null ? (
              <button
                type="button"
                onClick={() => setBranchName("")}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <HugeiconsIcon icon={GitBranchIcon} size={12} /> Crear rama aquí
              </button>
            ) : (
              <span className="flex items-center gap-1">
                <input
                  autoFocus
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value.replace(/\s/g, "-"))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createBranch();
                    if (e.key === "Escape") setBranchName(null);
                  }}
                  placeholder="nombre-de-rama"
                  className="h-6 w-36 rounded border border-zinc-700 bg-[#121212] px-1.5 font-mono text-[11px] text-zinc-200 outline-none focus:border-indigo-500"
                />
                <button type="button" onClick={createBranch} className="rounded bg-indigo-600 px-2 py-0.5 text-white">
                  Crear
                </button>
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="max-h-[40%] shrink-0 overflow-y-auto border-b border-zinc-800 py-1">
        <div className="px-4 pb-1 pt-1 text-[10px] uppercase tracking-wide text-zinc-600">
          {files === null ? "Cargando archivos…" : `${files.length} archivo${files.length === 1 ? "" : "s"}`}
          {files && files.length > 0 && (
            <>
              {" · "}
              <span className="text-emerald-500">+{adds}</span> <span className="text-red-500">−{dels}</span>
            </>
          )}
        </div>
        {files?.map((f) => (
          <button
            key={f.path}
            type="button"
            onClick={() => setFile(f)}
            className={cn(
              "flex w-full items-center gap-2 px-4 py-1 text-left text-xs",
              file?.path === f.path ? "bg-zinc-800/70 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800/40",
            )}
          >
            <span className={cn("w-3 shrink-0 font-mono font-semibold", STATUS_STYLE[f.status] ?? "text-zinc-400")}>{f.status}</span>
            <span className="min-w-0 flex-1 truncate">
              {f.old_path ? (
                <>
                  <span className="text-zinc-500">{f.old_path} → </span>
                  {f.path}
                </>
              ) : (
                f.path
              )}
            </span>
            {f.additions < 0 ? (
              <span className="text-[10px] text-zinc-500">binario</span>
            ) : (
              <span className="shrink-0 font-mono text-[10px]">
                <span className="text-emerald-500">+{f.additions}</span> <span className="text-red-500">−{f.deletions}</span>
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {file ? <DiffView diff={diff} path={file.path} /> : <div className="p-4 text-xs text-zinc-600">Sin cambios de archivos</div>}
      </div>
    </div>
  );
}

// ─────────────────────────── Ramas ───────────────────────────

function parseTrack(t: string) {
  if (t.includes("gone")) return { gone: true, ahead: 0, behind: 0 };
  return {
    gone: false,
    ahead: Number(/ahead (\d+)/.exec(t)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(t)?.[1] ?? 0),
  };
}

export function BranchesView({
  projectPath,
  refreshKey,
  onNote,
  onChanged,
  onOpenCommit,
}: {
  projectPath: string;
  refreshKey: number;
  onNote: (t: string) => void;
  onChanged: () => void;
  onOpenCommit: (hash: string) => void;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [checkoutNew, setCheckoutNew] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ name: string; force: boolean } | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);

  const load = async () => {
    try {
      const b = await invoke<Branch[]>("git_branches", { path: projectPath });
      setBranches(b);
      setSelected((s) => (s && b.some((x) => x.name === s) ? s : b.find((x) => x.current)?.name ?? b[0]?.name ?? null));
    } catch (e) {
      onNote(String(e));
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, refreshKey]);

  useEffect(() => {
    if (!selected) return setCommits([]);
    invoke<Commit[]>("git_log", { path: projectPath, skip: 0, limit: 60, rev: selected, all: false })
      .then(setCommits)
      .catch(() => setCommits([]));
  }, [selected, projectPath, refreshKey]);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    try {
      const r = await fn();
      if (r?.trim()) onNote(r.trim());
      onChanged();
      await load();
    } catch (e) {
      onNote(String(e));
    } finally {
      setBusy(null);
    }
  };

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    run("create", () => invoke<string>("git_branch_create", { path: projectPath, name, start: null, checkout: checkoutNew }));
    setNewName("");
  };

  const q = query.trim().toLowerCase();
  const filtered = branches.filter((b) => !q || b.name.toLowerCase().includes(q));
  const locals = filtered.filter((b) => !b.remote);
  const remotes = filtered.filter((b) => b.remote);
  const current = branches.find((b) => b.current);
  const sel = branches.find((b) => b.name === selected) ?? null;

  const Row = (b: Branch) => {
    const tr = parseTrack(b.track);
    const del = confirmDel?.name === b.name;
    return (
      <div
        key={(b.remote ? "r:" : "l:") + b.name}
        onClick={() => setSelected(b.name)}
        onDoubleClick={() => !b.current && run(b.name, () => invoke<string>("git_switch", { path: projectPath, name: b.name, remote: b.remote }))}
        className={cn(
          "group cursor-pointer px-3 py-1.5",
          selected === b.name ? "bg-indigo-500/10" : "hover:bg-zinc-800/40",
        )}
      >
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon
            icon={GitBranchIcon}
            size={12}
            className={b.current ? "text-indigo-400" : b.remote ? "text-zinc-600" : "text-zinc-500"}
          />
          <span className={cn("truncate text-xs", b.current ? "font-semibold text-zinc-100" : "text-zinc-300")}>{b.name}</span>
          {b.current && <span className="rounded bg-indigo-500/20 px-1 text-[10px] text-indigo-300">actual</span>}
          {tr.ahead > 0 && <span className="text-[10px] text-emerald-400">↑{tr.ahead}</span>}
          {tr.behind > 0 && <span className="text-[10px] text-amber-400">↓{tr.behind}</span>}
          {tr.gone && <span className="text-[10px] text-red-400" title="La rama remota ya no existe">remota borrada</span>}
          {busy === b.name && <HugeiconsIcon icon={Loading03Icon} size={11} className="animate-spin text-zinc-400" />}
          <span className="ml-auto hidden items-center gap-0.5 group-hover:flex">
            {!b.current && (
              <SmallBtn title="Cambiar a esta rama (doble clic)" onClick={() => run(b.name, () => invoke<string>("git_switch", { path: projectPath, name: b.name, remote: b.remote }))}>
                Cambiar
              </SmallBtn>
            )}
            {!b.current && current && (
              <SmallBtn
                title={`Fusionar ${b.name} en ${current.name}`}
                onClick={() => run(b.name, () => invoke<string>("git_merge", { path: projectPath, branch: b.name }))}
              >
                <HugeiconsIcon icon={GitMergeIcon} size={11} />
              </SmallBtn>
            )}
            {!b.current && !b.remote && (
              <SmallBtn title="Borrar rama" danger onClick={() => setConfirmDel({ name: b.name, force: false })}>
                <HugeiconsIcon icon={Delete02Icon} size={11} />
              </SmallBtn>
            )}
          </span>
        </div>
        <div className="mt-0.5 truncate pl-[18px] text-[10px] text-zinc-500">
          {relTime(b.date)} · {b.subject}
        </div>
        {del && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[18px] text-[11px]" onClick={(e) => e.stopPropagation()}>
            <span className="text-zinc-300">¿Borrar «{b.name}»?</span>
            <label className="flex items-center gap-1 text-zinc-500" title="Borrar aunque tenga commits sin fusionar (-D)">
              <input
                type="checkbox"
                checked={confirmDel!.force}
                onChange={(e) => setConfirmDel({ name: b.name, force: e.target.checked })}
                className="accent-red-500"
              />
              forzar
            </label>
            <button
              type="button"
              onClick={() => {
                const force = confirmDel!.force;
                setConfirmDel(null);
                run(b.name, () => invoke<string>("git_branch_delete", { path: projectPath, name: b.name, force }));
              }}
              className="rounded bg-red-600 px-2 py-0.5 text-white hover:bg-red-500"
            >
              Borrar
            </button>
            <button type="button" onClick={() => setConfirmDel(null)} className="rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800">
              Cancelar
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <div className="flex w-80 shrink-0 flex-col border-r border-zinc-800">
        <div className="flex shrink-0 flex-col gap-2 border-b border-zinc-800 p-2">
          <div className="flex gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value.replace(/\s/g, "-"))}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder={`Nueva rama desde ${current?.name ?? "HEAD"}`}
              className="h-7 min-w-0 flex-1 rounded-md border border-zinc-800 bg-[#0d0d10] px-2 font-mono text-xs text-zinc-200 outline-none placeholder:font-sans placeholder:text-zinc-600 focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={create}
              disabled={!newName.trim() || busy === "create"}
              className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 text-xs text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              <HugeiconsIcon icon={Add01Icon} size={12} /> Crear
            </button>
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
            <input type="checkbox" checked={checkoutNew} onChange={(e) => setCheckoutNew(e.target.checked)} className="accent-indigo-500" />
            Cambiar a la rama nueva
          </label>
          <div className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-[#0d0d10] px-2">
            <HugeiconsIcon icon={Search01Icon} size={12} className="text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar ramas…"
              className="h-7 flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          <GroupTitle>Locales · {locals.length}</GroupTitle>
          {locals.map(Row)}
          {remotes.length > 0 && <GroupTitle>Remotas · {remotes.length}</GroupTitle>}
          {remotes.map(Row)}
          {branches.length === 0 && <div className="p-4 text-center text-xs text-zinc-600">Sin ramas (haz el primer commit)</div>}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-[#0d0d10]">
        {sel ? (
          <>
            <div className="shrink-0 border-b border-zinc-800 p-4">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={GitBranchIcon} size={15} className="text-indigo-400" />
                <span className="font-mono text-sm text-zinc-100">{sel.name}</span>
                {sel.current && <span className="rounded bg-indigo-500/20 px-1.5 text-[10px] text-indigo-300">actual</span>}
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                {sel.upstream ? (
                  <>
                    sigue a <span className="font-mono text-zinc-400">{sel.upstream}</span> {sel.track && `· ${sel.track}`}
                  </>
                ) : sel.remote ? (
                  "rama remota"
                ) : (
                  "sin rama remota (haz push para publicarla)"
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {commits.map((c) => (
                <button
                  key={c.hash}
                  type="button"
                  onClick={() => onOpenCommit(c.hash)}
                  title="Ver en el historial"
                  className="flex w-full items-center gap-3 border-b border-zinc-900 px-4 py-1.5 text-left hover:bg-zinc-800/40"
                >
                  <span className="w-16 shrink-0 font-mono text-[11px] text-zinc-500">{c.short}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{c.subject}</span>
                  <span className="shrink-0 text-[10px] text-zinc-500">
                    {c.author} · {relTime(c.date)}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-600">Selecciona una rama</div>
        )}
      </div>
    </div>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">{children}</div>;
}

function SmallBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex h-5 items-center rounded px-1.5 text-[10px] transition-colors",
        danger ? "text-zinc-500 hover:bg-red-500/10 hover:text-red-400" : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100",
      )}
    >
      {children}
    </button>
  );
}

export function useGitRefresh() {
  const [key, setKey] = useState(0);
  return useMemo(() => ({ key, bump: () => setKey((k) => k + 1) }), [key]);
}
