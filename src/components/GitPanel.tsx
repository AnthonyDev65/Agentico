import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  GitBranchIcon,
  GitCommitIcon,
  Refresh01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Add01Icon,
  MinusSignIcon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import type { Project } from "@/components/Workspace";
import { cn } from "@/lib/utils";

type GitFile = { path: string; x: string; y: string };
type GitStatus = {
  is_repo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
};

export default function GitPanel({ project }: { project: Project }) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [selected, setSelected] = useState<{ path: string; staged: boolean } | null>(null);
  const [diff, setDiff] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<{ file: string; untracked: boolean } | "all" | null>(null);

  const refresh = async () => {
    try {
      setStatus(await invoke<GitStatus>("git_status", { path: project.path }));
    } catch {
      /* no-op */
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  const openDiff = async (file: GitFile, staged: boolean) => {
    setSelected({ path: file.path, staged });
    if (file.x === "?" && file.y === "?") {
      setDiff("");
      return;
    }
    try {
      setDiff(await invoke<string>("git_diff", { path: project.path, file: file.path, staged }));
    } catch (e) {
      setDiff(String(e));
    }
  };

  const action = async (fn: () => Promise<string>, after?: () => void) => {
    setLoading(true);
    setNote(null);
    try {
      const r = await fn();
      if (r.trim()) setNote(r.trim());
      after?.();
    } catch (e) {
      setNote(String(e));
    } finally {
      setLoading(false);
      refresh();
    }
  };

  const commit = () => {
    if (!message.trim()) return;
    action(
      () => invoke<string>("git_commit", { path: project.path, message }),
      () => setMessage(""),
    );
  };

  const clearSelIf = (file: string) => {
    if (selected?.path === file) {
      setSelected(null);
      setDiff("");
    }
  };

  const doDiscard = () => {
    if (!confirm) return;
    if (confirm === "all") {
      action(() => invoke<string>("git_discard_all", { path: project.path }), () => {
        setSelected(null);
        setDiff("");
      });
    } else {
      const { file, untracked } = confirm;
      action(
        () => invoke<string>("git_discard", { path: project.path, file, untracked }),
        () => clearSelIf(file),
      );
    }
    setConfirm(null);
  };

  if (status && !status.is_repo) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-zinc-600">
        Este proyecto no es un repositorio git.
      </div>
    );
  }

  const files = status?.files ?? [];
  const staged = files.filter((f) => f.x !== " " && f.x !== "?");
  const changes = files.filter((f) => f.y !== " ");

  return (
    <div className="flex h-full min-h-0">
      {/* Izquierda: cambios + commit */}
      <div className="flex w-80 shrink-0 flex-col border-r border-zinc-800">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 px-3 text-xs text-zinc-400">
          <HugeiconsIcon icon={GitBranchIcon} size={14} />
          <span className="truncate font-medium text-zinc-200">{status?.branch ?? "—"}</span>
          {status && (status.ahead > 0 || status.behind > 0) && (
            <span className="text-[10px] text-zinc-500">
              ↑{status.ahead} ↓{status.behind}
            </span>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            <IconBtn
              title="Pull"
              onClick={() => action(() => invoke<string>("git_pull", { path: project.path }))}
            >
              <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
            </IconBtn>
            <IconBtn
              title="Push"
              onClick={() => action(() => invoke<string>("git_push", { path: project.path }))}
            >
              <HugeiconsIcon icon={ArrowUp01Icon} size={14} />
            </IconBtn>
            <IconBtn title="Refrescar" onClick={refresh}>
              <HugeiconsIcon icon={Refresh01Icon} size={14} />
            </IconBtn>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section
            title="Staged"
            count={staged.length}
            allIcon={MinusSignIcon}
            allTitle="Quitar todo del stage"
            onAll={() =>
              action(() => invoke<string>("git_unstage_all", { path: project.path }))
            }
          >
            {staged.map((f) => (
              <FileRow
                key={"s" + f.path}
                file={f}
                statusChar={f.x}
                active={selected?.path === f.path && selected.staged}
                onClick={() => openDiff(f, true)}
                actionIcon={MinusSignIcon}
                actionTitle="Unstage"
                onAction={() =>
                  action(() => invoke<string>("git_unstage", { path: project.path, file: f.path }))
                }
              />
            ))}
          </Section>

          <Section
            title="Cambios"
            count={changes.length}
            allIcon={Add01Icon}
            allTitle="Añadir todo al stage"
            onAll={() => action(() => invoke<string>("git_stage_all", { path: project.path }))}
            extra={
              <button
                type="button"
                onClick={() => setConfirm("all")}
                title="Descartar todos los cambios"
                className="text-zinc-500 hover:text-red-400"
              >
                <HugeiconsIcon icon={Delete02Icon} size={12} />
              </button>
            }
          >
            {changes.map((f) => (
              <FileRow
                key={"c" + f.path}
                file={f}
                statusChar={f.x === "?" ? "?" : f.y}
                active={selected?.path === f.path && !selected.staged}
                onClick={() => openDiff(f, false)}
                actionIcon={Add01Icon}
                actionTitle="Mantener (stage)"
                onAction={() =>
                  action(() => invoke<string>("git_stage", { path: project.path, file: f.path }))
                }
                onDiscard={() => setConfirm({ file: f.path, untracked: f.x === "?" })}
              />
            ))}
          </Section>
        </div>

        <div className="shrink-0 border-t border-zinc-800 p-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Mensaje del commit…"
            rows={2}
            className="w-full resize-none rounded-md border border-zinc-800 bg-[#1a1a1a] p-2 text-xs text-zinc-100 outline-none focus:border-indigo-500/60"
          />
          <button
            type="button"
            onClick={commit}
            disabled={!message.trim() || loading}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            <HugeiconsIcon icon={GitCommitIcon} size={14} /> Commit ({staged.length})
          </button>
          {note && (
            <div className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-zinc-900 p-2 text-[10px] text-zinc-400">
              {note}
            </div>
          )}
        </div>
      </div>

      {/* Derecha: diff */}
      <div className="min-w-0 flex-1 overflow-auto bg-[#0d0d10]">
        {selected ? (
          <DiffView diff={diff} path={selected.path} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-600">
            Selecciona un archivo para ver el diff
          </div>
        )}
      </div>

      {confirm &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
            onMouseDown={() => setConfirm(null)}
          >
            <div
              className="w-[360px] rounded-xl border border-zinc-800 bg-[#161616] p-4 shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="mb-1 text-sm font-medium text-zinc-100">
                {confirm === "all" ? "¿Descartar todos los cambios?" : "¿Descartar cambios?"}
              </div>
              <p className="mb-3 text-xs text-zinc-500">
                {confirm === "all"
                  ? "Vuelve el proyecto al último commit y elimina los archivos nuevos. No se puede deshacer."
                  : `Se revertirá "${confirm.file}" al último commit${
                      confirm.untracked ? " (archivo nuevo: se eliminará)" : ""
                    }. No se puede deshacer.`}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={doDiscard}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                >
                  Descartar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function IconBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex size-6 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
    >
      {children}
    </button>
  );
}

function Section({
  title,
  count,
  onAll,
  allIcon,
  allTitle,
  extra,
  children,
}: {
  title: string;
  count: number;
  onAll: () => void;
  allIcon: IconSvgElement;
  allTitle: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="group flex items-center gap-2 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {title}
        <span className="text-zinc-600">{count}</span>
        {count > 0 && (
          <div className="ml-auto flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            {extra}
            <button
              type="button"
              onClick={onAll}
              title={allTitle}
              className="text-zinc-500 hover:text-zinc-200"
            >
              <HugeiconsIcon icon={allIcon} size={12} />
            </button>
          </div>
        )}
      </div>
      {count === 0 ? <div className="px-3 py-0.5 text-[11px] text-zinc-700">—</div> : children}
    </div>
  );
}

function FileRow({
  file,
  statusChar,
  active,
  onClick,
  onAction,
  actionIcon,
  actionTitle,
  onDiscard,
}: {
  file: GitFile;
  statusChar: string;
  active: boolean;
  onClick: () => void;
  onAction: () => void;
  actionIcon: IconSvgElement;
  actionTitle: string;
  onDiscard?: () => void;
}) {
  const name = file.path.split("/").pop();
  const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex cursor-pointer items-center gap-1.5 px-3 py-[3px] text-[13px]",
        active ? "bg-indigo-600/20 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800/60",
      )}
    >
      <span className="truncate">{name}</span>
      {dir && <span className="truncate text-[10px] text-zinc-600">{dir}</span>}
      <span className="ml-auto flex items-center gap-1.5">
        {onDiscard && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
            title="Descartar cambios"
            className="text-zinc-400 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
          >
            <HugeiconsIcon icon={Delete02Icon} size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
          title={actionTitle}
          className="text-zinc-400 opacity-0 transition-opacity hover:text-zinc-100 group-hover:opacity-100"
        >
          <HugeiconsIcon icon={actionIcon} size={13} />
        </button>
        <StatusBadge c={statusChar} />
      </span>
    </div>
  );
}

function StatusBadge({ c }: { c: string }) {
  const color =
    c === "M"
      ? "text-amber-400"
      : c === "A"
        ? "text-emerald-400"
        : c === "D"
          ? "text-red-400"
          : c === "?"
            ? "text-emerald-500"
            : c === "R"
              ? "text-blue-400"
              : c === "U"
                ? "text-red-400"
                : "text-zinc-500";
  return <span className={cn("w-3 text-center text-[11px] font-bold", color)}>{c === "?" ? "U" : c}</span>;
}

function DiffView({ diff, path }: { diff: string; path: string }) {
  if (!diff.trim()) {
    return (
      <div className="p-4 text-sm text-zinc-500">
        Archivo nuevo sin seguimiento (o sin cambios que mostrar).
        <div className="mt-1 text-xs text-zinc-600">{path}</div>
      </div>
    );
  }
  return (
    <pre className="min-w-full p-3 font-mono text-[12px] leading-[1.5]">
      {diff.split("\n").map((ln, i) => {
        const cls =
          ln.startsWith("+") && !ln.startsWith("+++")
            ? "text-emerald-400 bg-emerald-500/5"
            : ln.startsWith("-") && !ln.startsWith("---")
              ? "text-red-400 bg-red-500/5"
              : ln.startsWith("@@")
                ? "text-cyan-400"
                : ln.startsWith("diff ") ||
                    ln.startsWith("index ") ||
                    ln.startsWith("+++") ||
                    ln.startsWith("---")
                  ? "text-zinc-500"
                  : "text-zinc-300";
        return (
          <div key={i} className={cn("whitespace-pre-wrap break-all px-1", cls)}>
            {ln || " "}
          </div>
        );
      })}
    </pre>
  );
}
