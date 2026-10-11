import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Tick02Icon,
  Alert02Icon,
  Download01Icon,
  Refresh01Icon,
  Loading03Icon,
  ComputerTerminal01Icon,
  CpuIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

type Prereqs = {
  node: string | null;
  npm: string | null;
  claude: string | null;
  git: string | null;
  os: string;
};
type Which = "node" | "claude" | "git";

const ITEMS: { key: Which; label: string; desc: string }[] = [
  {
    key: "node",
    label: "Node.js + npm",
    desc: "Entorno de ejecución. Necesario para Claude y para los proyectos.",
  },
  {
    key: "claude",
    label: "Claude CLI",
    desc: "El motor de IA del IDE (@anthropic-ai/claude-code).",
  },
  { key: "git", label: "Git", desc: "Control de versiones y clonado de repositorios." },
];

const stripAnsi = (s: string) => {
  const last = s.split("\r").pop() ?? s;
  // eslint-disable-next-line no-control-regex
  return last.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
};

export default function SystemDoctor({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<Prereqs | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<Which | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);
  const logEnd = useRef<HTMLDivElement>(null);

  const check = async () => {
    setChecking(true);
    try {
      setP(await invoke<Prereqs>("check_prereqs"));
    } catch {
      /* no-op */
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    check();
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    logEnd.current?.scrollIntoView();
  }, [logs]);

  const close = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const statusOf = (key: Which): string | null => {
    if (!p) return null;
    if (key === "node") return p.node;
    if (key === "claude") return p.claude;
    return p.git;
  };

  const install = async (which: Which) => {
    const id = crypto.randomUUID();
    setBusy(which);
    setLogs([`$ instalando ${which}…`]);
    const un = await listen<{ id: string; line: string }>("create://log", (e) => {
      if (e.payload.id === id) setLogs((l) => [...l, stripAnsi(e.payload.line)]);
    });
    try {
      await invoke("install_prereq", { id, which });
    } catch (e) {
      setLogs((l) => [...l, `⚠ ${String(e)}`]);
    } finally {
      un();
      setBusy(null);
      check();
    }
  };

  const isLinux = p?.os === "linux";
  const allOk = !!p && !!p.node && !!p.claude;

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
        className={cn(
          "fixed bottom-3 left-3 top-11 z-[80] flex w-[520px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#161616] shadow-2xl shadow-black/60 transition-transform duration-300 ease-out",
          visible ? "translate-x-0" : "-translate-x-[130%]",
        )}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-800 bg-[#1a1a1a] px-4">
          <HugeiconsIcon icon={CpuIcon} size={16} className="text-indigo-400" />
          <span className="text-sm font-semibold text-zinc-100">Requisitos del sistema</span>
          <button
            type="button"
            onClick={check}
            title="Volver a verificar"
            className="ml-auto flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={14} className={cn(checking && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={close}
            className="flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={15} />
          </button>
        </div>

        <div className="shrink-0 border-b border-zinc-800 p-4">
          <p className="mb-3 text-xs leading-relaxed text-zinc-400">
            Agentico necesita <b>Node.js</b> y el <b>Claude CLI</b> para funcionar. Aquí puedes
            comprobarlos e instalarlos con un clic.
            {allOk && <span className="text-emerald-400"> Todo listo ✓</span>}
          </p>
          <div className="flex flex-col gap-2">
            {ITEMS.map((it) => {
              const v = statusOf(it.key);
              const installing = busy === it.key;
              return (
                <div
                  key={it.key}
                  className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-[#1a1a1a] px-3 py-2.5"
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full",
                      v ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400",
                    )}
                  >
                    <HugeiconsIcon icon={v ? Tick02Icon : Alert02Icon} size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm text-zinc-100">
                      {it.label}
                      {v && <span className="font-mono text-[11px] text-zinc-500">{v}</span>}
                    </div>
                    <div className="truncate text-[11px] text-zinc-500">
                      {v ? "instalado" : it.desc}
                    </div>
                  </div>
                  {!v &&
                    (isLinux && it.key !== "claude" ? (
                      <span className="shrink-0 text-[10px] text-zinc-500">instálalo con tu gestor</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => install(it.key)}
                        disabled={!!busy || (it.key === "claude" && !p?.npm)}
                        title={
                          it.key === "claude" && !p?.npm ? "Primero instala Node.js" : undefined
                        }
                        className="flex shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                      >
                        <HugeiconsIcon
                          icon={installing ? Loading03Icon : Download01Icon}
                          size={12}
                          className={cn(installing && "animate-spin")}
                        />
                        {installing ? "Instalando…" : "Instalar"}
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
          {isLinux && (
            <p className="mt-3 rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1.5 text-[10px] leading-relaxed text-zinc-500">
              En Linux, Node y Git se instalan con tu gestor de paquetes (requiere sudo), p. ej.{" "}
              <span className="font-mono text-zinc-400">sudo apt install nodejs npm git</span>. Luego
              reinicia la app y pulsa Instalar en Claude CLI.
            </p>
          )}
        </div>

        {/* Consola de instalación */}
        <div className="flex min-h-0 flex-1 flex-col bg-[#0d0d10]">
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-zinc-800 px-3 text-[11px] text-zinc-500">
            <HugeiconsIcon icon={ComputerTerminal01Icon} size={12} /> Salida
            {logs.length > 0 && (
              <button
                type="button"
                onClick={() => setLogs([])}
                className="ml-auto rounded px-1.5 py-0.5 hover:bg-zinc-800 hover:text-zinc-200"
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
            {logs.length === 0 ? (
              <div className="text-zinc-600">
                La salida de la instalación aparecerá aquí.
              </div>
            ) : (
              logs.map((l, i) => (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre-wrap break-all",
                    (l.startsWith("$ ") || l.startsWith("✓")) && "text-emerald-400",
                    l.startsWith("⚠") && "text-amber-400",
                  )}
                >
                  {l || " "}
                </div>
              ))
            )}
            <div ref={logEnd} />
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
