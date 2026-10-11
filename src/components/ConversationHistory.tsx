import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  Cancel01Icon,
  ArrowLeft01Icon,
  Wrench01Icon,
  Refresh01Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons";

type SessionMeta = { id: string; file: string; modified: number; size: number; title: string };
type HistMsg = { role: "user" | "assistant" | "summary" | "tool"; text: string; tool?: string };

function relTime(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Date(ms).toLocaleDateString();
}

const textOf = (content: any): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .filter((b) => b?.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n");
  return "";
};

function parseTranscript(raw: string): HistMsg[] {
  const out: HistMsg[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let v: any;
    try {
      v = JSON.parse(line);
    } catch {
      continue;
    }
    const t = v.type;
    if (t === "summary" && v.summary) {
      out.push({ role: "summary", text: String(v.summary) });
      continue;
    }
    const content = v.message?.content;
    if (content == null) continue;
    if (t === "user") {
      const text = textOf(content);
      if (text.trim()) out.push({ role: "user", text });
    } else if (t === "assistant") {
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b?.type === "text" && b.text?.trim()) out.push({ role: "assistant", text: b.text });
          else if (b?.type === "tool_use")
            out.push({
              role: "tool",
              tool: b.name,
              text: (() => {
                try {
                  return JSON.stringify(b.input);
                } catch {
                  return "";
                }
              })().slice(0, 200),
            });
        }
      } else {
        const text = textOf(content);
        if (text.trim()) out.push({ role: "assistant", text });
      }
    }
  }
  return out;
}

export default function ConversationHistory({
  cwd,
  onClose,
  onResume,
}: {
  cwd: string;
  onClose: () => void;
  onResume: (s: SessionMeta) => void;
}) {
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [selected, setSelected] = useState<SessionMeta | null>(null);
  const [transcript, setTranscript] = useState<HistMsg[] | null>(null);
  const [loadingT, setLoadingT] = useState(false);

  const load = async () => {
    try {
      setSessions(await invoke<SessionMeta[]>("chat_sessions", { projectPath: cwd }));
    } catch {
      setSessions([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  const openSession = async (s: SessionMeta) => {
    setSelected(s);
    setTranscript(null);
    setLoadingT(true);
    try {
      const raw = await invoke<string>("chat_session_read", { file: s.file });
      setTranscript(parseTranscript(raw));
    } catch {
      setTranscript([]);
    } finally {
      setLoadingT(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-6"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[80vh] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#161616] shadow-2xl shadow-black/60"
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-800 bg-[#1a1a1a] px-4">
          {selected ? (
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setTranscript(null);
              }}
              className="flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
            </button>
          ) : (
            <HugeiconsIcon icon={Clock01Icon} size={16} className="text-indigo-400" />
          )}
          <span className="truncate text-sm font-semibold text-zinc-100">
            {selected ? selected.title : "Historial de conversaciones"}
          </span>
          {selected ? (
            <button
              type="button"
              onClick={() => onResume(selected)}
              className="ml-auto flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
            >
              <HugeiconsIcon icon={PlayIcon} size={12} /> Retomar
            </button>
          ) : (
            <button
              type="button"
              onClick={load}
              title="Actualizar"
              className="ml-auto flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <HugeiconsIcon icon={Refresh01Icon} size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {selected ? (
            <div className="flex flex-col gap-3 p-4">
              {loadingT && <div className="text-sm text-zinc-500">cargando…</div>}
              {transcript?.length === 0 && !loadingT && (
                <div className="text-sm text-zinc-600">Sin mensajes legibles en esta sesión.</div>
              )}
              {transcript?.map((m, i) => (
                <TranscriptMsg key={i} msg={m} />
              ))}
            </div>
          ) : sessions === null ? (
            <div className="p-4 text-sm text-zinc-500">cargando…</div>
          ) : sessions.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-600">
              No hay conversaciones guardadas para este proyecto.
            </div>
          ) : (
            <div className="p-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-zinc-800/60"
                >
                  <button
                    type="button"
                    onClick={() => openSession(s)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-[13px] text-zinc-100">{s.title}</div>
                    <div className="text-[11px] text-zinc-600">
                      {relTime(s.modified)} · {(s.size / 1024).toFixed(0)} KB
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onResume(s)}
                    title="Retomar esta conversación"
                    className="flex shrink-0 items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity hover:bg-indigo-500 group-hover:opacity-100"
                  >
                    <HugeiconsIcon icon={PlayIcon} size={11} /> Retomar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TranscriptMsg({ msg }: { msg: HistMsg }) {
  if (msg.role === "summary")
    return (
      <div className="self-center rounded-full bg-zinc-800 px-3 py-1 text-[11px] text-zinc-400">
        {msg.text}
      </div>
    );
  if (msg.role === "user")
    return (
      <div className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-indigo-600 px-3.5 py-2 text-sm text-white">
        {msg.text}
      </div>
    );
  if (msg.role === "tool")
    return (
      <div className="flex max-w-[88%] items-center gap-2 self-start rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-xs text-zinc-400">
        <HugeiconsIcon icon={Wrench01Icon} size={13} className="shrink-0 text-indigo-400" />
        <span className="font-medium text-zinc-300">{msg.tool}</span>
        <span className="truncate font-mono text-[11px] text-zinc-600">{msg.text}</span>
      </div>
    );
  return (
    <div className="max-w-[88%] self-start rounded-2xl rounded-bl-sm border border-zinc-800 bg-zinc-800/50 px-3.5 py-2 text-sm text-zinc-100">
      <div className="md">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
      </div>
    </div>
  );
}
