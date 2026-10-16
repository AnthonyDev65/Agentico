import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import TaskBoard from "@/components/TaskBoard";
import { displayName, isTasksFile } from "@/lib/fileIcons";
import { parseTasks, type TaskLine } from "@/lib/tasks";
import { cn } from "@/lib/utils";

// Vista «Tareas» del panel derecho: muestra los `.tasks` de la raíz del proyecto o de
// `plan/` (donde los crea Agentico Plan) sin tener que abrirlos desde el árbol.

type Entry = { name: string; path: string; is_dir: boolean };
export type TasksFile = { name: string; path: string; rel: string; pending: number };


async function listTasks(dir: string, relDir: string): Promise<TasksFile[]> {
  try {
    const entries = await invoke<Entry[]>("fs_list", { path: dir });
    const files = entries.filter((e) => !e.is_dir && isTasksFile(e.name));
    return Promise.all(
      files.map(async (e) => {
        let pending = 0;
        try {
          const text = await invoke<string>("fs_read", { path: e.path });
          pending = parseTasks(text).filter((l): l is TaskLine => l.kind === "task" && l.status !== "done").length;
        } catch {
          /* ilegible: sin contador */
        }
        return { name: e.name, path: e.path, rel: relDir ? `${relDir}/${e.name}` : e.name, pending };
      }),
    );
  } catch {
    return []; // la carpeta no existe
  }
}

// Busca `.tasks` en la raíz y en `plan/` (re-sondea: el agente puede crearlos en cualquier momento).
export function useTasksFiles(projectPath: string, intervalMs = 4000) {
  const [files, setFiles] = useState<TasksFile[]>([]);
  useEffect(() => {
    let alive = true;
    const scan = async () => {
      // La ruta de plan/ se toma del listado (mismo formato que el árbol de archivos:
      // así coinciden las rutas, que el modo Auto usa como clave).
      let planDir: string | null = null;
      try {
        const entries = await invoke<Entry[]>("fs_list", { path: projectPath });
        planDir = entries.find((e) => e.is_dir && e.name === "plan")?.path ?? null;
      } catch {
        /* proyecto inaccesible */
      }
      const [root, plan] = await Promise.all([
        listTasks(projectPath, ""),
        planDir ? listTasks(planDir, "plan") : Promise.resolve([]),
      ]);
      // plan/ primero (el tablero del agente), luego la raíz
      const next = [...plan, ...root];
      if (alive)
        setFiles((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    scan();
    const id = setInterval(scan, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [projectPath, intervalMs]);
  return files;
}

export default function TasksPanel({ projectPath, files }: { projectPath: string; files: TasksFile[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const current = files.find((f) => f.path === selected) ?? files[0] ?? null;
  const [content, setContent] = useState<string | null>(null);
  const pendingWrite = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;

  // Carga + recarga desde disco cada 2 s (claude marca tareas), salvo escritura pendiente.
  useEffect(() => {
    if (!current) return;
    let alive = true;
    const load = async () => {
      if (pendingWrite.current) return;
      try {
        const text = await invoke<string>("fs_read", { path: current.path });
        if (alive && text !== contentRef.current) setContent(text);
      } catch {
        /* borrado/renombrado: lo resolverá el próximo escaneo */
      }
    };
    setContent(null);
    load();
    const id = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [current?.path]);

  const onChange = (text: string) => {
    if (!current) return;
    setContent(text);
    const path = current.path;
    if (pendingWrite.current) clearTimeout(pendingWrite.current);
    pendingWrite.current = setTimeout(async () => {
      await invoke("fs_write", { path, content: text }).catch(() => {});
      pendingWrite.current = null;
    }, 400);
  };

  if (!current) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-600">
        No hay listas de tareas en la raíz ni en plan/
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {files.length > 1 && (
        <div className="no-scrollbar flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-800 bg-[#121212] px-3">
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setSelected(f.path)}
              title={f.rel}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-[11px] transition-colors",
                f.path === current.path ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              {f.rel.startsWith("plan/") && <span className="text-zinc-600">plan/</span>}
              {displayName(f.name)}
              {f.pending > 0 && <span className="rounded bg-emerald-500/15 px-1 text-emerald-300">{f.pending}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {content === null ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-600">Cargando…</div>
        ) : (
          <TaskBoard
            key={current.path}
            content={content}
            onChange={onChange}
            projectPath={projectPath}
            filePath={current.path}
            relPath={current.rel}
          />
        )}
      </div>
    </div>
  );
}
