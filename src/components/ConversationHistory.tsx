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
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { groupSessions, type SessionMeta, type Thread } from "@/lib/chatThreads";

type HistMsg = { role: "user" | "assistant" | "summary" | "tool" | "part"; text: string; tool?: string };

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
  onResume: (t: Thread) => void;
}) {
  const [sessions, setSessions] = useState<Thread[] | null>(null);
  const [selected, setSelected] = useState<Thread | null>(null);
  const [transcript, setTranscript] = useState<HistMsg[] | null>(null);
  const [loadingT, setLoadingT] = useState(false);
  // Borrado con confirmación en dos clics (sin diálogos): id de la fila / opción armada.
  const [armed, setArmed] = useState<string | null>(null);
  const [cleanOpen, setCleanOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const remove = async (list: Thread[]) => {
    if (!list.length) return;
    setError(null);
    try {
      await invoke<number>("chat_sessions_delete", {
        projectPath: cwd,
        files: list.flatMap((x) => x.parts.map((p) => p.file)),
      });
      const gone = new Set(list.map((x) => x.key));
      setSessions((cur) => cur?.filter((x) => !gone.has(x.key)) ?? null);
      if (selected && gone.has(selected.key)) {
        setSelected(null);
        setTranscript(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setArmed(null);
      setCleanOpen(false);
    }
  };

  const DAY = 86_400_000;
  const olderThan = (days: number) => (sessions ?? []).filter((x) => x.modified && Date.now() - x.modified > days * DAY);
  const cleanOptions = [
    { key: "c7", label: "Más de 7 días", list: olderThan(7) },
    { key: "c30", label: "Más de 30 días", list: olderThan(30) },
    { key: "call", label: "Todas", list: sessions ?? [] },
  ];

  const load = async () => {
    try {
      setSessions(groupSessions(await invoke<SessionMeta[]>("chat_sessions", { projectPath: cwd })));
    } catch {
      setSessions([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  // Un hilo con varias partes (p.ej. modo Auto: una sesión por tarea) se lee entero,
  // con un separador entre partes.
  const openSession = async (s: Thread) => {
    setSelected(s);
    setTranscript(null);
    setLoadingT(true);
    try {
      const out: HistMsg[] = [];
      for (const [i, p] of s.parts.entries()) {
        const raw = await invoke<string>("chat_session_read", { file: p.file }).catch(() => "");
        if (s.parts.length > 1) out.push({ role: "part", text: `Parte ${i + 1} de ${s.parts.length} · contexto nuevo` });
        out.push(...parseTranscript(raw));
      }
      setTranscript(out);
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
            <>
              <button
                type="button"
                onClick={() => (armed === `d-${selected.key}` ? remove([selected]) : setArmed(`d-${selected.key}`))}
                className={
                  armed === `d-${selected.key}`
                    ? "ml-auto flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-500"
                    : "ml-auto flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                }
              >
                <HugeiconsIcon icon={Delete02Icon} size={12} /> {armed === `d-${selected.key}` ? "¿Borrar?" : "Borrar"}
              </button>
              <button
                type="button"
                onClick={() => onResume(selected)}
                className="flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
              >
                <HugeiconsIcon icon={PlayIcon} size={12} /> Retomar
              </button>
            </>
          ) : (
            <>
              <div className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setCleanOpen((v) => !v)}
                  disabled={!sessions?.length}
                  title="Borrar conversaciones antiguas"
                  className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={13} /> Limpiar
                </button>
                {cleanOpen && (
                  <div className="absolute right-0 top-8 z-10 flex w-52 flex-col rounded-lg border border-zinc-800 bg-[#1c1c1c] p-1 shadow-xl shadow-black/50">
                    {cleanOptions.map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        disabled={!o.list.length}
                        onClick={() => (armed === o.key ? remove(o.list) : setArmed(o.key))}
                        className={
                          armed === o.key
                            ? "flex items-center justify-between rounded px-2.5 py-1.5 text-left text-[12px] font-medium text-white bg-red-600 hover:bg-red-500"
                            : "flex items-center justify-between rounded px-2.5 py-1.5 text-left text-[12px] text-zinc-300 hover:bg-zinc-800 disabled:text-zinc-600 disabled:hover:bg-transparent"
                        }
                      >
                        <span>{armed === o.key ? `¿Borrar ${o.list.length}?` : o.label}</span>
                        <span className={armed === o.key ? "text-white/80" : "text-zinc-600"}>{o.list.length}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={load}
                title="Actualizar"
                className="flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <HugeiconsIcon icon={Refresh01Icon} size={14} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={15} />
          </button>
        </div>

        {error && <div className="shrink-0 border-b border-zinc-800 bg-red-500/10 px-4 py-1.5 text-[11px] text-red-300">{error}</div>}
        <div className="min-h-0 flex-1 overflow-auto" onMouseDown={() => setCleanOpen(false)}>
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
                  key={s.key}
                  className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-zinc-800/60"
                >
                  <button
                    type="button"
                    onClick={() => openSession(s)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-[13px] text-zinc-100">{s.title}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
                      {s.parts.length > 1 && (
                        <span
                          title="Sesiones de claude encadenadas en esta conversación (modo Auto, cambios de modo…)"
                          className="rounded bg-indigo-500/15 px-1.5 text-[10px] text-indigo-300"
                        >
                          {s.parts.length} partes
                        </span>
                      )}
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
                  <button
                    type="button"
                    onClick={() => (armed === `d-${s.key}` ? remove([s]) : setArmed(`d-${s.key}`))}
                    title="Borrar esta conversación"
                    className={
                      armed === `d-${s.key}`
                        ? "flex shrink-0 items-center gap-1 rounded bg-red-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-500"
                        : "flex size-6 shrink-0 items-center justify-center rounded text-zinc-500 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                    }
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={12} />
                    {armed === `d-${s.key}` && "¿Borrar?"}
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
  if (msg.role === "part")
    return (
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-zinc-600">
        <span className="h-px flex-1 bg-zinc-800" />
        {msg.text}
        <span className="h-px flex-1 bg-zinc-800" />
      </div>
    );
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
