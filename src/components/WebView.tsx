import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Refresh01Icon,
  ComputerTerminal01Icon,
  Delete02Icon,
  Cancel01Icon,
  Loading03Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  LinkSquare02Icon,
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
  // Ruta actual (path+query+hash) dentro del dev server. El iframe es de otro origen:
  // la app no puede leer su URL, así que se conoce cuando la escribe el usuario o, con
  // la Consola activa, porque el script del proxy avisa de cada navegación (__agnav).
  const [path, setPath] = useState("/");
  const [addr, setAddr] = useState(`${url}/`);
  const [editing, setEditing] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
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
  // Desactiva el HMR de Vite. Fijamos el puerto ANTES de cargar el proxy para no
  // mostrar "proxy no configurado".
  useEffect(() => {
    let cancelled = false;
    setProxyArmed(false);
    invoke("set_proxy_port", { port })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setProxyArmed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [port, reloadKey]);

  // Al cambiar de puerto se vuelve a la raíz.
  useEffect(() => {
    setPath("/");
    setAddr(`${url}/`);
  }, [url]);

  useEffect(() => {
    if (!editing) setAddr(`${url}${path}`);
  }, [path, url, editing]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      // mensajes de otros iframes (teléfono, pestañas) no son de esta vista
      if (e.source && e.source !== iframeRef.current?.contentWindow) return;
      const nav = (e.data as { __agnav?: string })?.__agnav;
      if (typeof nav === "string") setPath(nav || "/");
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

  // Abrir/cerrar la consola NO cambia el iframe (eso recargaba la página): el modo
  // (directo o por el proxy que captura la consola) se decide en cada carga.
  const wantProxy = showConsole && proxyArmed;
  // Solo la carga inicial lleva src «real»; las navegaciones posteriores (barra de URL)
  // cambian el src del MISMO iframe para conservar su historial (atrás/adelante).
  const srcFor = (p: string) =>
    wantProxy ? `${PROXY}${p}${p === "/" ? `?agc=${reloadKey}` : ""}` : `${url}${p}`;
  const [src, setSrc] = useState(() => srcFor(path));
  const viaProxy = src.startsWith(PROXY);
  const lastUrl = useRef(url);
  useEffect(() => {
    // Cambio de puerto → raíz; recarga forzada → misma ruta.
    const p = lastUrl.current !== url ? "/" : path;
    lastUrl.current = url;
    setSrc(srcFor(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reloadKey]);

  // "/ruta", "ruta", "localhost:3000/x" o una URL completa → navegar.
  const navigate = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    let full: URL;
    try {
      full = /^https?:\/\//i.test(v)
        ? new URL(v)
        : /^[\w.-]+:\d+/.test(v) || /^localhost\b/i.test(v)
          ? new URL(`http://${v}`)
          : new URL(v.startsWith("/") ? v : `/${v}`, `${url}/`);
    } catch {
      return;
    }
    const isLocal = full.hostname === "localhost" || full.hostname === "127.0.0.1";
    if (!isLocal || Number(full.port || 80) !== port) {
      // Otro sitio: en el iframe muchos lo bloquean (X-Frame-Options) → navegador del sistema.
      openUrl(full.href).catch(() => {});
      setAddr(`${url}${path}`);
      return;
    }
    const p = full.pathname + full.search + full.hash;
    setPath(p);
    const next = srcFor(p);
    if (next === src && iframeRef.current) iframeRef.current.src = next; // misma URL → recarga
    else setSrc(next);
  };

  const softReload = () => {
    if (!ready) return onReload(); // aún esperando al servidor: re-sondear
    const next = srcFor(path);
    const el = iframeRef.current;
    if (next === src && el) el.src = next;
    else setSrc(next);
  };
  // El historial de la ventana incluye las navegaciones del iframe (también las de
  // apps SPA con pushState): atrás/adelante funcionan aunque sea de otro origen.
  const goBack = () => window.history.back();
  const goForward = () => window.history.forward();
  const errors = logs.filter((l) => l.level === "error").length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Barra de navegación */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-zinc-800 bg-[#121212] px-2">
        <NavBtn icon={ArrowLeft01Icon} title="Atrás" onClick={goBack} />
        <NavBtn icon={ArrowRight01Icon} title="Adelante" onClick={goForward} />
        <NavBtn icon={Refresh01Icon} title="Recargar" onClick={softReload} />
        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(addr);
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            onFocus={(e) => {
              setEditing(true);
              e.target.select();
            }}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setAddr(`${url}${path}`);
                (e.target as HTMLInputElement).blur();
              }
            }}
            spellCheck={false}
            title={
              viaProxy
                ? "URL actual de la página"
                : "Escribe una ruta (/login) o una URL y pulsa Enter. Al navegar con enlaces dentro de la página la URL no se actualiza aquí (restricción del navegador); activa la Consola para verla en vivo."
            }
            className="h-7 w-full rounded-md border border-zinc-800 bg-[#0d0d10] px-2.5 font-mono text-[12px] text-zinc-200 outline-none transition-colors hover:border-zinc-700 focus:border-indigo-500"
          />
        </form>
        <button
          type="button"
          onClick={() => setShowConsole((v) => !v)}
          title="Captura console.log y errores de la página y muestra la URL real (empieza a capturar al recargar; mientras captura no hay HMR)"
          className={cn(
            "flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px]",
            showConsole ? "bg-indigo-600 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
          )}
        >
          <HugeiconsIcon icon={ComputerTerminal01Icon} size={13} /> Consola
          {errors > 0 && !showConsole && (
            <span className="rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{errors}</span>
          )}
        </button>
        <NavBtn
          icon={LinkSquare02Icon}
          title="Abrir en el navegador del sistema"
          onClick={() => openUrl(`${url}${path}`).catch(() => {})}
        />
      </div>

      {ready ? (
        <iframe
          ref={iframeRef}
          key={reloadKey}
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
            {!viaProxy && (
              <div className="mb-1 flex items-center gap-2 font-sans text-zinc-500">
                La captura empieza la próxima vez que se recargue la página.
                <button
                  type="button"
                  onClick={softReload}
                  className="rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-300 hover:bg-zinc-800"
                >
                  Recargar ahora
                </button>
              </div>
            )}
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

    </div>
  );
}

function NavBtn({ icon, title, onClick }: { icon: any; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
    >
      <HugeiconsIcon icon={icon} size={15} />
    </button>
  );
}
