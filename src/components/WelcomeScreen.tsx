import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FolderOpenIcon,
  GitBranchIcon,
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Loading03Icon,
  Cancel01Icon,
  ComputerTerminal01Icon,
} from "@hugeicons/core-free-icons";
import {
  siReact,
  siVuedotjs,
  siSvelte,
  siSolid,
  siPreact,
  siLit,
  siQwik,
  siJavascript,
  siNextdotjs,
  siAstro,
} from "simple-icons";
import { ClaudeLogo } from "@/components/ClaudeLogo";
import type { Project } from "@/components/Workspace";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "vite-react-ts", name: "React", sub: "Vite · TS", icon: siReact },
  { id: "vite-vue-ts", name: "Vue", sub: "Vite · TS", icon: siVuedotjs },
  { id: "vite-svelte-ts", name: "Svelte", sub: "Vite · TS", icon: siSvelte },
  { id: "vite-solid-ts", name: "Solid", sub: "Vite · TS", icon: siSolid },
  { id: "vite-preact-ts", name: "Preact", sub: "Vite · TS", icon: siPreact },
  { id: "vite-lit-ts", name: "Lit", sub: "Vite · TS", icon: siLit },
  { id: "vite-qwik-ts", name: "Qwik", sub: "Vite · TS", icon: siQwik },
  { id: "vite-vanilla-ts", name: "Vanilla", sub: "Vite · TS", icon: siJavascript },
  { id: "next", name: "Next.js", sub: "React SSR", icon: siNextdotjs },
  { id: "astro", name: "Astro", sub: "Content", icon: siAstro },
];

function logoColor(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r + g + b) / 3 < 48 ? "#e5e5e5" : `#${hex}`;
}

const COMMON_LIBS = [
  "tailwindcss",
  "lucide-react",
  "clsx",
  "tailwind-merge",
  "zustand",
  "axios",
  "react-router-dom",
  "@tanstack/react-query",
  "zod",
  "framer-motion",
  "dayjs",
  "react-hook-form",
];

// Limpia códigos ANSI y deja el último segmento tras \r (barras de progreso).
function cleanLine(s: string): string {
  const last = s.split("\r").pop() ?? s;
  // eslint-disable-next-line no-control-regex
  return last.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

/** Terminal en vivo (cajón derecho) con la salida de la creación/clonado. */
function CreateConsole({
  lines,
  busy,
  onClose,
}: {
  lines: string[];
  busy: boolean;
  onClose: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, [lines]);

  return createPortal(
    <div className="fixed bottom-3 right-3 top-11 z-[60] flex w-[460px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#0d0d10] shadow-2xl shadow-black/60">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 bg-[#1a1a1a] px-3 text-[11px] text-zinc-400">
        <HugeiconsIcon icon={ComputerTerminal01Icon} size={13} />
        <span className="font-medium text-zinc-300">Terminal</span>
        <span className="text-zinc-600">· creando proyecto</span>
        {busy ? (
          <HugeiconsIcon icon={Loading03Icon} size={12} className="ml-auto animate-spin text-zinc-400" />
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={13} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
        {lines.length === 0 ? (
          <div className="text-zinc-600">iniciando…</div>
        ) : (
          lines.map((l, i) => (
            <div
              key={i}
              className={cn(
                "whitespace-pre-wrap break-all",
                (l.startsWith("$ ") || l.startsWith("✓")) && "text-emerald-400",
              )}
            >
              {l || " "}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>,
    document.body,
  );
}

export default function WelcomeScreen({
  projects,
  onOpenFolder,
  onOpenProject,
  onProjectReady,
  onClose,
  canClose,
}: {
  projects: Project[];
  onOpenFolder: () => void;
  onOpenProject: (path: string) => void;
  onProjectReady: (path: string) => void;
  onClose: () => void;
  canClose: boolean;
}) {
  const [view, setView] = useState<"home" | "new" | "clone">("home");

  return (
    <div className="relative h-full overflow-auto bg-[#121212]">
      {canClose && (
        <button
          type="button"
          onClick={onClose}
          title="Cerrar"
          className="absolute right-4 top-4 z-10 flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} />
        </button>
      )}

      <div className="mx-auto max-w-4xl px-10 py-16">
        <div className="mb-10 flex items-center gap-3">
          <ClaudeLogo className="size-9" />
          <div>
            <div className="text-2xl font-semibold text-zinc-100">Agentico IDE</div>
            <div className="text-sm text-zinc-500">Crea o abre un proyecto para empezar</div>
          </div>
        </div>

        {view === "home" && (
          <HomeView
            projects={projects}
            onNew={() => setView("new")}
            onOpenFolder={onOpenFolder}
            onClone={() => setView("clone")}
            onOpenProject={onOpenProject}
          />
        )}
        {view === "new" && (
          <NewProjectView onBack={() => setView("home")} onProjectReady={onProjectReady} />
        )}
        {view === "clone" && (
          <CloneView onBack={() => setView("home")} onProjectReady={onProjectReady} />
        )}
      </div>
    </div>
  );
}

function HomeView({
  projects,
  onNew,
  onOpenFolder,
  onClone,
  onOpenProject,
}: {
  projects: Project[];
  onNew: () => void;
  onOpenFolder: () => void;
  onClone: () => void;
  onOpenProject: (path: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
      <div>
        <div className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Empezar</div>
        <div className="flex flex-col gap-1">
          <StartItem icon={Add01Icon} title="Nuevo proyecto" sub="Elige un framework y créalo" onClick={onNew} />
          <StartItem icon={FolderOpenIcon} title="Abrir carpeta" sub="Abre un proyecto existente" onClick={onOpenFolder} />
          <StartItem icon={GitBranchIcon} title="Clonar repositorio" sub="Desde una URL de Git" onClick={onClone} />
        </div>
      </div>
      <div>
        <div className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Reciente</div>
        {projects.length === 0 ? (
          <div className="text-sm text-zinc-600">Aún no hay proyectos.</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {projects.map((p) => (
              <button
                key={p.path}
                type="button"
                onClick={() => onOpenProject(p.path)}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-zinc-800/60"
              >
                <span className="truncate text-sm text-indigo-400 group-hover:text-indigo-300">
                  {p.name}
                </span>
                <span className="truncate text-xs text-zinc-600">{p.path}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StartItem({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-zinc-800/60"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-indigo-400 group-hover:bg-zinc-700">
        <HugeiconsIcon icon={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-zinc-100">{title}</span>
        <span className="block truncate text-xs text-zinc-500">{sub}</span>
      </span>
      <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="text-zinc-600 group-hover:text-zinc-400" />
    </button>
  );
}

function LocationPicker({
  dir,
  onPick,
}: {
  dir: string;
  onPick: (dir: string) => void;
}) {
  const pick = async () => {
    const sel = await open({ directory: true, title: "Elige dónde crear el proyecto" });
    if (typeof sel === "string") onPick(sel);
  };
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={pick}
        className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
      >
        <HugeiconsIcon icon={FolderOpenIcon} size={14} /> Elegir ubicación
      </button>
      <span className="truncate text-xs text-zinc-500">{dir || "sin elegir"}</span>
    </div>
  );
}

function BackBtn({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-4 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
    >
      <HugeiconsIcon icon={ArrowLeft01Icon} size={14} /> Volver
    </button>
  );
}

function NewProjectView({
  onBack,
  onProjectReady,
}: {
  onBack: () => void;
  onProjectReady: (path: string) => void;
}) {
  const [preset, setPreset] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dir, setDir] = useState("");
  const [libs, setLibs] = useState<string[]>([]);
  const [libInput, setLibInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);

  const toggleLib = (n: string) =>
    setLibs((l) => (l.includes(n) ? l.filter((x) => x !== n) : [...l, n]));
  const addCustomLib = () => {
    const n = libInput.trim();
    if (n && !libs.includes(n)) setLibs((l) => [...l, n]);
    setLibInput("");
  };

  const create = async () => {
    if (!preset || !name.trim() || !dir) return;
    const id = crypto.randomUUID();
    setBusy(true);
    setLog(null);
    setLogLines([]);
    const un = await listen<{ id: string; line: string }>("create://log", (e) => {
      if (e.payload.id === id) setLogLines((l) => [...l, cleanLine(e.payload.line)]);
    });
    try {
      const path = await invoke<string>("create_project", {
        id,
        parentDir: dir,
        name: name.trim(),
        preset,
        libs,
      });
      onProjectReady(path);
    } catch (e) {
      setLog(String(e).slice(-1200));
    } finally {
      un();
      setBusy(false);
    }
  };

  return (
    <div>
      <BackBtn onBack={onBack} />
      <div className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
        Elige un framework
      </div>
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPreset(p.id)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors",
              preset === p.id
                ? "border-indigo-500 bg-indigo-500/10"
                : "border-zinc-800 bg-[#1a1a1a] hover:border-zinc-700",
            )}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-7"
              fill={logoColor(p.icon.hex)}
              aria-hidden="true"
            >
              <path d={p.icon.path} />
            </svg>
            <span className="text-xs font-medium text-zinc-200">{p.name}</span>
            <span className="text-[10px] text-zinc-500">{p.sub}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="nombre-del-proyecto"
          spellCheck={false}
          className="w-full max-w-sm rounded-md border border-zinc-800 bg-[#1a1a1a] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500/60"
        />
        <LocationPicker dir={dir} onPick={setDir} />

        <div>
          <div className="mb-2 text-xs text-zinc-500">Librerías (opcional)</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {COMMON_LIBS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => toggleLib(n)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  libs.includes(n)
                    ? "border-indigo-500 bg-indigo-500/15 text-indigo-300"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex max-w-sm items-center gap-2">
            <input
              value={libInput}
              onChange={(e) => setLibInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomLib();
                }
              }}
              placeholder="otra librería (ej. three, gsap)…"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-[#1a1a1a] px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500/60"
            />
            <button
              type="button"
              onClick={addCustomLib}
              disabled={!libInput.trim()}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
            >
              Añadir
            </button>
          </div>
          {libs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {libs.map((n) => (
                <span
                  key={n}
                  className="flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200"
                >
                  {n}
                  <button
                    type="button"
                    onClick={() => toggleLib(n)}
                    className="text-zinc-500 hover:text-red-400"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {libs.includes("tailwindcss") && (
            <div className="mt-1.5 text-[11px] text-zinc-600">
              Tailwind se configurará automáticamente (Vite) o vía el scaffolder (Next).
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={create}
          disabled={!preset || !name.trim() || !dir || busy}
          className="flex w-fit items-center gap-2 rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          {busy ? <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin" /> : null}
          {busy ? "Creando e instalando…" : "Crear proyecto"}
        </button>
        {busy && (
          <div className="text-xs text-zinc-600">
            Esto puede tardar un minuto (descarga la plantilla e instala dependencias).
          </div>
        )}
        {log && (
          <pre className="max-h-48 max-w-2xl overflow-auto whitespace-pre-wrap rounded-md border border-red-900/50 bg-red-950/30 p-3 text-[11px] text-red-300">
            {log}
          </pre>
        )}
      </div>

      {(busy || logLines.length > 0) && (
        <CreateConsole lines={logLines} busy={busy} onClose={() => setLogLines([])} />
      )}
    </div>
  );
}

function CloneView({
  onBack,
  onProjectReady,
}: {
  onBack: () => void;
  onProjectReady: (path: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [dir, setDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);

  const clone = async () => {
    if (!url.trim() || !dir) return;
    const id = crypto.randomUUID();
    setBusy(true);
    setLog(null);
    setLogLines([]);
    const un = await listen<{ id: string; line: string }>("create://log", (e) => {
      if (e.payload.id === id) setLogLines((l) => [...l, cleanLine(e.payload.line)]);
    });
    try {
      const path = await invoke<string>("clone_repo", { id, url: url.trim(), parentDir: dir });
      onProjectReady(path);
    } catch (e) {
      setLog(String(e).slice(-1200));
    } finally {
      un();
      setBusy(false);
    }
  };

  return (
    <div>
      <BackBtn onBack={onBack} />
      <div className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
        Clonar repositorio
      </div>
      <div className="flex flex-col gap-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/usuario/repo.git"
          spellCheck={false}
          className="w-full max-w-xl rounded-md border border-zinc-800 bg-[#1a1a1a] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500/60"
        />
        <LocationPicker dir={dir} onPick={setDir} />
        <button
          type="button"
          onClick={clone}
          disabled={!url.trim() || !dir || busy}
          className="flex w-fit items-center gap-2 rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          {busy ? <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin" /> : null}
          {busy ? "Clonando…" : "Clonar"}
        </button>
        {log && (
          <pre className="max-h-48 max-w-2xl overflow-auto whitespace-pre-wrap rounded-md border border-red-900/50 bg-red-950/30 p-3 text-[11px] text-red-300">
            {log}
          </pre>
        )}
      </div>

      {(busy || logLines.length > 0) && (
        <CreateConsole lines={logLines} busy={busy} onClose={() => setLogLines([])} />
      )}
    </div>
  );
}
