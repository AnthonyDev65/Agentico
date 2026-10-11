import { useEffect, useState } from "react";
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
  CpuIcon,
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
  onAdd,
  onLogoClick,
  onOpenPorts,
  onOpenDomains,
  onOpenApi,
  onOpenDoctor,
  onReorder,
}: {
  projects: Project[];
  active: string | null;
  icons: Record<string, string | null>;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onAdd: () => void;
  onLogoClick: () => void;
  onOpenPorts: () => void;
  onOpenDomains: () => void;
  onOpenApi: () => void;
  onOpenDoctor: () => void;
  onReorder: (fromPath: string, toPath: string) => void;
}) {
  const [logoMenu, setLogoMenu] = useState<{ x: number; y: number } | null>(null);
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
        onClick={onLogoClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setLogoMenu({ x: e.clientX, y: e.clientY });
        }}
        title="Menú principal (clic derecho: más opciones)"
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
                onOpenDoctor();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
            >
              <HugeiconsIcon icon={CpuIcon} size={14} className="text-zinc-400" /> Requisitos del sistema
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

          {/* Nuevo proyecto */}
          <button
            type="button"
            onClick={onAdd}
            aria-label="Abrir otro proyecto"
            className="flex w-9 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            <HugeiconsIcon icon={Add01Icon} size={16} />
          </button>
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
