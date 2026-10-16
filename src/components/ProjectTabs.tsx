import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Cancel01Icon,
  MinusSignIcon,
  SquareIcon,
  GlobalIcon,
  InternetIcon,
  FlashIcon,
  DatabaseIcon,
  CpuIcon,
  Settings01Icon,
  FolderAddIcon,
  FolderOpenIcon,
  GitBranchIcon,
  SmartPhone01Icon,
} from "@hugeicons/core-free-icons";
import { ClaudeLogo } from "@/components/ClaudeLogo";
import { cn } from "@/lib/utils";
import type { Project } from "@/components/Workspace";

const appWindow = getCurrentWindow();

export default function ProjectTabs({
  projects,
  active,
  icons,
  onSelect,
  onClose,
  onNewProject,
  onImportFolder,
  onCloneRepo,
  onLogoClick,
  onOpenPorts,
  onOpenDomains,
  onOpenApi,
  onOpenDb,
  onOpenRemote,
  onOpenDoctor,
  onOpenSettings,
  onReorder,
}: {
  projects: Project[];
  active: string | null;
  icons: Record<string, string | null>;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onNewProject: () => void;
  onImportFolder: () => void;
  onCloneRepo: () => void;
  onLogoClick: () => void;
  onOpenPorts: () => void;
  onOpenDomains: () => void;
  onOpenApi: () => void;
  onOpenDb: () => void;
  onOpenRemote: () => void;
  onOpenDoctor: () => void;
  onOpenSettings: () => void;
  onReorder: (fromPath: string, toPath: string) => void;
}) {
  const [logoMenu, setLogoMenu] = useState<{ x: number; y: number } | null>(null);
  const [addMenu, setAddMenu] = useState<{ left: number; top: number } | null>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!addMenu) return;
    const close = (e: MouseEvent) => {
      if (addBtnRef.current?.contains(e.target as Node)) return; // el botón hace toggle
      setAddMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAddMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    window.addEventListener("blur", () => setAddMenu(null), { once: true });
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [addMenu]);

  const toggleAddMenu = () => {
    if (addMenu) return setAddMenu(null);
    const r = addBtnRef.current?.getBoundingClientRect();
    if (r) setAddMenu({ left: Math.min(r.left, window.innerWidth - 268), top: r.bottom + 4 });
  };
  const pick = (fn: () => void) => () => {
    setAddMenu(null);
    fn();
  };
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  useEffect(() => {
    if (!logoMenu) return;
    const close = () => setLogoMenu(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [logoMenu]);

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-zinc-800 bg-[#121212]">
      {/* Logo de Claude en la esquina → menú principal */}
      <button
        type="button"
        // Clic (o clic derecho) → menú con todas las opciones, bajo el logo. El mousedown
        // no llega a la ventana: así un segundo clic en el logo cierra el menú.
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setLogoMenu((m) => (m ? null : { x: r.left + 4, y: r.bottom + 4 }));
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          setLogoMenu({ x: r.left + 4, y: r.bottom + 4 });
        }}
        title="Menú"
        className="flex shrink-0 items-center px-3 transition-colors hover:bg-zinc-800"
      >
        <ClaudeLogo className="size-4" />
      </button>

      {logoMenu &&
        createPortal(
          <div
            style={{ position: "fixed", left: logoMenu.x, top: logoMenu.y }}
            className="z-[60] min-w-[190px] rounded-md border border-zinc-800 bg-[#1a1a1a] p-1 text-xs shadow-xl shadow-black/50"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setLogoMenu(null);
                onLogoClick();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
            >
              <ClaudeLogo className="size-3.5" /> Menú principal
            </button>
            <button
              type="button"
              onClick={() => {
                setLogoMenu(null);
                onOpenPorts();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
            >
              <HugeiconsIcon icon={GlobalIcon} size={14} className="text-zinc-400" /> Gestor de puertos
            </button>
            <button
              type="button"
              onClick={() => {
                setLogoMenu(null);
                onOpenApi();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
            >
              <HugeiconsIcon icon={FlashIcon} size={14} className="text-zinc-400" /> Cliente API
            </button>
            <button
              type="button"
              onClick={() => {
                setLogoMenu(null);
                onOpenDb();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
            >
              <HugeiconsIcon icon={DatabaseIcon} size={14} className="text-zinc-400" /> Base de datos
            </button>
            <button
              type="button"
              onClick={() => {
                setLogoMenu(null);
                onOpenRemote();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
            >
              <HugeiconsIcon icon={SmartPhone01Icon} size={14} className="text-zinc-400" /> Control remoto
            </button>
            <button
              type="button"
              onClick={() => {
                setLogoMenu(null);
                onOpenDoctor();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
            >
              <HugeiconsIcon icon={CpuIcon} size={14} className="text-zinc-400" /> Requisitos del sistema
            </button>
            <button
              type="button"
              onClick={() => {
                setLogoMenu(null);
                onOpenSettings();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
            >
              <HugeiconsIcon icon={Settings01Icon} size={14} className="text-zinc-400" /> Configuración
            </button>
          </div>,
          document.body,
        )}

      {/* Pestañas + botón de nuevo proyecto */}
      <div className="flex min-w-0 flex-1 items-stretch">
        <div className="no-scrollbar flex items-stretch overflow-x-auto">
          {projects.map((p) => {
            const isActive = p.path === active;
            const icon = icons[p.path];
            return (
              <div
                key={p.path}
                draggable
                onClick={() => onSelect(p.path)}
                onDragStart={(e) => {
                  setDragPath(p.path);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverPath !== p.path) setDragOverPath(p.path);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragPath) onReorder(dragPath, p.path);
                  setDragPath(null);
                  setDragOverPath(null);
                }}
                onDragEnd={() => {
                  setDragPath(null);
                  setDragOverPath(null);
                }}
                title={p.path}
                className={cn(
                  "group flex min-w-[120px] max-w-[180px] cursor-pointer items-center gap-2 border-r border-zinc-800 px-3 text-xs",
                  isActive
                    ? "bg-[#1e1e1e] text-zinc-100"
                    : "text-zinc-400 hover:bg-[#191919]",
                  dragPath === p.path && "opacity-40",
                  dragOverPath === p.path && dragPath !== p.path && "border-l-2 border-l-indigo-500",
                )}
              >
                {icon ? (
                  <img src={icon} alt="" className="size-4 shrink-0 rounded-[3px]" />
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <span className="flex-1 truncate">{p.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(p.path);
                  }}
                  aria-label="Cerrar proyecto"
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded transition-colors hover:bg-zinc-700",
                    isActive ? "opacity-70" : "opacity-0 group-hover:opacity-70",
                  )}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={12} />
                </button>
              </div>
            );
          })}

          {/* Nuevo / importar proyecto */}
          <button
            ref={addBtnRef}
            type="button"
            onClick={toggleAddMenu}
            aria-label="Nuevo o importar proyecto"
            aria-expanded={!!addMenu}
            title="Nuevo o importar proyecto"
            className={cn(
              "flex w-9 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100",
              addMenu && "bg-zinc-800 text-zinc-100",
            )}
          >
            <HugeiconsIcon
              icon={Add01Icon}
              size={16}
              className={cn("transition-transform duration-150", addMenu && "rotate-45")}
            />
          </button>
          {addMenu &&
            createPortal(
              <div
                style={{ position: "fixed", left: addMenu.left, top: addMenu.top }}
                className="z-[60] w-64 rounded-lg border border-zinc-800 bg-[#1a1a1a] p-1 text-xs shadow-xl shadow-black/50"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <AddMenuItem
                  icon={FolderAddIcon}
                  color="text-indigo-400"
                  label="Nuevo proyecto"
                  hint="Vite, Next, Astro… con librerías"
                  onClick={pick(onNewProject)}
                />
                <div className="mx-2 my-1 h-px bg-zinc-800" />
                <div className="px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-zinc-600">
                  Importar proyecto
                </div>
                <AddMenuItem
                  icon={FolderOpenIcon}
                  color="text-amber-400"
                  label="Abrir carpeta existente"
                  hint="Un proyecto que ya está en tu equipo"
                  onClick={pick(onImportFolder)}
                />
                <AddMenuItem
                  icon={GitBranchIcon}
                  color="text-emerald-400"
                  label="Clonar repositorio"
                  hint="Desde GitHub, GitLab… (git clone)"
                  onClick={pick(onCloneRepo)}
                />
              </div>,
              document.body,
            )}
        </div>

        {/* Zona arrastrable que rellena el espacio */}
        <div data-tauri-drag-region className="min-w-[40px] flex-1" />
      </div>

      {/* Administrador de dominios + controles de ventana */}
      <div className="flex shrink-0 items-stretch">
        <button
          onClick={onOpenDomains}
          title="Administrador de dominios"
          className="flex w-11 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-indigo-300"
          aria-label="Administrador de dominios"
        >
          <HugeiconsIcon icon={InternetIcon} size={16} />
        </button>
        <button
          onClick={() => appWindow.minimize()}
          className="flex w-11 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="Minimizar"
        >
          <HugeiconsIcon icon={MinusSignIcon} size={16} />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="flex w-11 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="Maximizar"
        >
          <HugeiconsIcon icon={SquareIcon} size={13} />
        </button>
        <button
          onClick={() => appWindow.close()}
          className="flex w-11 items-center justify-center text-zinc-400 transition-colors hover:bg-red-600 hover:text-white"
          aria-label="Cerrar"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} />
        </button>
      </div>
    </div>
  );
}

function AddMenuItem({
  icon,
  color,
  label,
  hint,
  onClick,
}: {
  icon: any;
  color: string;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-zinc-800"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-800/80">
        <HugeiconsIcon icon={icon} size={15} className={color} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-zinc-100">{label}</span>
        <span className="truncate text-[10px] text-zinc-500">{hint}</span>
      </span>
    </button>
  );
}
