import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HugeiconsIcon } from "@hugeicons/react";
import { Message01Icon, Cancel01Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import ChatView from "@/ChatView";
import TerminalPanel from "@/components/TerminalPanel";
import PhonePreview from "@/components/PhonePreview";
import ConversationHistory from "@/components/ConversationHistory";
import { cn } from "@/lib/utils";

export type Project = { path: string; name: string };

export type PackageInfo = {
  has_package: boolean;
  installed: boolean;
  manager: string;
  dev_script: string | null;
  build_script: string | null;
  scripts: string[];
  port: number | null;
};

export type DotnetInfo = {
  has_project: boolean;
  project_file: string | null;
  name: string | null;
  target_framework: string | null;
  output_type: string | null;
  kind: string; // winforms | wpf | console | web | lib | unknown
  restored: boolean;
};

function initialChatWidth(): number {
  const saved = Number(localStorage.getItem("agentico.chatWidth"));
  return saved && saved >= 320 ? saved : 440;
}

function initialPhoneWidth(): number {
  const saved = Number(localStorage.getItem("agentico.phoneWidth"));
  return saved && saved >= 260 ? saved : 400;
}

export default function Workspace({ project }: { project: Project }) {
  const [phoneMode, setPhoneMode] = useState(false);
  const [chatVisible, setChatVisible] = useState(true);
  const [chatWidth, setChatWidth] = useState(initialChatWidth);
  const [phoneWidth, setPhoneWidth] = useState(initialPhoneWidth);
  const [dragging, setDragging] = useState(false);
  // Montaje/animación del teléfono (entra y sale deslizando; luego se desmonta).
  const [phoneMounted, setPhoneMounted] = useState(false);
  const [phoneShown, setPhoneShown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [resume, setResume] = useState<{ id: string; file: string; nonce: number } | null>(null);
  const nonceRef = useRef(0);

  // Puerto del dev server, guardado por proyecto.
  const portKey = `agentico.port.${project.path}`;
  const [port, setPort] = useState<number>(() => {
    const s = localStorage.getItem(portKey);
    return s ? Number(s) : 5173;
  });
  const savedPortRef = useRef<boolean>(!!localStorage.getItem(portKey));
  const [pkg, setPkg] = useState<PackageInfo | null>(null);
  const [dotnet, setDotnet] = useState<DotnetInfo | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const info = await invoke<PackageInfo>("package_info", { path: project.path });
        setPkg(info);
        if (!savedPortRef.current && info.port) setPort(info.port);
      } catch {
        /* sin package.json */
      }
      try {
        setDotnet(await invoke<DotnetInfo>("dotnet_info", { path: project.path }));
      } catch {
        /* sin proyecto .NET */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path]);

  const changePort = (p: number) => {
    setPort(p);
    savedPortRef.current = true;
    try {
      localStorage.setItem(portKey, String(p));
    } catch {
      /* no-op */
    }
  };

  // Redimensionador genérico para los paneles de la derecha (arrastrar el borde
  // izquierdo: mover a la izquierda agranda el panel).
  const makeResizer =
    (opts: {
      start: number;
      min: number;
      storageKey: string;
      set: (w: number) => void;
    }) =>
    (e: React.PointerEvent) => {
      e.preventDefault();
      setDragging(true);
      const startX = e.clientX;
      let lastW = opts.start;
      const onMove = (ev: PointerEvent) => {
        lastW = Math.min(
          Math.max(opts.start + (startX - ev.clientX), opts.min),
          Math.round(window.innerWidth * 0.75),
        );
        opts.set(lastW);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setDragging(false);
        try {
          localStorage.setItem(opts.storageKey, String(lastW));
        } catch {
          /* no-op */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

  const startChatDrag = (e: React.PointerEvent) =>
    makeResizer({ start: chatWidth, min: 320, storageKey: "agentico.chatWidth", set: setChatWidth })(e);
  const startPhoneDrag = (e: React.PointerEvent) =>
    makeResizer({ start: phoneWidth, min: 260, storageKey: "agentico.phoneWidth", set: setPhoneWidth })(e);

  useEffect(() => {
    if (phoneMode) {
      setPhoneMounted(true);
      const id = requestAnimationFrame(() => setPhoneShown(true));
      return () => cancelAnimationFrame(id);
    }
    setPhoneShown(false);
    const t = setTimeout(() => setPhoneMounted(false), 300);
    return () => clearTimeout(t);
  }, [phoneMode]);

  return (
    <div className="flex h-full min-h-0">
      {/* Área de trabajo — siempre visible */}
      <section className="relative min-w-0 flex-1">
        <TerminalPanel
          project={project}
          pkg={pkg}
          dotnet={dotnet}
          port={port}
          onPortChange={changePort}
          phoneMode={phoneMode}
          onTogglePhone={() => setPhoneMode((m) => !m)}
          chatVisible={chatVisible}
          onToggleChat={() => setChatVisible((v) => !v)}
        />
      </section>

      {/* Split del teléfono (redimensionable, entra/sale deslizando) */}
      {phoneMounted && (
        <div
          className={cn(
            "flex items-stretch overflow-hidden",
            !dragging && "transition-[width] duration-300 ease-out",
          )}
          style={{ width: phoneShown ? phoneWidth + 4 : 0 }}
        >
          <div
            onPointerDown={startPhoneDrag}
            className="w-1 shrink-0 cursor-col-resize bg-zinc-800 transition-colors hover:bg-indigo-500/60"
          />
          <section className="flex shrink-0 flex-col" style={{ width: phoneWidth }}>
            <PhonePreview port={port} onPortChange={changePort} onExit={() => setPhoneMode(false)} />
          </section>
        </div>
      )}

      {/* Chat — se mantiene montado (sesión viva); se abre/cierra deslizando */}
      <div
        className={cn(
          "flex items-stretch overflow-hidden",
          !dragging && "transition-[width] duration-300 ease-out",
        )}
        style={{ width: chatVisible ? chatWidth + 4 : 0 }}
      >
        <div
          onPointerDown={startChatDrag}
          className="w-1 shrink-0 cursor-col-resize bg-zinc-800 transition-colors hover:bg-indigo-500/60"
        />
        <section style={{ width: chatWidth }} className="flex shrink-0 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            <HugeiconsIcon icon={Message01Icon} size={14} />
            Chat
            <span className="truncate normal-case tracking-normal text-zinc-600">
              · {project.name}
            </span>
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              title="Historial de conversaciones"
              className="ml-auto flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <HugeiconsIcon icon={Clock01Icon} size={14} />
            </button>
            <button
              type="button"
              onClick={() => setChatVisible(false)}
              title="Ocultar chat"
              className="flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} />
            </button>
          </div>
          <ChatView sessionId={project.path} cwd={project.path} resume={resume} />
        </section>
      </div>

      {dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}

      {showHistory && (
        <ConversationHistory
          cwd={project.path}
          onClose={() => setShowHistory(false)}
          onResume={(s) => {
            setResume({ id: s.id, file: s.file, nonce: ++nonceRef.current });
            setChatVisible(true);
            setShowHistory(false);
          }}
        />
      )}
    </div>
  );
}
