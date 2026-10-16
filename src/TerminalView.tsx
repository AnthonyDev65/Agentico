import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export default function TerminalView({
  sessionId,
  cwd,
  kind = "claude",
  startupCommand,
}: {
  sessionId: string;
  cwd: string;
  kind?: "claude" | "shell";
  startupCommand?: string;
}) {
  const termRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<Terminal | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; hasSel: boolean } | null>(null);

  // Portapapeles nativo (Rust): la API web del webview no es fiable para leer.
  const copySelection = () => {
    const t = instRef.current;
    const text = t?.getSelection();
    if (!t || !text) return;
    invoke("clipboard_write", { text }).catch(() => {});
    t.clearSelection();
  };
  const pasteClipboard = async (fallbackCtrlV = false) => {
    const t = instRef.current;
    if (!t) return;
    const text = await invoke<string>("clipboard_read").catch(() => "");
    if (text) t.paste(text); // respeta bracketed paste (multilínea en claude)
    else if (fallbackCtrlV && kind === "claude") {
      // Sin texto (p.ej. una imagen): se reenvía ^V para que claude intente pegarla.
      invoke("pty_write", { id: sessionId, data: "\x16" }).catch(() => {});
    }
    t.focus();
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  useEffect(() => {
    const host = termRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: "#121212",
        foreground: "#e4e4e7",
        cursor: "#818cf8",
        selectionBackground: "#3730a3",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    instRef.current = term;

    // Ctrl+V pega (xterm lo convertiría en ^V) · Ctrl+C copia si hay selección
    // (si no, sigue siendo interrumpir) · Ctrl+Shift+C/V siempre copian/pegan.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown" || !e.ctrlKey || e.altKey || e.metaKey) return true;
      const k = e.key.toLowerCase();
      if (k === "v") {
        e.preventDefault(); // evita además el evento paste nativo (doble pegado)
        pasteClipboard(true);
        return false;
      }
      if (k === "c" && (e.shiftKey || term.hasSelection())) {
        e.preventDefault();
        copySelection();
        return false;
      }
      return true;
    });

    const unlisteners: UnlistenFn[] = [];
    let disposed = false;
    let ready = false; // listeners registrados
    let spawned = false;

    term.onData((data) => {
      invoke("pty_write", { id: sessionId, data }).catch(() => {});
    });

    // Ajusta el tamaño y, la PRIMERA vez que la terminal es visible (tiene
    // tamaño real), recién ahí arranca el PTY con las columnas correctas.
    const sync = () => {
      if (!host.clientWidth || !host.clientHeight) return; // oculto / sin tamaño
      try {
        fit.fit();
      } catch {
        return;
      }
      if (!ready || term.cols < 2) return;
      if (!spawned) {
        spawned = true;
        invoke("pty_spawn", {
          id: sessionId,
          cwd,
          cols: term.cols,
          rows: term.rows,
          kind,
        })
          .then(() => {
            // Terminal con comando de arranque (ej. una CLI agéntica): lo
            // escribimos una vez cuando el shell ya está listo.
            if (startupCommand) {
              setTimeout(() => {
                invoke("pty_write", { id: sessionId, data: startupCommand + "\r" }).catch(() => {});
              }, 600);
            }
          })
          .catch((err) => term.writeln(`\r\n\x1b[31mError al arrancar la sesión: ${err}\x1b[0m`));
      } else {
        invoke("pty_resize", { id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {});
      }
    };

    const onResize = () => sync();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    (async () => {
      const unData = await listen<{ id: string; chunk: string }>("pty://data", (e) => {
        if (e.payload.id === sessionId) term.write(b64ToBytes(e.payload.chunk));
      });
      const unExit = await listen<{ id: string }>("pty://exit", (e) => {
        if (e.payload.id === sessionId)
          term.write("\r\n\x1b[33m[proceso terminó]\x1b[0m\r\n");
      });
      if (disposed) {
        unData();
        unExit();
        return;
      }
      unlisteners.push(unData, unExit);
      ready = true;
      sync(); // si ya es visible, arranca ahora
    })();

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      unlisteners.forEach((fn) => fn());
      instRef.current = null;
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div
      className="min-h-0 flex-1 overflow-hidden bg-[#121212] p-2"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, hasSel: !!instRef.current?.hasSelection() });
      }}
    >
      <div ref={termRef} className="h-full w-full" />
      {menu &&
        createPortal(
          <div
            className="fixed z-[80] w-52 rounded-lg border border-zinc-800 bg-[#1a1a1a] p-1 text-xs shadow-xl shadow-black/50"
            style={{
              left: Math.min(menu.x, window.innerWidth - 216),
              top: Math.min(menu.y, window.innerHeight - 150),
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <TermMenuItem
              label="Copiar"
              shortcut="Ctrl+C"
              disabled={!menu.hasSel}
              onClick={() => {
                setMenu(null);
                copySelection();
              }}
            />
            <TermMenuItem
              label="Pegar"
              shortcut="Ctrl+V"
              onClick={() => {
                setMenu(null);
                pasteClipboard();
              }}
            />
            <TermMenuItem
              label="Seleccionar todo"
              onClick={() => {
                setMenu(null);
                instRef.current?.selectAll();
              }}
            />
            <div className="my-1 h-px bg-zinc-800" />
            <TermMenuItem
              label="Limpiar pantalla"
              onClick={() => {
                setMenu(null);
                instRef.current?.clear();
                instRef.current?.focus();
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

function TermMenuItem({
  label,
  shortcut,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center rounded px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 disabled:text-zinc-600 disabled:hover:bg-transparent"
    >
      {label}
      {shortcut && <span className="ml-auto text-[10px] text-zinc-500">{shortcut}</span>}
    </button>
  );
}
