import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Refresh01Icon,
  ComputerTerminal01Icon,
  Delete02Icon,
  Cancel01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

const PROXY =
  typeof window !== "undefined" && window.location.protocol.startsWith("http")
    ? "http://agproxy.localhost"
    : "agproxy://localhost";

type Log = { id: number; level: string; text: string };

export default function WebView({
  port,
  reloadKey,
  onReload,
}: {
  port: number;
  reloadKey: number;
  onReload: () => void;
}) {
  const url = `http://localhost:${port}`;
  const [showConsole, setShowConsole] = useState(false);
  const [proxyArmed, setProxyArmed] = useState(false);
  const [ready, setReady] = useState(false);
  const [waited, setWaited] = useState(0);
  const [logs, setLogs] = useState<Log[]>([]);
  const idRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Espera a que el dev server responda antes de cargar el iframe, así no se
  // muestra "connection refused"; cuando arranca, carga solo (sin recargar a mano).
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setWaited(0);
    const t0 = Date.now();
    const check = async () => {
      if (cancelled) return;
      try {
        await fetch(`${url}/`, { mode: "no-cors", cache: "no-store" });
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) {
          setWaited(Math.round((Date.now() - t0) / 1000));
          setTimeout(check, 1200);
        }
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [url, reloadKey]);

  // Al capturar consola, el iframe pasa por el proxy (que inyecta el captador).
  // Desactiva el HMR de Vite; se recarga con el botón. Fijamos el puerto ANTES
  // de cargar el proxy para no mostrar "proxy no configurado".
  useEffect(() => {
    let cancelled = false;
    if (!showConsole) {
      setProxyArmed(false);
      return;
    }
    setProxyArmed(false);
    invoke("set_proxy_port", { port })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setProxyArmed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [showConsole, port, reloadKey]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const c = (e.data as { __agconsole?: { level?: string; text?: string } })?.__agconsole;
      if (c && typeof c.text === "string") {
        const text = c.text;
        const level = c.level || "log";
        setLogs((l) => [...l.slice(-499), { id: ++idRef.current, level, text }]);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView();
  }, [logs]);

  // Limpia la consola al recargar.
  useEffect(() => {
    setLogs([]);
  }, [reloadKey]);

  const src = showConsole && proxyArmed ? `${PROXY}/?agc=${reloadKey}` : url;
  const errors = logs.filter((l) => l.level === "error").length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {ready ? (
        <iframe
          key={src}
          src={src}
          title="Vista web"
          className="min-h-0 flex-1 border-0 bg-white"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-[#0d0d10] text-sm text-zinc-400">
          <HugeiconsIcon icon={Loading03Icon} size={28} className="animate-spin text-indigo-400" />
          <div>Iniciando servidor en {url}…</div>
          <div className="text-xs text-zinc-600">
            Esperando a que el puerto responda{waited > 0 ? ` · ${waited}s` : ""} — se cargará solo.
          </div>
          <button
            type="button"
            onClick={() => setReady(true)}
            className="mt-1 rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Cargar ahora
          </button>
        </div>
      )}

      {showConsole && (
        <div className="flex h-44 shrink-0 flex-col border-t border-zinc-800 bg-[#0d0d10]">
          <div className="flex h-7 shrink-0 items-center gap-2 border-b border-zinc-800 px-3 text-[11px] text-zinc-500">
            <HugeiconsIcon icon={ComputerTerminal01Icon} size={12} />
            Consola
            <span className="text-zinc-600">· {logs.length}</span>
            {errors > 0 && <span className="text-red-400">· {errors} error(es)</span>}
            <button
              type="button"
              onClick={() => setLogs([])}
              title="Limpiar"
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <HugeiconsIcon icon={Delete02Icon} size={12} /> Limpiar
            </button>
            <button
              type="button"
              onClick={() => setShowConsole(false)}
              title="Cerrar consola"
              className="flex size-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed">
            {logs.length === 0 ? (
              <div className="text-zinc-600">Sin mensajes. Interactúa con la página o recárgala.</div>
            ) : (
              logs.map((l) => (
                <div
                  key={l.id}
                  className={cn(
                    "whitespace-pre-wrap break-all border-b border-zinc-900/60 py-0.5",
                    l.level === "error"
                      ? "text-red-400"
                      : l.level === "warn"
                        ? "text-amber-400"
                        : l.level === "info"
                          ? "text-sky-300"
                          : "text-zinc-300",
                  )}
                >
                  <span className="mr-1.5 select-none text-zinc-600">
                    {l.level === "log" ? "›" : l.level[0].toUpperCase()}
                  </span>
                  {l.text}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 border-t border-zinc-800 bg-[#121212] px-3 py-1.5 text-[11px] text-zinc-500">
        <button
          type="button"
          onClick={onReload}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <HugeiconsIcon icon={Refresh01Icon} size={12} /> Recargar
        </button>
        <button
          type="button"
          onClick={() => setShowConsole((v) => !v)}
          title="Captura console.log y errores de la página (desactiva el HMR mientras está activa)"
          className={cn(
            "flex items-center gap-1 rounded px-1.5 py-0.5",
            showConsole ? "bg-indigo-600 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
          )}
        >
          <HugeiconsIcon icon={ComputerTerminal01Icon} size={12} /> Consola
          {errors > 0 && !showConsole && (
            <span className="rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{errors}</span>
          )}
        </button>
        <span className="truncate">{showConsole ? "vía proxy (sin HMR)" : url}</span>
        <span className="ml-auto text-zinc-600">
          {ready ? "Espera el arranque del servidor y se carga solo." : "Esperando al servidor…"}
        </span>
      </div>
    </div>
  );
}
