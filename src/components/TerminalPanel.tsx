import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  ComputerTerminal01Icon,
  GlobalIcon,
  PlayIcon,
  Package01Icon,
  PackageReceiveIcon,
  SourceCodeIcon,
  GitBranchIcon,
  PuzzleIcon,
  CubeIcon,
  PlugSocketIcon,
  ArrowDown01Icon,
  Tick02Icon,
  Add01Icon,
  Cancel01Icon,
  SmartPhone01Icon,
  Message01Icon,
} from "@hugeicons/core-free-icons";
import { ClaudeLogo } from "@/components/ClaudeLogo";
import type { Project, PackageInfo } from "@/components/Workspace";
import TerminalView from "@/TerminalView";
import WebView from "@/components/WebView";
import CodePanel from "@/components/CodePanel";
import GitPanel from "@/components/GitPanel";
import SkillsPanel from "@/components/SkillsPanel";
import LibrariesPanel from "@/components/LibrariesPanel";
import MCPPanel from "@/components/MCPPanel";
import { cn } from "@/lib/utils";

type View = "code" | "git" | "skills" | "libs" | "mcp" | "claude" | "terminal" | "web";

function commandFor(manager: string, script: string): string {
  if (manager === "yarn") return `yarn ${script}`;
  if (manager === "bun") return `bun run ${script}`;
  return `${manager} run ${script}`; // npm / pnpm
}

function installCommand(manager: string): string {
  if (manager === "yarn") return "yarn";
  if (manager === "bun") return "bun install";
  return `${manager} install`; // npm / pnpm
}

export default function TerminalPanel({
  project,
  pkg,
  port,
  onPortChange,
  phoneMode,
  onTogglePhone,
  chatVisible,
  onToggleChat,
}: {
  project: Project;
  pkg: PackageInfo | null;
  port: number;
  onPortChange: (p: number) => void;
  phoneMode: boolean;
  onTogglePhone: () => void;
  chatVisible: boolean;
  onToggleChat: () => void;
}) {
  const claudeId = `${project.path}::claude`;
  const shellId = `${project.path}::shell`;

  const [view, setView] = useState<View>("code");
  const [webActivated, setWebActivated] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const runKey = `agentico.runcmd.${project.path}`;
  const customKey = `agentico.runcmds.${project.path}`;
  const [runCmd, setRunCmd] = useState<string>(() => localStorage.getItem(runKey) ?? "");
  const [customCmds, setCustomCmds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(customKey) ?? "[]");
    } catch {
      return [];
    }
  });

  const defaultCmd = pkg?.dev_script ? commandFor(pkg.manager, pkg.dev_script) : "";
  const effectiveCmd = runCmd || defaultCmd;

  const selectRun = (c: string) => {
    setRunCmd(c);
    try {
      localStorage.setItem(runKey, c);
    } catch {
      /* no-op */
    }
  };
  const addCustomCmd = (c: string) => {
    setCustomCmds((list) => {
      const next = list.includes(c) ? list : [...list, c];
      try {
        localStorage.setItem(customKey, JSON.stringify(next));
      } catch {
        /* no-op */
      }
      return next;
    });
    selectRun(c);
  };
  const removeCustomCmd = (c: string) => {
    setCustomCmds((list) => {
      const next = list.filter((x) => x !== c);
      try {
        localStorage.setItem(customKey, JSON.stringify(next));
      } catch {
        /* no-op */
      }
      return next;
    });
  };

  const runInShell = async (cmd: string) => {
    await invoke("pty_write", { id: shellId, data: cmd + "\r" }).catch(() => {});
  };

  const onRun = async () => {
    if (!effectiveCmd) return;
    await runInShell(effectiveCmd);
    setWebActivated(true);
    setView("web");
  };

  const onBuild = async () => {
    if (!pkg?.build_script) return;
    setView("terminal");
    await runInShell(commandFor(pkg.manager, pkg.build_script));
  };

  const [installTriggered, setInstallTriggered] = useState(false);
  const needsInstall = !!pkg?.has_package && !pkg.installed && !installTriggered;
  const onInstall = async () => {
    if (!pkg) return;
    setInstallTriggered(true);
    setView("terminal");
    await runInShell(installCommand(pkg.manager));
  };

  const buildHint = pkg?.build_script
    ? `${commandFor(pkg.manager, pkg.build_script)}`
    : "sin script build en package.json";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barra de pestañas + acciones */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-zinc-800 bg-zinc-900/40 px-2">
        <ViewTab active={view === "code"} onClick={() => setView("code")} label="Código">
          <HugeiconsIcon icon={SourceCodeIcon} size={14} />
        </ViewTab>
        <ViewTab active={view === "git"} onClick={() => setView("git")} label="Git">
          <HugeiconsIcon icon={GitBranchIcon} size={14} />
        </ViewTab>
        <ViewTab active={view === "skills"} onClick={() => setView("skills")} label="Skills">
          <HugeiconsIcon icon={PuzzleIcon} size={14} />
        </ViewTab>
        <ViewTab active={view === "libs"} onClick={() => setView("libs")} label="Librerías">
          <HugeiconsIcon icon={CubeIcon} size={14} />
        </ViewTab>
        <ViewTab active={view === "mcp"} onClick={() => setView("mcp")} label="MCP">
          <HugeiconsIcon icon={PlugSocketIcon} size={14} />
        </ViewTab>
        <ViewTab active={view === "claude"} onClick={() => setView("claude")} label="Claude">
          <ClaudeLogo className="size-3.5" />
        </ViewTab>
        <ViewTab active={view === "terminal"} onClick={() => setView("terminal")} label="Terminal">
          <HugeiconsIcon icon={ComputerTerminal01Icon} size={14} />
        </ViewTab>
        <ViewTab
          active={view === "web"}
          onClick={() => {
            setWebActivated(true);
            setView("web");
          }}
          label="Web"
        >
          <HugeiconsIcon icon={GlobalIcon} size={14} />
        </ViewTab>

        <div className="ml-auto flex items-center gap-1">
          {needsInstall && (
            <button
              type="button"
              onClick={onInstall}
              title={`Instalar dependencias (${installCommand(pkg?.manager ?? "npm")})`}
              className="flex min-w-0 items-center gap-1.5 rounded-md bg-amber-600/90 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-600"
            >
              <HugeiconsIcon icon={PackageReceiveIcon} size={14} className="shrink-0" />
              <span className="truncate">Instalar dependencias</span>
            </button>
          )}
          {view === "web" && (
            <div className="mr-1 flex items-center gap-1 text-[11px] text-zinc-500">
              <span>localhost:</span>
              <input
                type="number"
                value={port}
                onChange={(e) => onPortChange(Number(e.target.value) || port)}
                className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-200 outline-none focus:border-indigo-500"
              />
            </div>
          )}
          <RunButton
            scripts={pkg?.scripts ?? []}
            manager={pkg?.manager ?? "npm"}
            cmd={effectiveCmd}
            custom={customCmds}
            disabled={!effectiveCmd}
            onSelect={selectRun}
            onRun={onRun}
            onAddCustom={addCustomCmd}
            onRemoveCustom={removeCustomCmd}
          />
          <ActionBtn
            onClick={onBuild}
            icon={Package01Icon}
            label="Compilar"
            title={buildHint}
            disabled={!pkg?.build_script}
          />

          <div className="mx-1 h-5 w-px bg-zinc-800" />

          <button
            type="button"
            onClick={onTogglePhone}
            title={phoneMode ? "Cerrar vista móvil" : "Vista móvil (split)"}
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition-colors",
              phoneMode
                ? "bg-indigo-600 text-white hover:bg-indigo-500"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
            )}
          >
            <HugeiconsIcon icon={SmartPhone01Icon} size={15} />
          </button>
          <button
            type="button"
            onClick={onToggleChat}
            title={chatVisible ? "Ocultar chat IA" : "Mostrar chat IA"}
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition-colors",
              chatVisible
                ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
            )}
          >
            <HugeiconsIcon icon={Message01Icon} size={15} />
          </button>
        </div>
      </div>

      {/* Vistas (todas montadas; se ocultan las inactivas para mantener vivas las sesiones) */}
      <div className="relative min-h-0 flex-1">
        <div className={cn("absolute inset-0", view === "code" ? "" : "hidden")}>
          <CodePanel project={project} />
        </div>
        {view === "git" && (
          <div className="absolute inset-0">
            <GitPanel project={project} />
          </div>
        )}
        {view === "skills" && (
          <div className="absolute inset-0">
            <SkillsPanel project={project} />
          </div>
        )}
        {view === "libs" && (
          <div className="absolute inset-0">
            <LibrariesPanel project={project} />
          </div>
        )}
        {view === "mcp" && (
          <div className="absolute inset-0">
            <MCPPanel project={project} />
          </div>
        )}
        <div
          className={cn(
            "absolute inset-0 flex",
            view === "claude" ? "" : "pointer-events-none opacity-0",
          )}
        >
          <TerminalView sessionId={claudeId} cwd={project.path} kind="claude" />
        </div>
        <div
          className={cn(
            "absolute inset-0 flex",
            view === "terminal" ? "" : "pointer-events-none opacity-0",
          )}
        >
          <TerminalView sessionId={shellId} cwd={project.path} kind="shell" />
        </div>
        {webActivated && (
          // No usamos `hidden` (display:none) porque recargaría el iframe al
          // volver a mostrarlo. Lo mantenemos renderizado e invisible.
          <div
            className={cn(
              "absolute inset-0",
              view === "web" ? "" : "pointer-events-none opacity-0",
            )}
          >
            <WebView port={port} reloadKey={reloadKey} onReload={() => setReloadKey((k) => k + 1)} />
          </div>
        )}
      </div>
    </div>
  );
}

function RunButton({
  scripts,
  manager,
  cmd,
  custom,
  disabled,
  onSelect,
  onRun,
  onAddCustom,
  onRemoveCustom,
}: {
  scripts: string[];
  manager: string;
  cmd: string;
  custom: string[];
  disabled: boolean;
  onSelect: (c: string) => void;
  onRun: () => void;
  onAddCustom: (c: string) => void;
  onRemoveCustom: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [input, setInput] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const scriptCmds = scripts.map((s) => commandFor(manager, s));
  const options = [...scriptCmds, ...custom.filter((c) => !scriptCmds.includes(c))];

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ left: Math.max(8, r.right - 256), top: r.bottom + 6 });
    }
    setOpen((o) => !o);
  };

  const add = () => {
    const c = input.trim();
    if (c) onAddCustom(c);
    setInput("");
  };

  return (
    <div className="flex items-stretch overflow-hidden rounded-md">
      <button
        type="button"
        onClick={onRun}
        disabled={disabled}
        title={cmd || "sin comando"}
        className="flex items-center gap-1.5 bg-emerald-600/90 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500"
      >
        <HugeiconsIcon icon={PlayIcon} size={14} /> Ejecutar
      </button>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="Elegir comando"
        className="flex items-center border-l border-emerald-900/40 bg-emerald-600/90 px-1 text-white transition-colors hover:bg-emerald-600"
      >
        <HugeiconsIcon icon={ArrowDown01Icon} size={12} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", left: pos.left, top: pos.top }}
            className="z-50 w-64 rounded-lg border border-zinc-800 bg-[#1a1a1a] p-1 shadow-xl shadow-black/50"
          >
            <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-600">
              Comando a ejecutar
            </div>
            <div className="max-h-56 overflow-auto">
              {options.length === 0 && (
                <div className="px-2 py-1 text-[11px] text-zinc-600">
                  sin scripts en package.json
                </div>
              )}
              {options.map((c) => (
                <div key={c} className="group flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(c);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left text-xs",
                      c === cmd
                        ? "bg-indigo-600/20 text-zinc-100"
                        : "text-zinc-300 hover:bg-zinc-800",
                    )}
                  >
                    <span className="truncate font-mono">{c}</span>
                    {c === cmd && (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        size={12}
                        className="ml-auto shrink-0 text-indigo-400"
                      />
                    )}
                  </button>
                  {custom.includes(c) && (
                    <button
                      type="button"
                      onClick={() => onRemoveCustom(c)}
                      title="Quitar"
                      className="px-1 text-zinc-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-1 flex items-center gap-1 border-t border-zinc-800 p-1">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add();
                }}
                placeholder="comando personalizado…"
                spellCheck={false}
                className="min-w-0 flex-1 rounded bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100 outline-none"
              />
              <button
                type="button"
                onClick={add}
                disabled={!input.trim()}
                className="flex items-center rounded bg-zinc-800 px-2 py-1 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
              >
                <HugeiconsIcon icon={Add01Icon} size={11} />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
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
      {children}
      {label}
    </button>
  );
}

function ActionBtn({
  onClick,
  icon,
  label,
  title,
  disabled,
  accent,
}: {
  onClick: () => void;
  icon: IconSvgElement;
  label: string;
  title?: string;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-40",
        accent
          ? "bg-emerald-600/90 text-white hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500"
          : "border border-zinc-700 text-zinc-200 hover:bg-zinc-800",
      )}
    >
      <HugeiconsIcon icon={icon} size={14} />
      {label}
    </button>
  );
}
