import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// Panel lateral estándar de Agentico (como Configuración): entra deslizando desde la
// IZQUIERDA y ocupa todo el alto bajo la barra de título. Usar para menús/ajustes.
export default function SideDrawer({
  title,
  icon,
  iconClass,
  width = 580,
  onClose,
  children,
}: {
  title: string;
  icon: any;
  iconClass?: string;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const close = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <>
      <div
        onMouseDown={close}
        className={cn(
          "fixed inset-0 z-[79] bg-black/40 transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        style={{ width }}
        className={cn(
          "fixed bottom-3 left-3 top-11 z-[80] flex max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#161616] shadow-2xl shadow-black/60 transition-transform duration-300 ease-out",
          visible ? "translate-x-0" : "-translate-x-[130%]",
        )}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-800 bg-[#1a1a1a] px-4">
          <HugeiconsIcon icon={icon} size={16} className={iconClass ?? "text-indigo-400"} />
          <span className="text-sm font-semibold text-zinc-100">{title}</span>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="ml-auto flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </>,
    document.body,
  );
}
