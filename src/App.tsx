import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ProjectTabs from "@/components/ProjectTabs";
import Workspace, { type Project } from "@/components/Workspace";
import WelcomeScreen from "@/components/WelcomeScreen";
import PortManager from "@/components/PortManager";
import DomainManager from "@/components/DomainManager";
import ApiClient from "@/components/ApiClient";
import DbManager from "@/components/DbManager";
import SystemDoctor from "@/components/SystemDoctor";
import Settings from "@/components/Settings";
import RemotePanel from "@/components/RemotePanel";
import { initRemote, useRemote } from "@/lib/remote";
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
  // Pantalla con la que abre el menú principal (el «+» de las pestañas va directo a una).
  const [welcomeView, setWelcomeView] = useState<"home" | "new" | "clone">("home");
  const openWelcome = (v: "home" | "new" | "clone") => {
    setWelcomeView(v);
    setShowWelcome(true);
  };
  const [showPorts, setShowPorts] = useState(false);
  const [showDomains, setShowDomains] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [showDb, setShowDb] = useState(false);
  const [showDoctor, setShowDoctor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const loadedRef = useRef(false);

  // Control remoto: reanudar si estaba encendido y mantener al teléfono al día de los
  // proyectos (solo los ya abiertos en esta sesión tienen chat en marcha).
  useEffect(() => {
    void initRemote();
  }, []);
  const remote = useRemote();
  useEffect(() => {
    if (!remote?.running) return;
    invoke("remote_set_projects", {
      projects: projects
        .filter((p) => activated.includes(p.path))
        .map((p) => ({ id: p.path, name: p.name, active: p.path === active })),
    }).catch(() => {});
  }, [remote?.running, projects, activated, active]);

  // Confirmación al cerrar la app (botón X, Alt+F4…). «No volver a preguntar» se recuerda.
  const [confirmClose, setConfirmClose] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  const closingRef = useRef(false);
  useEffect(() => {
    const win = getCurrentWindow();
    const un = win.onCloseRequested((e) => {
      if (closingRef.current) return;
      let skip = false;
      try {
        skip = localStorage.getItem("agentico.confirmClose") === "off";
      } catch {
        /* no-op */
      }
      if (skip) return;
      e.preventDefault();
      setConfirmClose(true);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);
  const reallyClose = () => {
    if (dontAsk) {
      try {
        localStorage.setItem("agentico.confirmClose", "off");
      } catch {
        /* no-op */
      }
    }
    closingRef.current = true;
    getCurrentWindow().close();
  };

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

  // Si falta el Claude CLI, abre el asistente de requisitos al arrancar.
  useEffect(() => {
    (async () => {
      try {
        const p = await invoke<{ claude: string | null }>("check_prereqs");
        if (!p.claude) setShowDoctor(true);
      } catch {
        /* no-op */
      }
    })();
  }, []);

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
        onNewProject={() => openWelcome("new")}
        onImportFolder={openProject}
        onCloneRepo={() => openWelcome("clone")}
        onLogoClick={() => openWelcome("home")}
        onOpenPorts={() => setShowPorts(true)}
        onOpenDomains={() => setShowDomains(true)}
        onOpenApi={() => setShowApi(true)}
        onOpenDb={() => setShowDb(true)}
        onOpenRemote={() => setShowRemote(true)}
        onOpenDoctor={() => setShowDoctor(true)}
        onOpenSettings={() => setShowSettings(true)}
        onReorder={reorderProjects}
      />

      {showPorts && <PortManager onClose={() => setShowPorts(false)} />}
      {showDomains && <DomainManager onClose={() => setShowDomains(false)} />}
      {showApi && <ApiClient onClose={() => setShowApi(false)} />}
      {confirmClose && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55"
          onMouseDown={() => setConfirmClose(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setConfirmClose(false);
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="w-[380px] rounded-xl border border-zinc-800 bg-[#1a1a1a] p-5 shadow-2xl shadow-black/60"
          >
            <div className="text-[15px] font-semibold text-zinc-100">¿Seguro que quieres cerrar Agentico?</div>
            <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
              Se detendrán los chats con Claude, las terminales y los servidores de desarrollo que estén en marcha. Las
              conversaciones quedan guardadas en el historial.
            </p>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-[12px] text-zinc-400">
              <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
              No volver a preguntar
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmClose(false)}
                className="rounded-md border border-zinc-700 px-3.5 py-1.5 text-[12px] text-zinc-200 hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={reallyClose}
                className="rounded-md bg-red-600 px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-red-500"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {showDb && <DbManager onClose={() => setShowDb(false)} />}
      {showRemote && <RemotePanel onClose={() => setShowRemote(false)} />}
      {showDoctor && <SystemDoctor onClose={() => setShowDoctor(false)} />}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}

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
              key={`${welcomeView}-${showWelcome}`}
              initialView={welcomeView}
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
