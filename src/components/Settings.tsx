import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Settings01Icon,
  CpuIcon,
  SlidersHorizontalIcon,
  Tick02Icon,
  Download01Icon,
  Loading03Icon,
  Refresh01Icon,
  ComputerTerminal01Icon,
  GitBranchIcon,
} from "@hugeicons/core-free-icons";
import GitSettings from "@/components/GitSettings";
import { cn } from "@/lib/utils";

type Cmd = [string, string[]];
type OS = "windows" | "macos" | "linux" | string;
type Tool = {
  id: string;
  label: string;
  desc: string;
  group: string;
  check: Cmd;
  npm?: string; // se instala con: npm install -g <npm>
  win?: Cmd; // winget
  mac?: Cmd; // brew
  note?: string; // sugerencia (Linux / sin comando automático)
};

const wg = (id: string): Cmd => [
  "winget",
  ["install", "-e", "--id", id, "--accept-source-agreements", "--accept-package-agreements"],
];
const brew = (pkg: string): Cmd => ["brew", ["install", pkg]];

const TOOLS: Tool[] = [
  // Esenciales
  { id: "node", label: "Node.js + npm", desc: "Entorno de ejecución para la IA y los proyectos.", group: "Esenciales", check: ["node", ["-v"]], win: wg("OpenJS.NodeJS.LTS"), mac: brew("node"), note: "sudo apt install nodejs npm" },
  { id: "claude", label: "Claude CLI", desc: "El motor de IA del IDE.", group: "Esenciales", check: ["claude", ["--version"]], npm: "@anthropic-ai/claude-code" },
  { id: "git", label: "Git", desc: "Control de versiones y clonado de repos.", group: "Esenciales", check: ["git", ["--version"]], win: wg("Git.Git"), mac: brew("git"), note: "sudo apt install git" },
  // Gestores de paquetes
  { id: "pnpm", label: "pnpm", desc: "Gestor de paquetes rápido.", group: "Gestores de paquetes", check: ["pnpm", ["-v"]], npm: "pnpm" },
  { id: "yarn", label: "Yarn", desc: "Gestor de paquetes alternativo.", group: "Gestores de paquetes", check: ["yarn", ["-v"]], npm: "yarn" },
  { id: "bun", label: "Bun", desc: "Runtime + gestor todo en uno.", group: "Gestores de paquetes", check: ["bun", ["-v"]], npm: "bun" },
  // Deploy & Git
  { id: "gh", label: "GitHub CLI", desc: "Operaciones de GitHub desde la terminal.", group: "Deploy & Git", check: ["gh", ["--version"]], win: wg("GitHub.cli"), mac: brew("gh"), note: "https://cli.github.com" },
  { id: "vercel", label: "Vercel CLI", desc: "Despliegue en Vercel.", group: "Deploy & Git", check: ["vercel", ["--version"]], npm: "vercel" },
  { id: "netlify", label: "Netlify CLI", desc: "Despliegue en Netlify.", group: "Deploy & Git", check: ["netlify", ["--version"]], npm: "netlify-cli" },
  // Lenguajes / toolchains
  { id: "typescript", label: "TypeScript (tsc)", desc: "Compilador de TypeScript global.", group: "Lenguajes y toolchains", check: ["tsc", ["--version"]], npm: "typescript" },
  { id: "python", label: "Python 3", desc: "Intérprete de Python.", group: "Lenguajes y toolchains", check: ["python", ["--version"]], win: wg("Python.Python.3.12"), mac: brew("python"), note: "sudo apt install python3" },
  { id: "rust", label: "Rust (rustup)", desc: "Toolchain de Rust.", group: "Lenguajes y toolchains", check: ["rustc", ["--version"]], win: wg("Rustlang.Rustup"), mac: brew("rustup-init"), note: "https://rustup.rs" },
  { id: "dotnet", label: ".NET SDK", desc: "SDK de .NET (C#, WinForms, WPF).", group: "Lenguajes y toolchains", check: ["dotnet", ["--version"]], win: wg("Microsoft.DotNet.SDK.8"), mac: brew("dotnet"), note: "https://dotnet.microsoft.com" },
];
const GROUPS = [...new Set(TOOLS.map((t) => t.group))];

function installCmd(t: Tool, os: OS): Cmd | null {
  if (t.npm) return ["npm", ["install", "-g", t.npm]];
  if (os === "windows" && t.win) return t.win;
  if (os === "macos" && t.mac) return t.mac;
  return null;
}

const stripAnsi = (s: string) => {
  const last = s.split("\r").pop() ?? s;
  // eslint-disable-next-line no-control-regex
  return last.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
};

export default function Settings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"general" | "tools" | "git">("tools");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const close = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

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
          "fixed bottom-3 left-3 top-11 z-[80] flex w-[580px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#161616] shadow-2xl shadow-black/60 transition-transform duration-300 ease-out",
          visible ? "translate-x-0" : "-translate-x-[130%]",
        )}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-800 bg-[#1a1a1a] px-4">
          <HugeiconsIcon icon={Settings01Icon} size={16} className="text-indigo-400" />
          <span className="text-sm font-semibold text-zinc-100">Configuración</span>
          <div className="ml-4 flex items-stretch gap-1">
            <TabBtn active={tab === "tools"} onClick={() => setTab("tools")} icon={CpuIcon}>
              Herramientas
            </TabBtn>
            <TabBtn active={tab === "general"} onClick={() => setTab("general")} icon={SlidersHorizontalIcon}>
              General
            </TabBtn>
            <TabBtn active={tab === "git"} onClick={() => setTab("git")} icon={GitBranchIcon}>
              Git
            </TabBtn>
          </div>
          <button
            type="button"
            onClick={close}
            className="ml-auto flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === "tools" ? (
            <ToolsTab />
          ) : tab === "git" ? (
            <div className="h-full overflow-y-auto p-5">
              <div className="mx-auto max-w-2xl">
                <GitSettings />
              </div>
            </div>
          ) : (
            <GeneralTab />
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200",
      )}
    >
      <HugeiconsIcon icon={icon} size={13} />
      {children}
    </button>
  );
}

function ToolsTab() {
  const [os, setOs] = useState<OS>("");
  const [versions, setVersions] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logEnd = useRef<HTMLDivElement>(null);

  const detect = async (ids?: string[]) => {
    const list = TOOLS.filter((t) => !ids || ids.includes(t.id));
    await Promise.all(
      list.map(async (t) => {
        try {
          const v = await invoke<string | null>("tool_version", {
            program: t.check[0],
            args: t.check[1],
          });
          setVersions((m) => ({ ...m, [t.id]: v ?? null }));
        } catch {
          setVersions((m) => ({ ...m, [t.id]: null }));
        }
      }),
    );
  };

  useEffect(() => {
    (async () => {
      try {
        const p = await invoke<{ os: string }>("check_prereqs");
        setOs(p.os);
      } catch {
        /* no-op */
      }
      detect();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    logEnd.current?.scrollIntoView();
  }, [logs]);

  const install = async (t: Tool) => {
    const cmd = installCmd(t, os);
    if (!cmd) return;
    const id = crypto.randomUUID();
    setBusy(t.id);
    setLogs([`$ instalando ${t.label}…`]);
    const un = await listen<{ id: string; line: string }>("create://log", (e) => {
      if (e.payload.id === id) setLogs((l) => [...l, stripAnsi(e.payload.line)]);
    });
    try {
      await invoke("run_install", { id, program: cmd[0], args: cmd[1] });
    } catch (e) {
      setLogs((l) => [...l, `⚠ ${String(e)}`]);
    } finally {
      un();
      setBusy(null);
      detect([t.id]);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-3 flex items-center gap-2">
          <p className="text-xs text-zinc-500">
            Instala CLIs y toolchains con un clic. {os && <span className="text-zinc-600">({os})</span>}
          </p>
          <button
            type="button"
            onClick={() => detect()}
            className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={12} /> Re-verificar
          </button>
        </div>

        {GROUPS.map((g) => (
          <div key={g} className="mb-4">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              {g}
            </div>
            <div className="flex flex-col gap-1.5">
              {TOOLS.filter((t) => t.group === g).map((t) => {
                const v = versions[t.id];
                const detected = v !== undefined;
                const installed = !!v;
                const cmd = installCmd(t, os);
                const installing = busy === t.id;
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-[#1a1a1a] px-3 py-2"
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full",
                        installed ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-700/40 text-zinc-500",
                      )}
                    >
                      <HugeiconsIcon icon={installed ? Tick02Icon : Download01Icon} size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[13px] text-zinc-100">
                        {t.label}
                        {installed && (
                          <span className="truncate font-mono text-[10px] text-zinc-500">{v}</span>
                        )}
                      </div>
                      <div className="truncate text-[11px] text-zinc-500">{t.desc}</div>
                    </div>
                    {installed ? (
                      <span className="shrink-0 text-[11px] text-emerald-400">instalado</span>
                    ) : cmd ? (
                      <button
                        type="button"
                        onClick={() => install(t)}
                        disabled={!!busy || !detected}
                        className="flex shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                      >
                        <HugeiconsIcon
                          icon={installing ? Loading03Icon : Download01Icon}
                          size={12}
                          className={cn(installing && "animate-spin")}
                        />
                        {installing ? "Instalando…" : "Instalar"}
                      </button>
                    ) : (
                      <span
                        className="shrink-0 text-right text-[10px] text-zinc-500"
                        title={t.note}
                      >
                        {t.note ? "instálalo manualmente" : "no disponible"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Consola de instalación */}
      <div className="flex h-44 shrink-0 flex-col border-t border-zinc-800 bg-[#0d0d10]">
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-zinc-800 px-3 text-[11px] text-zinc-500">
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
            <div className="text-zinc-600">La salida de la instalación aparecerá aquí.</div>
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
  );
}

const PERMS = [
  { value: "agentico-plan", label: "Agentico Plan — planifica con diagramas y tareas" },
  { value: "agentico-build", label: "Agentico Build — construye el plan escribiendo código" },
  { value: "acceptEdits", label: "Agent — auto-acepta ediciones" },
  { value: "plan", label: "Plan — solo planifica" },
  { value: "bypassPermissions", label: "Full access — permite todo" },
];
const MODELS = [
  { value: "auto", label: "Auto (por defecto)" },
  { value: "opus", label: "Opus — máxima capacidad" },
  { value: "sonnet", label: "Sonnet — equilibrado" },
  { value: "haiku", label: "Haiku — rápido" },
];

function GeneralTab() {
  const [perm, setPerm] = useState(() => localStorage.getItem("agentico.chat.perm") || "acceptEdits");
  const [model, setModel] = useState(() => localStorage.getItem("agentico.chat.model") || "auto");

  const save = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* no-op */
    }
  };

  return (
    <div className="h-full overflow-auto p-5">
      <div className="mx-auto flex max-w-[460px] flex-col gap-5">
        <section>
          <h3 className="mb-1 text-sm font-semibold text-zinc-100">Chat con Claude</h3>
          <p className="mb-3 text-[11px] text-zinc-500">
            Valores por defecto al abrir una sesión nueva de chat.
          </p>
          <Field label="Modo de permisos">
            <select
              value={perm}
              onChange={(e) => {
                setPerm(e.target.value);
                save("agentico.chat.perm", e.target.value);
              }}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            >
              {PERMS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Modelo">
            <select
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                save("agentico.chat.model", e.target.value);
              }}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            >
              {MODELS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <p className="mt-2 text-[11px] text-zinc-600">
            Se aplican en los próximos chats que abras. Los chats ya abiertos puedes reiniciarlos con
            las pastillas de permisos/modelo.
          </p>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
