import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Folder01Icon,
  FolderOpenIcon,
  ArrowRight01Icon,
  FileAddIcon,
  FolderAddIcon,
  Edit02Icon,
  Delete01Icon,
  Refresh01Icon,
  Flowchart01Icon,
  CheckListIcon,
  FolderSearchIcon,
  PaintBoardIcon,
} from "@hugeicons/core-free-icons";
import { tasksTemplate } from "@/lib/tasks";
import { normPath, onFsChange } from "@/lib/fsEvents";
import { designTemplate } from "@/lib/visualSystem";
import { displayName, fileIcon } from "@/lib/fileIcons";
import { cn } from "@/lib/utils";

type Entry = { name: string; path: string; is_dir: boolean };
type TNode = { path: string; name: string; isDir: boolean };

// Devuelve la carpeta padre PRESERVANDO el separador original (clave del tree).
export const parentOf = (p: string) => {
  const trimmed = p.replace(/[\\/]+$/, "");
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return i >= 0 ? trimmed.slice(0, i) : trimmed;
};
export const joinPath = (dir: string, name: string) => dir.replace(/[\\/]+$/, "") + "/" + name;

type Ctx = {
  versions: Record<string, number>;
  activePath: string | null;
  openDirs: Set<string>;
  selected: Set<string>;
  onOpenFile: (path: string, name: string) => void;
  toggleDir: (path: string) => void;
  openMenu: (e: React.MouseEvent, node: TNode) => void;
  onRowClick: (e: React.MouseEvent, node: TNode) => void;
  registerChildren: (dir: string, entries: Entry[]) => void;
};
const TreeContext = createContext<Ctx>(null as unknown as Ctx);

type Modal =
  | { type: "input"; title: string; value: string; placeholder: string; onOk: (v: string) => void }
  | { type: "confirm"; title: string; onOk: () => void }
  | null;

export default function FileTree({
  root,
  onOpenFile,
  activePath,
  refresh,
}: {
  root: string;
  onOpenFile: (path: string, name: string) => void;
  activePath: string | null;
  // Pedir refresco de una carpeta desde fuera (p.ej. tras crear archivos).
  refresh?: { dir: string; seq: number } | null;
}) {
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; node: TNode } | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [err, setErr] = useState<string | null>(null);
  const anchorRef = useRef<string | null>(null);
  const childrenRef = useRef<Record<string, Entry[]>>({});

  const bump = (dir: string) => setVersions((v) => ({ ...v, [dir]: (v[dir] ?? 0) + 1 }));
  useEffect(() => {
    if (refresh) bump(refresh.dir);
  }, [refresh?.seq]);
  // Archivos creados/borrados/renombrados fuera del árbol (agente, terminal…).
  useEffect(
    () =>
      onFsChange(root, (c) => {
        if (!c.structural) return;
        const changed = new Set(c.dirs.map(normPath));
        // Solo carpetas ya cargadas (las demás se leen al abrirlas); clave exacta del árbol.
        for (const dir of [root, ...Object.keys(childrenRef.current)]) {
          if (changed.has(normPath(dir))) bump(dir);
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [root],
  );
  const setOpen = (dir: string, open: boolean) =>
    setOpenDirs((s) => {
      const n = new Set(s);
      if (open) n.add(dir);
      else n.delete(dir);
      return n;
    });
  const toggleDir = (dir: string) => setOpenDirs((s) => {
    const n = new Set(s);
    if (n.has(dir)) n.delete(dir);
    else n.add(dir);
    return n;
  });

  // Registro de hijos por carpeta → permite calcular el orden plano visible
  // (DFS) para la selección por rango con Shift.
  const registerChildren = (dir: string, entries: Entry[]) => {
    childrenRef.current[dir] = entries;
  };
  const flatOrder = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of childrenRef.current[dir] ?? []) {
        out.push(e.path);
        if (e.is_dir && openDirs.has(e.path)) walk(e.path);
      }
    };
    walk(root);
    return out;
  };

  const onRowClick = (e: React.MouseEvent, node: TNode) => {
    const path = node.path;
    // Shift → selección por rango desde el ancla.
    if (e.shiftKey && anchorRef.current && anchorRef.current !== path) {
      const order = flatOrder();
      const a = order.indexOf(anchorRef.current);
      const b = order.indexOf(path);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelected(new Set(order.slice(lo, hi + 1)));
        return;
      }
      setSelected(new Set([path]));
      anchorRef.current = path;
      return;
    }
    // Ctrl/Cmd → alterna ese elemento.
    if (e.ctrlKey || e.metaKey) {
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(path)) n.delete(path);
        else n.add(path);
        return n;
      });
      anchorRef.current = path;
      return;
    }
    // Click normal → selección única + acción por defecto.
    setSelected(new Set([path]));
    anchorRef.current = path;
    if (node.isDir) toggleDir(path);
    else onOpenFile(path, node.name);
  };

  const run = async (fn: () => Promise<unknown>, affectedDir: string, expand = false) => {
    setErr(null);
    try {
      await fn();
      if (expand) setOpen(affectedDir, true);
      bump(affectedDir);
    } catch (e) {
      setErr(String(e));
    }
  };

  const newFile = (dir: string) =>
    setModal({
      type: "input",
      title: "Nuevo archivo",
      value: "",
      placeholder: "nombre.ext",
      onOk: (name) => {
        if (!name.trim()) return;
        run(() => invoke("fs_create_file", { path: joinPath(dir, name.trim()) }), dir, true);
      },
    });
  // Crea un .mmd vacío y lo abre: el editor visual ofrece elegir el tipo de diagrama.
  const newDiagram = (dir: string) =>
    setModal({
      type: "input",
      title: "Nuevo diagrama UML",
      value: "",
      placeholder: "nombre (p.ej. login)",
      onOk: (raw) => {
        const base = raw.trim().replace(/\.(mmd|mermaid)$/i, "");
        if (!base) return;
        const name = `${base}.mmd`;
        const path = joinPath(dir, name);
        run(async () => {
          await invoke("fs_create_file", { path });
          onOpenFile(path, name);
        }, dir, true);
      },
    });
  // Lista de tareas `.tasks` con plantilla (incluye la leyenda del formato para la IA).
  const newTasks = (dir: string) =>
    setModal({
      type: "input",
      title: "Nueva lista de tareas",
      value: "tareas",
      placeholder: "nombre",
      onOk: (raw) => {
        const base = raw.trim().replace(/[.]tasks$/i, "");
        if (!base) return;
        const name = `${base}.tasks`;
        const path = joinPath(dir, name);
        const projectName = root.split(/[\\/]/).filter(Boolean).pop() ?? "proyecto";
        run(async () => {
          await invoke("fs_create_file", { path });
          await invoke("fs_write", { path, content: tasksTemplate(projectName) });
          onOpenFile(path, name);
        }, dir, true);
      },
    });
  const newDesign = (dir: string) =>
    setModal({
      type: "input",
      title: "Nuevo Visual System",
      value: "visual-system",
      placeholder: "nombre",
      onOk: (raw) => {
        const base = raw.trim().replace(/[.]design$/i, "");
        if (!base) return;
        const name = `${base}.design`;
        const path = joinPath(dir, name);
        const projectName = root.split(/[\\/]/).filter(Boolean).pop() ?? "Proyecto";
        run(async () => {
          await invoke("fs_create_file", { path });
          await invoke("fs_write", { path, content: designTemplate(projectName) });
          onOpenFile(path, name);
        }, dir, true);
      },
    });
  const newFolder = (dir: string) =>
    setModal({
      type: "input",
      title: "Nueva carpeta",
      value: "",
      placeholder: "nombre",
      onOk: (name) => {
        if (!name.trim()) return;
        run(() => invoke("fs_create_dir", { path: joinPath(dir, name.trim()) }), dir, true);
      },
    });
  const rename = (node: TNode) =>
    setModal({
      type: "input",
      title: "Renombrar",
      value: node.isDir ? node.name : displayName(node.name),
      placeholder: "nuevo nombre",
      onOk: (name) => {
        let nn = name.trim();
        // Si la extensión está oculta (.tasks, .design) se conserva al renombrar.
        const hiddenExt = !node.isDir && displayName(node.name) !== node.name ? node.name.slice(displayName(node.name).length) : "";
        if (hiddenExt && nn && !nn.toLowerCase().endsWith(hiddenExt.toLowerCase())) nn += hiddenExt;
        if (!nn || nn === node.name) return;
        const dir = parentOf(node.path);
        run(() => invoke("fs_rename", { from: node.path, to: joinPath(dir, nn) }), dir);
      },
    });
  const del = (node: TNode) => {
    // Si el nodo forma parte de una multi-selección, borra todos los seleccionados.
    const targets =
      selected.has(node.path) && selected.size > 1 ? [...selected] : [node.path];
    setModal({
      type: "confirm",
      title:
        targets.length > 1
          ? `¿Eliminar ${targets.length} elementos?`
          : `¿Eliminar "${displayName(node.name)}"?${node.isDir ? " (y su contenido)" : ""}`,
      onOk: async () => {
        setErr(null);
        const dirs = new Set<string>();
        for (const p of targets) {
          try {
            await invoke("fs_delete", { path: p });
            dirs.add(parentOf(p));
          } catch (e) {
            setErr(String(e));
          }
        }
        dirs.forEach((d) => bump(d));
        setSelected(new Set());
      },
    });
  };

  const ctx: Ctx = {
    versions,
    activePath,
    openDirs,
    selected,
    onOpenFile,
    toggleDir,
    openMenu: (e, node) => {
      e.preventDefault();
      e.stopPropagation();
      // Clic derecho sobre algo no seleccionado → selección única de ese nodo.
      if (node.name && !selected.has(node.path)) {
        setSelected(new Set([node.path]));
        anchorRef.current = node.path;
      }
      setMenu({ x: e.clientX, y: e.clientY, node });
    },
    onRowClick,
    registerChildren,
  };

  // Cierra el menú al hacer click fuera.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const menuTargetDir = menu ? (menu.node.isDir ? menu.node.path : parentOf(menu.node.path)) : "";

  return (
    <TreeContext.Provider value={ctx}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-zinc-800 px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Explorador
          <div className="ml-auto flex items-center gap-0.5">
            <HeaderBtn title="Nuevo archivo" onClick={() => newFile(root)} icon={FileAddIcon} />
            <HeaderBtn title="Nueva carpeta" onClick={() => newFolder(root)} icon={FolderAddIcon} />
            <HeaderBtn title="Nuevo diagrama UML" onClick={() => newDiagram(root)} icon={Flowchart01Icon} />
            <HeaderBtn title="Nueva lista de tareas" onClick={() => newTasks(root)} icon={CheckListIcon} />
            <HeaderBtn title="Refrescar" onClick={() => bump(root)} icon={Refresh01Icon} />
          </div>
        </div>

        {err && (
          <div className="shrink-0 whitespace-pre-wrap bg-red-950/40 px-2 py-1 text-[10px] text-red-300">
            {err}
          </div>
        )}

        <div
          className="min-h-0 flex-1 overflow-auto py-1 text-[13px]"
          onContextMenu={(e) => ctx.openMenu(e, { path: root, name: "", isDir: true })}
        >
          <DirChildren path={root} depth={0} />
        </div>
      </div>

      {menu &&
        createPortal(
          <div
            style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 60 }}
            className="min-w-[160px] rounded-md border border-zinc-800 bg-[#1a1a1a] p-1 text-xs shadow-xl shadow-black/50"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <MenuItem icon={FileAddIcon} label="Nuevo archivo" onClick={() => { newFile(menuTargetDir); setMenu(null); }} />
            <MenuItem icon={FolderAddIcon} label="Nueva carpeta" onClick={() => { newFolder(menuTargetDir); setMenu(null); }} />
            <MenuItem icon={Flowchart01Icon} label="Nuevo diagrama UML" onClick={() => { newDiagram(menuTargetDir); setMenu(null); }} />
            <MenuItem icon={CheckListIcon} label="Nueva lista de tareas" onClick={() => { newTasks(menuTargetDir); setMenu(null); }} />
            <MenuItem icon={PaintBoardIcon} label="Nuevo Visual System" onClick={() => { newDesign(menuTargetDir); setMenu(null); }} />
            <div className="my-1 h-px bg-zinc-800" />
            <MenuItem
              icon={FolderSearchIcon}
              label={menu.node.isDir ? "Abrir en el Explorador" : "Mostrar en el Explorador"}
              onClick={() => {
                const target = menu.node.path;
                setMenu(null);
                invoke("reveal_in_explorer", { path: target }).catch((e) => setErr(String(e)));
              }}
            />
            {menu.node.name && (
              <>
                <div className="my-1 h-px bg-zinc-800" />
                <MenuItem icon={Edit02Icon} label="Renombrar" onClick={() => { rename(menu.node); setMenu(null); }} />
                <MenuItem icon={Delete01Icon} label="Eliminar" danger onClick={() => { del(menu.node); setMenu(null); }} />
              </>
            )}
          </div>,
          document.body,
        )}

      {modal && <ModalView modal={modal} onClose={() => setModal(null)} />}
    </TreeContext.Provider>
  );
}

function DirChildren({ path, depth }: { path: string; depth: number }) {
  const ctx = useContext(TreeContext);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const version = ctx.versions[path] ?? 0;

  useEffect(() => {
    invoke<Entry[]>("fs_list", { path })
      .then((es) => {
        setEntries(es);
        ctx.registerChildren(path, es);
      })
      .catch(() => {
        setEntries([]);
        ctx.registerChildren(path, []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version]);

  if (entries === null)
    return (
      <div style={{ paddingLeft: 8 + depth * 12 }} className="px-2 py-0.5 text-xs text-zinc-600">
        cargando…
      </div>
    );

  return (
    <>
      {entries.map((e) =>
        e.is_dir ? (
          <DirNode key={e.path} entry={e} depth={depth} />
        ) : (
          <FileNode key={e.path} entry={e} depth={depth} />
        ),
      )}
    </>
  );
}

function DirNode({ entry, depth }: { entry: Entry; depth: number }) {
  const ctx = useContext(TreeContext);
  const open = ctx.openDirs.has(entry.path);
  // Mantiene el contenido montado durante la animación de cierre.
  const [render, setRender] = useState(open);
  useEffect(() => {
    if (open) {
      setRender(true);
      return;
    }
    const t = setTimeout(() => setRender(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <>
      <Row
        depth={depth}
        selected={ctx.selected.has(entry.path)}
        onClick={(e) => ctx.onRowClick(e, { path: entry.path, name: entry.name, isDir: true })}
        onContextMenu={(e) => ctx.openMenu(e, { path: entry.path, name: entry.name, isDir: true })}
      >
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={12}
          className={cn(
            "shrink-0 text-zinc-500 transition-transform duration-200",
            open && "rotate-90",
          )}
        />
        <HugeiconsIcon
          icon={open ? FolderOpenIcon : Folder01Icon}
          size={14}
          className="shrink-0 text-amber-400/80"
        />
        <span className="truncate">{entry.name}</span>
      </Row>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div
          className={cn(
            "min-h-0 overflow-hidden transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0",
          )}
        >
          {render && <DirChildren path={entry.path} depth={depth + 1} />}
        </div>
      </div>
    </>
  );
}

function FileNode({ entry, depth }: { entry: Entry; depth: number }) {
  const ctx = useContext(TreeContext);
  const active = ctx.activePath === entry.path;
  const { icon, color } = fileIcon(entry.name);
  return (
    <Row
      depth={depth}
      active={active}
      selected={ctx.selected.has(entry.path)}
      onClick={(e) => ctx.onRowClick(e, { path: entry.path, name: entry.name, isDir: false })}
      onContextMenu={(e) => ctx.openMenu(e, { path: entry.path, name: entry.name, isDir: false })}
    >
      <span className="w-3 shrink-0" />
      <HugeiconsIcon icon={icon} size={14} className={cn("shrink-0", color)} />
      <span className="truncate" title={entry.name}>
        {displayName(entry.name)}
      </span>
    </Row>
  );
}

function Row({
  depth,
  onClick,
  onContextMenu,
  active,
  selected,
  children,
}: {
  depth: number;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  active?: boolean;
  selected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseDown={(e) => {
        // Evita la selección de texto al hacer Shift/Ctrl+clic.
        if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault();
      }}
      style={{ paddingLeft: 8 + depth * 12 }}
      className={cn(
        "flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-zinc-300 hover:bg-zinc-800/60",
        selected && "bg-indigo-500/15 text-zinc-100",
        active && "bg-indigo-600/20 text-zinc-100",
      )}
    >
      {children}
    </button>
  );
}

function HeaderBtn({
  title,
  onClick,
  icon,
}: {
  title: string;
  onClick: () => void;
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex size-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
    >
      <HugeiconsIcon icon={icon} size={13} />
    </button>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-zinc-800",
        danger ? "text-red-300 hover:text-red-200" : "text-zinc-200",
      )}
    >
      <HugeiconsIcon icon={icon} size={13} />
      {label}
    </button>
  );
}

function ModalView({ modal, onClose }: { modal: Exclude<Modal, null>; onClose: () => void }) {
  const [value, setValue] = useState(modal.type === "input" ? modal.value : "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const confirm = () => {
    if (modal.type === "input") modal.onOk(value);
    else modal.onOk();
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="w-80 rounded-xl border border-zinc-800 bg-[#161616] p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-sm font-medium text-zinc-100">{modal.title}</div>
        {modal.type === "input" && (
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirm();
              if (e.key === "Escape") onClose();
            }}
            placeholder={modal.placeholder}
            spellCheck={false}
            className="mb-3 w-full rounded-md border border-zinc-800 bg-[#1a1a1a] px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500/60"
          />
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium text-white",
              modal.type === "confirm" ? "bg-red-600 hover:bg-red-500" : "bg-indigo-600 hover:bg-indigo-500",
            )}
          >
            {modal.type === "confirm" ? "Eliminar" : "Aceptar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
