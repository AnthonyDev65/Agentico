import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import ProjectTabs from "@/components/ProjectTabs";
import Workspace, { type Project } from "@/components/Workspace";
import WelcomeScreen from "@/components/WelcomeScreen";
import PortManager from "@/components/PortManager";
import DomainManager from "@/components/DomainManager";
import ApiClient from "@/components/ApiClient";
import { cn } from "@/lib/utils";

function basename(p: string): string {
  return p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;
}

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [icons, setIcons] = useState<Record<string, string | null>>({});
  const [activated, setActivated] = useState<string[]>([]);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showPorts, setShowPorts] = useState(false);
  const [showDomains, setShowDomains] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const loadedRef = useRef(false);

  const fetchIcon = async (path: string) => {
    try {
      const icon = await invoke<string | null>("project_icon", { path });
      setIcons((m) => ({ ...m, [path]: icon ?? null }));
    } catch {
      /* sin icono */
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const ws = await invoke<{ projects: Project[]; active: string | null }>("projects_load");
        const ps = ws.projects ?? [];
        setProjects(ps);
        const act = ws.active ?? ps[0]?.path ?? null;
        setActive(act);
        if (act) setActivated([act]);
        ps.forEach((p) => fetchIcon(p.path));
      } finally {
        loadedRef.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    invoke("projects_save", { workspace: { projects, active } }).catch(() => {});
  }, [projects, active]);

  const activate = (path: string) => {
    setActivated((a) => (a.includes(path) ? a : [...a, path]));
    setActive(path);
    setShowWelcome(false);
  };

  const addProject = (path: string) => {
    setShowWelcome(false);
    setProjects((ps) => (ps.some((p) => p.path === path) ? ps : [...ps, { path, name: basename(path) }]));
    fetchIcon(path);
    activate(path);
  };

  const openProject = async () => {
    const sel = await open({ directory: true, multiple: false, title: "Abrir proyecto" });
    if (typeof sel === "string") addProject(sel);
  };

  const reorderProjects = (fromPath: string, toPath: string) => {
    if (fromPath === toPath) return;
    setProjects((ps) => {
      const from = ps.findIndex((p) => p.path === fromPath);
      const to = ps.findIndex((p) => p.path === toPath);
      if (from < 0 || to < 0) return ps;
      const next = [...ps];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const closeProject = (path: string) => {
    invoke("chat_kill", { id: path }).catch(() => {});
    invoke("pty_kill", { id: `${path}::claude` }).catch(() => {});
    invoke("pty_kill", { id: `${path}::shell` }).catch(() => {});
    setActivated((a) => a.filter((p) => p !== path));
    const idx = projects.findIndex((p) => p.path === path);
    const next = projects.filter((p) => p.path !== path);
    setProjects(next);
    if (active === path) {
      const neighbor = next[idx] ?? next[idx - 1] ?? next[0] ?? null;
      if (neighbor) {
        setActivated((a) => (a.includes(neighbor.path) ? a : [...a, neighbor.path]));
        setActive(neighbor.path);
      } else {
        setActive(null);
      }
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[#121212] text-zinc-200">
      <ProjectTabs
        projects={projects}
        active={active}
        icons={icons}
        onSelect={activate}
        onClose={closeProject}
        onAdd={openProject}
        onLogoClick={() => setShowWelcome(true)}
        onOpenPorts={() => setShowPorts(true)}
        onOpenDomains={() => setShowDomains(true)}
        onOpenApi={() => setShowApi(true)}
        onReorder={reorderProjects}
      />

      {showPorts && <PortManager onClose={() => setShowPorts(false)} />}
      {showDomains && <DomainManager onClose={() => setShowDomains(false)} />}
      {showApi && <ApiClient onClose={() => setShowApi(false)} />}

      <div className="relative min-h-0 flex-1">
        {projects
          .filter((p) => activated.includes(p.path))
          .map((p) => (
            <div key={p.path} className={cn("absolute inset-0", active === p.path ? "" : "hidden")}>
              <Workspace project={p} />
            </div>
          ))}

        {(showWelcome || projects.length === 0) && (
          <div className="absolute inset-0 z-40">
            <WelcomeScreen
              projects={projects}
              onOpenFolder={openProject}
              onOpenProject={(p) => {
                activate(p);
                setShowWelcome(false);
              }}
              onProjectReady={addProject}
              onClose={() => setShowWelcome(false)}
              canClose={projects.length > 0}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
