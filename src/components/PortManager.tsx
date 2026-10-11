import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { HugeiconsIcon } from "@hugeicons/react";
import { Refresh01Icon, Cancel01Icon, Delete01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

type PortProc = { port: number; pid: number; name: string };

const isNode = (n: string) => /node|bun|deno|vite|next/i.test(n);

export default function PortManager({ onClose }: { onClose: () => void }) {
  const [ports, setPorts] = useState<PortProc[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [onlyNode, setOnlyNode] = useState(true);
  const [visible, setVisible] = useState(false);

  const refresh = async () => {
    try {
      setPorts(await invoke<PortProc[]>("list_ports"));
    } catch {
      setPorts([]);
    }
  };

  useEffect(() => {
    refresh();
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const kill = async (pid: number) => {
    setBusy(pid);
    try {
      await invoke("kill_process", { pid });
    } catch {
      /* no-op */
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const list = (ports ?? []).filter((p) => !onlyNode || isNode(p.name));

  return createPortal(
    <>
      <div
        onMouseDown={handleClose}
        className={cn(
          "fixed inset-0 z-[79] bg-black/40 transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className={cn(
          "fixed bottom-3 left-3 top-11 z-[80] flex w-[360px] flex-col rounded-xl border border-zinc-800 bg-[#161616] shadow-2xl shadow-black/60 transition-transform duration-300 ease-out",
          visible ? "translate-x-0" : "-translate-x-[130%]",
        )}
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <span className="text-sm font-medium text-zinc-100">Gestor de puertos</span>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
            <input
              type="checkbox"
              checked={onlyNode}
              onChange={(e) => setOnlyNode(e.target.checked)}
            />
            Solo Node
          </label>
          <button
            type="button"
            onClick={refresh}
            title="Refrescar"
            className="ml-auto flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={15} />
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {ports === null ? (
            <div className="p-3 text-xs text-zinc-500">cargando…</div>
          ) : list.length === 0 ? (
            <div className="p-3 text-xs text-zinc-600">
              {onlyNode ? "No hay puertos de Node abiertos." : "No hay puertos en escucha."}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {list.map((p) => (
                <div
                  key={`${p.port}-${p.pid}`}
                  className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-[#1a1a1a] px-3 py-2"
                >
                  <span className="w-14 shrink-0 font-mono text-sm text-emerald-400">:{p.port}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-zinc-200">{p.name}</div>
                    <div className="text-[10px] text-zinc-600">PID {p.pid}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => kill(p.pid)}
                    disabled={busy === p.pid}
                    className="flex items-center gap-1 rounded-md bg-red-600/90 px-2.5 py-1 text-[11px] text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    <HugeiconsIcon icon={Delete01Icon} size={12} />
                    {busy === p.pid ? "cerrando…" : "Cerrar"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800 px-4 py-2 text-[10px] text-zinc-600">
          Cierra el proceso que ocupa el puerto (útil para dev servers colgados).
        </div>
      </div>
    </>,
    document.body,
  );
}
