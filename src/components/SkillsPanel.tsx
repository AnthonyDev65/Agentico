import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  PuzzleIcon,
  FolderOpenIcon,
  GitBranchIcon,
  GlobalIcon,
  Add01Icon,
  Refresh01Icon,
  Download01Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons";
import type { Project } from "@/components/Workspace";
import { cn } from "@/lib/utils";

type Skill = {
  name: string;
  description: string;
  path: string;
  scope: string;
  enabled: boolean;
};
type MarketSkill = { name: string; description: string; path: string };

export default function SkillsPanel({ project }: { project: Project }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [scope, setScope] = useState<"user" | "project">("user");
  const [form, setForm] = useState<null | "git" | "new" | "market">(null);
  const [gitUrl, setGitUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [marketUrl, setMarketUrl] = useState("");
  const [market, setMarket] = useState<MarketSkill[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setSkills(await invoke<Skill[]>("skills_list", { projectPath: project.path }));
    } catch {
      /* no-op */
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  const run = async (fn: () => Promise<unknown>, msg?: string, onSuccess?: () => void) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      if (msg) setNote(msg);
      onSuccess?.();
      await refresh();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  };

  const installLocal = async () => {
    const sel = await open({ directory: true, title: "Selecciona la carpeta del skill" });
    if (typeof sel !== "string") return;
    run(() => invoke("skill_install_local", { src: sel, scope, projectPath: project.path }), "Skill instalado.");
  };
  const installGit = () => {
    if (!gitUrl.trim()) return;
    run(
      () => invoke("skill_install_git", { url: gitUrl.trim(), scope, projectPath: project.path }),
      "Skill clonado.",
      () => {
        setGitUrl("");
        setForm(null);
      },
    );
  };
  const createNew = () => {
    if (!newName.trim()) return;
    run(
      () => invoke("skill_create", { name: newName.trim(), scope, projectPath: project.path }),
      "Skill creado.",
      () => {
        setNewName("");
        setForm(null);
      },
    );
  };
  const browse = async () => {
    if (!marketUrl.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      setMarket(await invoke<MarketSkill[]>("marketplace_browse", { url: marketUrl.trim() }));
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  };
  const installFromMarket = (m: MarketSkill) =>
    run(() => invoke("skill_install_local", { src: m.path, scope, projectPath: project.path }), `Instalado: ${m.name}`);

  const del = (s: Skill) => run(() => invoke("skills_delete", { path: s.path }));
  const toggle = (s: Skill) =>
    run(() => invoke("skills_set_enabled", { path: s.path, enabled: !s.enabled }));

  const userSkills = skills.filter((s) => s.scope === "user");
  const projSkills = skills.filter((s) => s.scope === "project");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-3 text-xs text-zinc-400">
        <HugeiconsIcon icon={PuzzleIcon} size={14} />
        <span className="font-medium text-zinc-200">Skills</span>
        <div className="ml-2 flex items-center overflow-hidden rounded-md border border-zinc-800 text-[11px]">
          <button
            type="button"
            onClick={() => setScope("user")}
            className={cn("px-2 py-0.5", scope === "user" ? "bg-zinc-700 text-white" : "text-zinc-400")}
          >
            Usuario
          </button>
          <button
            type="button"
            onClick={() => setScope("project")}
            className={cn(
              "px-2 py-0.5",
              scope === "project" ? "bg-zinc-700 text-white" : "text-zinc-400",
            )}
          >
            Proyecto
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <ToolBtn onClick={installLocal} icon={FolderOpenIcon} label="Carpeta" />
          <ToolBtn
            onClick={() => {
              setMarket(null);
              setForm(form === "git" ? null : "git");
            }}
            icon={GitBranchIcon}
            label="Git"
          />
          <ToolBtn
            onClick={() => setForm(form === "market" ? null : "market")}
            icon={GlobalIcon}
            label="Marketplace"
          />
          <ToolBtn
            onClick={() => {
              setMarket(null);
              setForm(form === "new" ? null : "new");
            }}
            icon={Add01Icon}
            label="Nuevo"
          />
          <button
            type="button"
            onClick={refresh}
            title="Refrescar"
            className="flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={14} />
          </button>
        </div>
      </div>

      {form === "git" && (
        <FormRow
          placeholder="https://github.com/usuario/skill.git"
          value={gitUrl}
          onChange={setGitUrl}
          onSubmit={installGit}
          action="Instalar"
          busy={busy}
        />
      )}
      {form === "new" && (
        <FormRow
          placeholder="nombre-del-skill"
          value={newName}
          onChange={setNewName}
          onSubmit={createNew}
          action="Crear"
          busy={busy}
        />
      )}
      {form === "market" && (
        <div className="border-b border-zinc-800 bg-[#121212] p-2">
          <FormRow
            placeholder="URL del marketplace (repo git con skills)"
            value={marketUrl}
            onChange={setMarketUrl}
            onSubmit={browse}
            action="Explorar"
            busy={busy}
            inline
          />
          {market && (
            <div className="mt-2 max-h-64 overflow-auto rounded border border-zinc-800">
              {market.length === 0 ? (
                <div className="p-2 text-xs text-zinc-600">No se encontraron skills en el repo.</div>
              ) : (
                market.map((m) => (
                  <div
                    key={m.path}
                    className="flex items-center gap-2 border-b border-zinc-800/60 px-2 py-1.5 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-zinc-200">{m.name}</div>
                      <div className="truncate text-[10px] text-zinc-500">{m.description}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => installFromMarket(m)}
                      title="Instalar"
                      className="flex shrink-0 items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 text-[11px] text-white hover:bg-indigo-500"
                    >
                      <HugeiconsIcon icon={Download01Icon} size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {note && (
        <div className="whitespace-pre-wrap border-b border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-400">
          {note}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <SkillGroup title="Usuario · ~/.claude" skills={userSkills} onToggle={toggle} onDelete={del} />
        <SkillGroup
          title={`Proyecto · ${project.name}`}
          skills={projSkills}
          onToggle={toggle}
          onDelete={del}
        />
      </div>
    </div>
  );
}

function ToolBtn({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: IconSvgElement;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
    >
      <HugeiconsIcon icon={icon} size={13} />
      {label}
    </button>
  );
}

function FormRow({
  placeholder,
  value,
  onChange,
  onSubmit,
  action,
  busy,
  inline,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  action: string;
  busy: boolean;
  inline?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", inline ? "" : "border-b border-zinc-800 bg-[#121212] p-2")}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-[#1a1a1a] px-2 py-1 text-xs text-zinc-100 outline-none focus:border-indigo-500/60"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || !value.trim()}
        className="shrink-0 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
      >
        {action}
      </button>
    </div>
  );
}

function SkillGroup({
  title,
  skills,
  onToggle,
  onDelete,
}: {
  title: string;
  skills: Skill[];
  onToggle: (s: Skill) => void;
  onDelete: (s: Skill) => void;
}) {
  return (
    <div className="mb-3">
      <div className="px-1 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {title} <span className="text-zinc-600">{skills.length}</span>
      </div>
      {skills.length === 0 ? (
        <div className="px-1 py-1 text-[11px] text-zinc-700">Sin skills.</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {skills.map((s) => (
            <div
              key={s.path}
              className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-[#1a1a1a] p-2.5"
            >
              <HugeiconsIcon
                icon={PuzzleIcon}
                size={16}
                className={cn("mt-0.5 shrink-0", s.enabled ? "text-indigo-400" : "text-zinc-600")}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-sm font-medium",
                      s.enabled ? "text-zinc-100" : "text-zinc-500",
                    )}
                  >
                    {s.name}
                  </span>
                  {!s.enabled && (
                    <span className="rounded bg-zinc-800 px-1 text-[9px] uppercase text-zinc-500">
                      off
                    </span>
                  )}
                </div>
                {s.description && (
                  <div className="line-clamp-2 text-[11px] text-zinc-500">{s.description}</div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch on={s.enabled} onClick={() => onToggle(s)} />
                <button
                  type="button"
                  onClick={() => onDelete(s)}
                  title="Borrar skill"
                  className="text-zinc-500 transition-colors hover:text-red-400"
                >
                  <HugeiconsIcon icon={Delete01Icon} size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={on ? "Desactivar" : "Activar"}
      className={cn(
        "relative h-4 w-7 shrink-0 rounded-full transition-colors",
        on ? "bg-indigo-600" : "bg-zinc-700",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-3 rounded-full bg-white transition-all",
          on ? "left-3.5" : "left-0.5",
        )}
      />
    </button>
  );
}
