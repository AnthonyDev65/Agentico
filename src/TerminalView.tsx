import { useEffect, useRef } from "react";
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
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-[#121212] p-2">
      <div ref={termRef} className="h-full w-full" />
    </div>
  );
}
