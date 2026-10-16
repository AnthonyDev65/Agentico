import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Wrench01Icon,
  Tick02Icon,
  Loading03Icon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowDown02Icon,
  ArrowUp01Icon,
  ImageAdd01Icon,
  Cancel01Icon,
  StopIcon,
  ShieldKeyIcon,
  TaskAdd01Icon,
  Clock01Icon,
  PlayIcon,
  Delete02Icon,
  RepeatIcon,
} from "@hugeicons/core-free-icons";
import { linkSession, newThreadId } from "@/lib/chatThreads";
import { useRemote } from "@/lib/remote";
import {
  MISSED_MS,
  REPEAT_LABEL,
  addScheduled,
  fmtWhen,
  getScheduled,
  nextRun,
  patchScheduled,
  removeScheduled,
  useScheduled,
  type Repeat,
} from "@/lib/scheduledPrompts";
import { ThinkingOrb } from "thinking-orbs";
import {
  AGENTICO_BUILD,
  AGENTICO_BUILD_PROMPT,
  AGENTICO_PLAN,
  AGENTICO_PLAN_PROMPT,
  BUILD_ALLOWED_TOOLS,
  PLAN_EXAMPLE_PROMPTS,
} from "@/lib/agenticoPlan";
import { QUESTIONS_PROMPT, QuestionsCard, QuestionsPending, splitQuestions } from "@/components/ChatQuestions";
import PermissionCard, { type PermissionDecision } from "@/components/PermissionCard";
import { BorderBeam } from "border-beam";
import { fileIcon } from "@/lib/fileIcons";
import { cn } from "@/lib/utils";

// Prompts de ejemplo del estado vacío: al hacer clic se cargan en el input (editables).
const EXAMPLE_PROMPTS = [
  "Explícame la estructura de este proyecto y cómo se ejecuta",
  "Revisa el código y busca bugs o malas prácticas",
  "Genera un diagrama de secuencia UML del flujo principal en docs/flujo.md",
  "Escribe tests para la lógica más importante",
  "Sugiere mejoras de rendimiento y accesibilidad",
];

type Attachment = { mediaType: string; data: string; dataUrl: string };

type ToolStatus = "running" | "done" | "error";

type Msg =
  | { id: number; kind: "user"; text: string; images?: string[]; mentions?: string[] }
  | { id: number; kind: "assistant"; text: string; streaming: boolean }
  | {
      id: number;
      kind: "tool";
      name: string;
      input: unknown;
      toolUseId: string;
      status: ToolStatus;
      result?: string;
    }
  | { id: number; kind: "result"; costUsd?: number; durationMs?: number; isError?: boolean }
  | { id: number; kind: "system"; text: string }
  | { id: number; kind: "error"; text: string }
  | {
      id: number;
      kind: "permission";
      requestId: string;
      toolName: string;
      input: any;
      description?: string;
      reason?: string;
      suggestions?: unknown[];
      status: "pending" | "allowed" | "always" | "denied" | "cancelled" | "auto";
    };

// Auto-permitir: aprueba solo los permisos de herramientas sin preguntar. Las que son
// preguntas o decisiones del usuario (no permisos) siguen mostrándose siempre.
const AUTO_APPROVE_KEY = "agentico.autoApprove";
const NEVER_AUTO = new Set(["AskUserQuestion", "ExitPlanMode"]);
const loadAutoApprove = () => {
  try {
    return localStorage.getItem(AUTO_APPROVE_KEY) === "on";
  } catch {
    return false;
  }
};

function resultToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((c) => (typeof c === "string" ? c : (c?.text ?? JSON.stringify(c))))
      .join("\n");
  return JSON.stringify(content);
}

type Option = { value: string; label: string; hint: string };

const PERM_OPTIONS: Option[] = [
  {
    value: AGENTICO_PLAN,
    label: "Agentico Plan",
    hint: "Planifica el proyecto con PLAN.md, diagramas, Visual System y tablero de tareas",
  },
  {
    value: AGENTICO_BUILD,
    label: "Agentico Build",
    hint: "Construye el plan tarea por tarea escribiendo código, con mínimo consumo de tokens",
  },
  { value: "acceptEdits", label: "Agent", hint: "Auto-acepta ediciones de archivos" },
  { value: "plan", label: "Plan", hint: "Solo planifica, no modifica nada" },
  { value: "bypassPermissions", label: "Full access", hint: "Permite todo sin preguntar" },
];

// Opciones de arranque de claude según el modo elegido en la píldora.
// «Agentico Plan» = acceptEdits (necesita escribir el plan) + instrucciones propias.
function startOpts(perm: string, model: string) {
  const plan = perm === AGENTICO_PLAN;
  const build = perm === AGENTICO_BUILD;
  // Siempre: formato de preguntas seleccionables; en los modos Agentico, sus instrucciones.
  const extra = plan ? AGENTICO_PLAN_PROMPT : build ? AGENTICO_BUILD_PROMPT : "";
  return {
    permissionMode: plan || build ? "acceptEdits" : perm,
    model: model === "auto" ? null : model,
    appendSystemPrompt: extra ? `${QUESTIONS_PROMPT}\n\n${extra}` : QUESTIONS_PROMPT,
    // Build necesita ejecutar comandos de desarrollo (install, build, typecheck…).
    allowedTools: build ? BUILD_ALLOWED_TOOLS : null,
  };
}

const MODEL_OPTIONS: Option[] = [
  { value: "auto", label: "Auto", hint: "Modelo por defecto" },
  { value: "opus", label: "Opus", hint: "Máxima capacidad" },
  { value: "sonnet", label: "Sonnet", hint: "Equilibrado" },
  { value: "haiku", label: "Haiku", hint: "Rápido y ligero" },
];

const labelOf = (opts: Option[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

function AtIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 330.001 330.001" className={className} fill="currentColor" aria-hidden="true">
      <path d="M165.001,0c-90.981,0-165,74.018-165,164.997c0,90.983,74.019,165.004,165,165.004c8.284,0,15-6.716,15-15 c0-8.284-6.716-15-15-15c-74.44,0-135-60.563-135-135.004C30,90.56,90.561,30,165.001,30s135,60.56,135,134.997v37.507 c0,12.407-10.096,22.5-22.504,22.5c-12.406,0-22.499-10.093-22.499-22.5v-37.507c0-49.626-40.372-90-89.997-90 c-49.626,0-89.999,40.374-89.999,90c0,49.63,40.373,90.007,89.999,90.007c25.927,0,49.323-11.026,65.762-28.63 c8.706,16.978,26.379,28.63,46.734,28.63c28.951,0,52.504-23.551,52.504-52.5v-37.507C330,74.018,255.982,0,165.001,0z M165.001,225.004c-33.084,0-59.999-26.919-59.999-60.007c0-33.084,26.915-60,59.999-60c33.083,0,59.997,26.916,59.997,60 C224.998,198.085,198.083,225.004,165.001,225.004z" />
    </svg>
  );
}

type Usage = {
  turns: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheCreate: number;
};
const ZERO_USAGE: Usage = {
  turns: 0,
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheRead: 0,
  cacheCreate: 0,
};
const fmtTok = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

export type ResumeReq = {
  id: string;
  file: string;
  nonce: number;
  /** Todas las partes del hilo (modo Auto, reinicios…), de la más antigua a la última. */
  parts?: { id: string; file: string }[];
  /** Clave del hilo en el historial («t:<uuid>» si está registrado). */
  thread?: string;
};

// Mensaje en cola: se envía al terminar el turno actual.
type Queued = { id: number; text: string; attachments: Attachment[]; mentions: string[]; fresh?: boolean; scheduled?: boolean };

function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .filter((b: any) => b?.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("\n");
  return "";
}

function historyToItems(raw: string): { kind: "user" | "assistant" | "tool" | "system"; text: string; name?: string }[] {
  const out: { kind: "user" | "assistant" | "tool" | "system"; text: string; name?: string }[] = [];
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
      out.push({ kind: "system", text: String(v.summary) });
      continue;
    }
    const content = v.message?.content;
    if (content == null) continue;
    if (t === "user") {
      const text = textContent(content);
      if (text.trim()) out.push({ kind: "user", text });
    } else if (t === "assistant") {
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b?.type === "text" && b.text?.trim()) out.push({ kind: "assistant", text: b.text });
          else if (b?.type === "tool_use") out.push({ kind: "tool", text: "", name: b.name });
        }
      } else {
        const text = textContent(content);
        if (text.trim()) out.push({ kind: "assistant", text });
      }
    }
  }
  return out;
}

export default function ChatView({
  sessionId,
  cwd,
  resume,
  newChat,
}: {
  sessionId: string;
  cwd: string;
  resume?: ResumeReq | null;
  /** Cambia (nonce) para empezar una conversación nueva desde cero. */
  newChat?: number;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Peticiones desde otras vistas (p.ej. el tablero .tasks). Con `send` se envían
  // directamente (cambiando antes de modo si se pide `mode`); si no, o si claude está
  // ocupado, se cargan en el input.
  const latest = useRef<{
    busy: boolean;
    perm: string;
    model: string;
    send: (t?: string) => Promise<void>;
    applySettings: (p: string, m: string) => Promise<void>;
    enqueue: (q: Omit<Queued, "id">) => void;
    sendQueued: (id: number) => Promise<void>;
  } | null>(null);
  useEffect(() => {
    const h = async (e: Event) => {
      const d = (
        e as CustomEvent<{
          sessionId: string;
          text: string;
          send?: boolean;
          mode?: string;
          fresh?: boolean; // reiniciar la sesión (contexto nuevo) antes de enviar
          ifIdle?: boolean; // si claude está ocupado, no hacer nada
          queue?: boolean; // si claude está ocupado, ponerlo en la cola
        }>
      ).detail;
      if (d?.sessionId !== sessionId) return;
      const L = latest.current;
      if (d.ifIdle && L?.busy) return;
      if (d.send && d.queue && L?.busy) {
        L.enqueue({ text: d.text, attachments: [], mentions: [], fresh: d.fresh, scheduled: true });
        return;
      }
      if (d.send && L && !L.busy) {
        const mode = d.mode ?? L.perm;
        if (mode !== L.perm || d.fresh) {
          setPerm(mode);
          await L.applySettings(mode, L.model);
        }
        await L.send(d.text);
        return;
      }
      setInput(d.text);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(d.text.length, d.text.length);
      });
    };
    window.addEventListener("agentico:chat-prompt", h);
    return () => window.removeEventListener("agentico:chat-prompt", h);
  }, [sessionId]);
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState(() => localStorage.getItem("agentico.chat.perm") || "acceptEdits");
  const [model, setModel] = useState(() => localStorage.getItem("agentico.chat.model") || "auto");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionPos, setMentionPos] = useState<{ left: number; bottom: number } | null>(null);
  const [usage, setUsage] = useState<Usage>(ZERO_USAGE);
  const atRef = useRef<HTMLButtonElement>(null);
  const restartingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const idRef = useRef(0);
  const blockMap = useRef<Record<number, number>>({});
  const toolJson = useRef<Record<number, string>>({});
  const [autoApprove, setAutoApproveState] = useState(loadAutoApprove);
  const autoApproveRef = useRef(autoApprove);
  autoApproveRef.current = autoApprove;
  const setAutoApprove = (on: boolean) => {
    setAutoApproveState(on);
    autoApproveRef.current = on;
    try {
      localStorage.setItem(AUTO_APPROVE_KEY, on ? "on" : "off");
    } catch {
      /* no-op */
    }
  };
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Cola de mensajes: lo que se envía mientras claude trabaja espera aquí y sale, en
  // orden, al terminar cada turno. Detener la pausa (los mensajes se conservan).
  const [queue, setQueueState] = useState<Queued[]>([]);
  const queueRef = useRef<Queued[]>([]);
  const setQueue = (fn: (q: Queued[]) => Queued[]) => {
    queueRef.current = fn(queueRef.current);
    setQueueState(queueRef.current);
  };
  const enqueue = (q: Omit<Queued, "id">) => setQueue((cur) => [...cur, { ...q, id: ++idRef.current }]);
  // Hilo del historial al que pertenecen las sesiones de claude de esta conversación.
  const threadRef = useRef(newThreadId());
  const [showSchedule, setShowSchedule] = useState(false);
  const clockRef = useRef<HTMLButtonElement>(null);
  const emitTurnEnd = (info: { isError?: boolean; hasQuestions?: boolean; stopped?: boolean }) =>
    window.dispatchEvent(new CustomEvent("agentico:chat-turn-end", { detail: { sessionId, ...info } }));
  // Cierra cualquier burbuja que siga "escribiendo" (fin de turno, detener, salida).
  const finishStreaming = () =>
    setMessages((p) =>
      p.some((m) => m.kind === "assistant" && m.streaming)
        ? p.map((m) => (m.kind === "assistant" && m.streaming ? { ...m, streaming: false } : m))
        : p,
    );
  const sessionIdRef = useRef<string | null>(null);

  const newId = () => ++idRef.current;
  const add = (m: Msg) => setMessages((p) => [...p, m]);
  const patch = (id: number, patch: Partial<Msg>) =>
    setMessages((p) => p.map((m) => (m.id === id ? ({ ...m, ...patch } as Msg) : m)));

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    let disposed = false;

    const onStreamEvent = (inner: any) => {
      switch (inner.type) {
        // Cada mensaje del asistente numera sus bloques desde 0 → limpiar el estado
        // del mensaje anterior (si no, un texto en el índice de una herramienta previa
        // se tomaba por herramienta y nunca dejaba de "escribir").
        case "message_start":
          blockMap.current = {};
          toolJson.current = {};
          break;
        case "content_block_start": {
          const idx: number = inner.index;
          const block = inner.content_block;
          if (block.type === "text") {
            const id = newId();
            blockMap.current[idx] = id;
            delete toolJson.current[idx];
            add({ id, kind: "assistant", text: "", streaming: true });
          } else if (block.type === "tool_use") {
            const id = newId();
            blockMap.current[idx] = id;
            toolJson.current[idx] = "";
            add({
              id,
              kind: "tool",
              name: block.name,
              input: {},
              toolUseId: block.id,
              status: "running",
            });
          }
          break;
        }
        case "content_block_delta": {
          const idx: number = inner.index;
          const id = blockMap.current[idx];
          if (id == null) break;
          if (inner.delta?.type === "text_delta") {
            setMessages((p) =>
              p.map((m) =>
                m.id === id && m.kind === "assistant"
                  ? { ...m, text: m.text + inner.delta.text }
                  : m,
              ),
            );
          } else if (inner.delta?.type === "input_json_delta") {
            toolJson.current[idx] = (toolJson.current[idx] ?? "") + (inner.delta.partial_json ?? "");
          }
          break;
        }
        case "content_block_stop": {
          const idx: number = inner.index;
          const id = blockMap.current[idx];
          if (id == null) break;
          const raw = toolJson.current[idx];
          if (raw !== undefined) {
            let parsed: unknown = {};
            try {
              parsed = raw ? JSON.parse(raw) : {};
            } catch {
              parsed = { _raw: raw };
            }
            patch(id, { input: parsed } as Partial<Msg>);
          } else {
            patch(id, { streaming: false } as Partial<Msg>);
          }
          break;
        }
      }
    };

    const handleEvent = (raw: string) => {
      let ev: any;
      try {
        ev = JSON.parse(raw);
      } catch {
        return;
      }
      switch (ev.type) {
        case "system":
          if (ev.subtype === "init") {
            if (ev.session_id) {
              sessionIdRef.current = ev.session_id;
              linkSession(threadRef.current, ev.session_id);
            }
            add({ id: newId(), kind: "system", text: `Sesión lista · ${ev.model ?? "claude"}` });
          }
          break;
        // claude pide permiso para usar una herramienta (canal --permission-prompt-tool stdio)
        case "control_request": {
          const req = ev.request ?? {};
          if (req.subtype === "can_use_tool") {
            const tool = String(req.tool_name ?? "");
            if (autoApproveRef.current && !NEVER_AUTO.has(tool)) {
              // Aprobado sin preguntar; queda una tarjeta compacta como registro.
              add({
                id: newId(),
                kind: "permission",
                requestId: ev.request_id,
                toolName: req.display_name ?? req.tool_name,
                input: req.input,
                description: req.description,
                status: "auto",
              });
              invoke("chat_control_respond", {
                id: sessionId,
                response: {
                  type: "control_response",
                  response: {
                    subtype: "success",
                    request_id: ev.request_id,
                    response: { behavior: "allow", updatedInput: req.input },
                  },
                },
              }).catch(() => {});
              break;
            }
            add({
              id: newId(),
              kind: "permission",
              requestId: ev.request_id,
              toolName: req.display_name ?? req.tool_name,
              input: req.input,
              description: req.description,
              reason: req.decision_reason,
              suggestions: req.permission_suggestions,
              status: "pending",
            });
          } else {
            // Peticiones que la app no maneja: responder error para que claude no se quede esperando.
            invoke("chat_control_respond", {
              id: sessionId,
              response: {
                type: "control_response",
                response: { subtype: "error", request_id: ev.request_id, error: `No soportado: ${req.subtype}` },
              },
            }).catch(() => {});
          }
          break;
        }
        case "stream_event":
          if (ev.event) onStreamEvent(ev.event);
          break;
        case "user": {
          const content = ev.message?.content ?? [];
          for (const block of content) {
            if (block.type === "tool_result") {
              setMessages((p) =>
                p.map((m) =>
                  m.kind === "tool" && m.toolUseId === block.tool_use_id
                    ? {
                        ...m,
                        status: block.is_error ? "error" : "done",
                        result: resultToText(block.content),
                      }
                    : m,
                ),
              );
            }
          }
          break;
        }
        case "result": {
          setBusy(false);
          finishStreaming();
          // Tras pintar el último texto: ¿terminó pidiendo respuestas al usuario?
          setTimeout(() => {
            const last = [...messagesRef.current].reverse().find((m) => m.kind === "assistant");
            const asked = !!last && last.kind === "assistant" && last.text.includes("```questions");
            // Con mensajes en cola sale el siguiente (salvo error o si claude preguntó algo:
            // entonces la cola espera). El fin de turno (modo Auto) se avisa al vaciarse.
            if (queueRef.current.length && !ev.is_error && !asked) {
              void latest.current?.sendQueued(queueRef.current[0].id);
              return;
            }
            emitTurnEnd({ isError: !!ev.is_error, hasQuestions: asked });
          }, 50);
          add({
            id: newId(),
            kind: "result",
            costUsd: ev.total_cost_usd,
            durationMs: ev.duration_ms,
            isError: ev.is_error,
          });
          const u = ev.usage ?? {};
          setUsage((prev) => ({
            turns: prev.turns + 1,
            costUsd: prev.costUsd + (ev.total_cost_usd ?? 0),
            inputTokens: prev.inputTokens + (u.input_tokens ?? 0),
            outputTokens: prev.outputTokens + (u.output_tokens ?? 0),
            cacheRead: prev.cacheRead + (u.cache_read_input_tokens ?? 0),
            cacheCreate: prev.cacheCreate + (u.cache_creation_input_tokens ?? 0),
          }));
          break;
        }
      }
    };

    (async () => {
      const unEvent = await listen<{ id: string; line: string }>("chat://event", (e) => {
        if (e.payload.id === sessionId) handleEvent(e.payload.line);
      });
      const unErr = await listen<{ id: string; line: string }>("chat://stderr", (e) => {
        if (e.payload.id === sessionId && e.payload.line.trim())
          add({ id: newId(), kind: "error", text: e.payload.line });
      });
      const unExit = await listen<{ id: string }>("chat://exit", (e) => {
        if (e.payload.id !== sessionId) return;
        finishStreaming();
        if (restartingRef.current) {
          restartingRef.current = false;
          return;
        }
        setBusy(false);
        add({ id: newId(), kind: "system", text: "La sesión de chat terminó." });
      });
      if (disposed) {
        unEvent();
        unErr();
        unExit();
        return;
      }
      unlisteners.push(unEvent, unErr, unExit);
      try {
        await invoke("chat_start", {
          id: sessionId,
          cwd,
          ...startOpts(perm, model),
        });
      } catch (err) {
        add({ id: newId(), kind: "error", text: `No se pudo iniciar el chat: ${err}` });
      }
    })();

    return () => {
      disposed = true;
      unlisteners.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Autoscroll solo si el usuario está pegado al final; si subió a leer, no se le mueve
  // y aparece el botón «bajar». Scroll instantáneo: un smooth dispara eventos a medio
  // camino que se confundirían con un scroll del usuario.
  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setAtBottom(true);
    el.scrollTop = el.scrollHeight;
  };
  const onChatScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickRef.current = near;
    setAtBottom(near);
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  // Retomar una conversación antigua: precarga el transcript y reinicia la
  // sesión de claude con --resume (continúa el contexto del lado del CLI).
  useEffect(() => {
    if (!resume) return;
    stickRef.current = true;
    setAtBottom(true);
    (async () => {
      restartingRef.current = true;
      setBusy(false);
      setUsage(ZERO_USAGE);
      setQueue(() => []);
      // Las sesiones nuevas que salgan de aquí siguen en el mismo hilo del historial.
      const parts = resume.parts?.length ? resume.parts : [{ id: resume.id, file: resume.file }];
      threadRef.current = resume.thread?.startsWith("t:") ? resume.thread.slice(2) : newThreadId();
      for (const p of parts) linkSession(threadRef.current, p.id);
      try {
        let raw = "";
        for (const p of parts) raw += (await invoke<string>("chat_session_read", { file: p.file }).catch(() => "")) + "\n";
        setMessages(
          historyToItems(raw).map((it): Msg => {
            if (it.kind === "user") return { id: newId(), kind: "user", text: it.text };
            if (it.kind === "assistant")
              return { id: newId(), kind: "assistant", text: it.text, streaming: false };
            if (it.kind === "tool")
              return { id: newId(), kind: "tool", name: it.name ?? "tool", input: {}, toolUseId: "", status: "done" };
            return { id: newId(), kind: "system", text: it.text };
          }),
        );
      } catch {
        setMessages([]);
      }
      try {
        await invoke("chat_start", {
          id: sessionId,
          cwd,
          ...startOpts(perm, model),
          resume: resume.id,
        });
        add({ id: newId(), kind: "system", text: "Conversación retomada · contexto continuado" });
      } catch (err) {
        restartingRef.current = false;
        add({ id: newId(), kind: "error", text: `No se pudo retomar: ${err}` });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume?.nonce]);

  // Conversación nueva: vacía el chat y arranca claude sin --resume (contexto limpio). La
  // anterior queda en el historial y se puede retomar.
  useEffect(() => {
    if (!newChat) return;
    (async () => {
      restartingRef.current = true;
      setBusy(false);
      finishStreaming();
      setMessages([]);
      setUsage(ZERO_USAGE);
      setInput("");
      setAttachments([]);
      setMentions([]);
      setQueue(() => []);
      sessionIdRef.current = null;
      threadRef.current = newThreadId();
      try {
        await invoke("chat_kill", { id: sessionId }).catch(() => {});
        await invoke("chat_start", { id: sessionId, cwd, ...startOpts(perm, model) });
      } catch (err) {
        restartingRef.current = false;
        add({ id: newId(), kind: "error", text: `No se pudo empezar un chat nuevo: ${err}` });
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newChat]);

  const toggleMention = (f: string) =>
    setMentions((m) => (m.includes(f) ? m.filter((x) => x !== f) : [...m, f]));

  // `override`: envía ese texto (p.ej. respuestas de una tarjeta de preguntas) sin
  // tocar lo que el usuario tenga escrito/adjuntado en el composer.
  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    const imgs = override != null ? [] : attachments;
    const mn = override != null ? [] : mentions;
    if (!text && imgs.length === 0 && mn.length === 0) return;
    if (override == null) {
      setInput("");
      setAttachments([]);
      setMentions([]);
    }
    // Claude ocupado → a la cola; sale sola al terminar el turno.
    if (busy) {
      enqueue({ text, attachments: imgs, mentions: mn });
      return;
    }
    await dispatch(text, imgs, mn);
  };

  const dispatch = async (text: string, imgs: Attachment[], mn: string[]) => {
    stickRef.current = true; // al enviar, volver a seguir la respuesta
    setAtBottom(true);
    add({
      id: newId(),
      kind: "user",
      text,
      images: imgs.length ? imgs.map((a) => a.dataUrl) : undefined,
      mentions: mn.length ? mn : undefined,
    });
    setBusy(true);
    const prefix = mn.length
      ? `Trabaja sobre estos archivos:\n${mn.map((m) => `@${m}`).join("\n")}\n\n`
      : "";
    try {
      await invoke("chat_send", {
        id: sessionId,
        text: prefix + text,
        images: imgs.map((a) => ({ media_type: a.mediaType, data: a.data })),
      });
    } catch (err) {
      setBusy(false);
      add({ id: newId(), kind: "error", text: `Error al enviar: ${err}` });
    }
  };

  const stop = async () => {
    restartingRef.current = true;
    setBusy(false);
    finishStreaming();
    emitTurnEnd({ stopped: true });
    setMessages((p) =>
      p.map((m) =>
        m.kind === "tool" && m.status === "running"
          ? { ...m, status: "error" }
          : m.kind === "permission" && m.status === "pending"
            ? { ...m, status: "cancelled" }
            : m,
      ),
    );
    add({ id: newId(), kind: "system", text: "Detenido por el usuario" });
    try {
      await invoke("chat_kill", { id: sessionId });
      await invoke("chat_start", {
        id: sessionId,
        cwd,
        ...startOpts(perm, model),
        resume: sessionIdRef.current ?? undefined,
      });
    } catch (err) {
      restartingRef.current = false;
      add({ id: newId(), kind: "error", text: `No se pudo detener: ${err}` });
    }
  };

  const attachImages = async () => {
    const sel = await open({
      multiple: true,
      filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    });
    if (!sel) return;
    const paths = Array.isArray(sel) ? sel : [sel];
    for (const p of paths) {
      try {
        const img = await invoke<{ media_type: string; data: string }>("read_image", { path: p });
        setAttachments((a) => [
          ...a,
          { mediaType: img.media_type, data: img.data, dataUrl: `data:${img.media_type};base64,${img.data}` },
        ]);
      } catch {
        /* formato no soportado */
      }
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith("image/")) {
        const file = it.getAsFile();
        if (!file) continue;
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          const url = String(reader.result);
          const m = url.match(/^data:(.*?);base64,(.*)$/);
          if (m) setAttachments((a) => [...a, { mediaType: m[1], data: m[2], dataUrl: url }]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const answerPermission = async (msgId: number, decision: PermissionDecision): Promise<void> => {
    const m = messagesRef.current.find((x) => x.id === msgId);
    if (!m || m.kind !== "permission" || m.status !== "pending") return;
    if (decision === "auto") {
      // Activa el modo y aprueba también las demás tarjetas pendientes.
      setAutoApprove(true);
      const pending = messagesRef.current.filter(
        (x) => x.kind === "permission" && x.status === "pending" && x.id !== msgId && !NEVER_AUTO.has(x.toolName),
      );
      for (const x of pending) await answerPermission(x.id, "allow");
    }
    const response =
      decision === "deny"
        ? { behavior: "deny", message: "El usuario denegó el permiso." }
        : {
            behavior: "allow",
            updatedInput: m.input,
            // «Siempre»: claude guarda la regla sugerida (p.ej. en .claude/settings.local.json)
            ...(decision === "always" && m.suggestions?.length ? { updatedPermissions: m.suggestions } : {}),
          };
    setMessages((p) =>
      p.map((x) =>
        x.id === msgId && x.kind === "permission"
          ? { ...x, status: decision === "deny" ? "denied" : decision === "always" ? "always" : decision === "auto" ? "auto" : "allowed" }
          : x,
      ),
    );
    try {
      await invoke("chat_control_respond", {
        id: sessionId,
        response: { type: "control_response", response: { subtype: "success", request_id: m.requestId, response } },
      });
    } catch (err) {
      add({ id: newId(), kind: "error", text: `No se pudo responder el permiso: ${err}` });
    }
  };

  const removeAttachment = (idx: number) =>
    setAttachments((a) => a.filter((_, i) => i !== idx));

  const applySettings = async (nextPerm: string, nextModel: string): Promise<void> => {
    restartingRef.current = true;
    setBusy(false);
    setUsage(ZERO_USAGE);
    try {
      await invoke("chat_start", {
        id: sessionId,
        cwd,
        ...startOpts(nextPerm, nextModel),
      });
      add({
        id: newId(),
        kind: "system",
        text: `Reiniciado · ${labelOf(PERM_OPTIONS, nextPerm)} · ${labelOf(
          MODEL_OPTIONS,
          nextModel,
        )} · contexto nuevo`,
      });
    } catch (err) {
      restartingRef.current = false;
      add({ id: newId(), kind: "error", text: `No se pudo reiniciar: ${err}` });
    }
  };

  // Saca un mensaje de la cola y lo envía (al terminar un turno o con «Enviar ahora»).
  const sendQueued = async (id: number) => {
    const q = queueRef.current.find((x) => x.id === id);
    if (!q) return;
    setQueue((cur) => cur.filter((x) => x.id !== id));
    if (q.fresh) await applySettings(perm, model);
    await dispatch(q.text, q.attachments, q.mentions);
  };

  // Devuelve un mensaje de la cola al composer para editarlo.
  const editQueued = (id: number) => {
    const q = queueRef.current.find((x) => x.id === id);
    if (!q) return;
    setQueue((cur) => cur.filter((x) => x.id !== id));
    setInput(q.text);
    setAttachments(q.attachments);
    setMentions(q.mentions);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  latest.current = { busy, perm, model, send, applySettings, enqueue, sendQueued };

  // Prompts programados: se revisan cada 15 s mientras el proyecto está abierto. Con claude
  // ocupado van a la cola. Los que vencieron hace más de MISSED_MS (app cerrada, equipo
  // suspendido) no se envían solos: quedan «perdidos» para decidir.
  const scheduled = useScheduled(sessionId);
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const s of getScheduled(sessionId)) {
        if (s.missed || s.at > now) continue;
        if (now - s.at > MISSED_MS) {
          const nx = nextRun(s, now);
          if (nx) patchScheduled(sessionId, s.id, { at: nx });
          else patchScheduled(sessionId, s.id, { missed: true });
          if (nx) add({ id: newId(), kind: "system", text: `Programado omitido (la app no estaba abierta): «${s.text.slice(0, 60)}»` });
          continue;
        }
        fireScheduled(s.id);
      }
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const fireScheduled = (id: string) => {
    const s = getScheduled(sessionId).find((x) => x.id === id);
    if (!s) return;
    const nx = nextRun(s);
    if (nx) patchScheduled(sessionId, id, { at: nx, missed: false });
    else removeScheduled(sessionId, id);
    add({ id: newId(), kind: "system", text: `⏰ Prompt programado${s.repeat !== "none" ? ` (${REPEAT_LABEL[s.repeat].toLowerCase()})` : ""}` });
    window.dispatchEvent(
      new CustomEvent("agentico:chat-prompt", {
        detail: { sessionId, text: s.text, send: true, queue: true, fresh: s.fresh },
      }),
    );
  };

  // Las tarjetas de preguntas anteriores al último mensaje del usuario ya no se pueden responder.
  const lastUserIdx = messages.reduce((acc, m, i) => (m.kind === "user" ? i : acc), -1);
  const streamingActive = messages.some((m) => m.kind === "assistant" && m.streaming);
  const runningTool = messages.find((m) => m.kind === "tool" && m.status === "running") as
    | Extract<Msg, { kind: "tool" }>
    | undefined;
  const orbState = runningTool ? "searching" : "working";
  const waitingPermission = messages.some((m) => m.kind === "permission" && m.status === "pending");
  const statusText = waitingPermission
    ? "Esperando tu permiso…"
    : runningTool
    ? `Ejecutando ${runningTool.name}…`
    : streamingActive
      ? "Generando respuesta…"
      : "Pensando…";

  // ── Control remoto: el teléfono ve una instantánea del chat y manda acciones ──
  const remote = useRemote();
  const remoteOn = !!remote?.running;
  const snapRef = useRef<() => unknown>(() => null);
  snapRef.current = () => ({
    busy,
    status: statusText,
    perm: labelOf(PERM_OPTIONS, perm),
    model: labelOf(MODEL_OPTIONS, model),
    messages: messages.slice(-150).map(toRemoteMsg),
    queue: queue.map((q) => ({ id: q.id, text: q.text || "(imagen)" })),
    scheduled: scheduled.map((s) => ({ id: s.id, text: s.text, at: s.at, repeat: s.repeat, missed: !!s.missed })),
  });
  const pubTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!remoteOn || pubTimer.current != null) return;
    // Agrupa los cambios del streaming: como mucho ~4 envíos por segundo.
    pubTimer.current = window.setTimeout(() => {
      pubTimer.current = null;
      invoke("remote_publish", { id: sessionId, snapshot: snapRef.current() }).catch(() => {});
    }, 250);
  }, [remoteOn, messages, busy, queue, scheduled, perm, model, sessionId]);

  const remoteActs = useRef({ send, stop, answerPermission, sendQueued, setQueue, fireScheduled });
  remoteActs.current = { send, stop, answerPermission, sendQueued, setQueue, fireScheduled };
  useEffect(() => {
    let un: UnlistenFn | null = null;
    let disposed = false;
    listen<{ id: string; action: any }>("remote://action", (e) => {
      if (e.payload.id !== sessionId) return;
      const a = e.payload.action ?? {};
      const R = remoteActs.current;
      switch (a.type) {
        case "send":
          if (typeof a.text === "string" && a.text.trim()) void R.send(a.text);
          break;
        case "stop":
          if (latest.current?.busy) void R.stop();
          break;
        case "permission":
          if (["allow", "always", "deny"].includes(a.decision)) void R.answerPermission(Number(a.msgId), a.decision);
          break;
        case "queue-remove":
          R.setQueue((cur) => cur.filter((x) => x.id !== Number(a.qid)));
          break;
        case "queue-send":
          if (!latest.current?.busy) void R.sendQueued(Number(a.qid));
          break;
        case "schedule-run":
          R.fireScheduled(String(a.sid));
          break;
      }
    }).then((fn) => (disposed ? fn() : (un = fn)));
    return () => {
      disposed = true;
      un?.();
    };
  }, [sessionId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <UsageBar usage={usage} />
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onChatScroll}
        // [&>*]:shrink-0 → los mensajes nunca se encogen al llenarse el chat (los chips de
        // herramienta tienen overflow-hidden ⇒ min-height 0 y flexbox los aplastaba).
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 [&>*]:shrink-0"
      >
        {messages.length === 0 && (
          <div className="m-auto flex w-full max-w-sm flex-col items-center gap-3 text-center text-sm text-zinc-500">
            <ThinkingOrb state="breathing" size={64} theme="dark" />
            {perm === AGENTICO_PLAN ? (
              <div className="flex flex-col gap-1">
                <span className="font-medium text-indigo-300">Modo Agentico Plan</span>
                <span className="text-xs text-zinc-500">
                  Describe tu idea: Claude crea <code className="text-zinc-400">plan/PLAN.md</code>, diagramas
                  editables y un tablero de tareas, y luego lo construye tarea por tarea.
                </span>
              </div>
            ) : (
              "Pídele algo a claude sobre este proyecto."
            )}
            <div className="mt-2 flex w-full flex-col gap-1.5">
              {(perm === AGENTICO_PLAN ? PLAN_EXAMPLE_PROMPTS : EXAMPLE_PROMPTS).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setInput(p);
                    requestAnimationFrame(() => {
                      const el = inputRef.current;
                      if (!el) return;
                      el.focus();
                      el.setSelectionRange(p.length, p.length);
                    });
                  }}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left text-xs text-zinc-400 transition-colors hover:border-indigo-500/50 hover:bg-zinc-800/60 hover:text-zinc-200"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble
            key={m.id}
            msg={m}
            locked={busy || i < lastUserIdx}
            onAnswer={(t) => send(t)}
            onPermission={(d) => answerPermission(m.id, d)}
          />
        ))}
        {busy && (
          <div className="flex items-center gap-2 self-start rounded-full bg-zinc-800/60 px-3 py-1 text-xs text-zinc-300">
            <ThinkingOrb state={orbState} size={20} theme="dark" />
            <span>{statusText}</span>
            <span className="inline-flex gap-0.5">
              <span className="size-1 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s]" />
              <span className="size-1 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s]" />
              <span className="size-1 animate-bounce rounded-full bg-zinc-500" />
            </span>
          </div>
        )}
      </div>
      {!atBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          title="Ir al final"
          className="absolute right-4 bottom-3 flex size-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/90 text-zinc-300 shadow-lg backdrop-blur transition-colors hover:border-indigo-500/60 hover:text-white"
        >
          <HugeiconsIcon icon={ArrowDown02Icon} size={18} />
          {busy && <span className="absolute -top-0.5 -right-0.5 size-2.5 animate-pulse rounded-full bg-indigo-400" />}
        </button>
      )}
      </div>

      <div className="p-3">
        {(queue.length > 0 || scheduled.length > 0) && (
          <div className="mb-2 flex flex-col gap-1">
            {queue.map((q, i) => (
              <div
                key={q.id}
                className="group flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs"
              >
                <span className="shrink-0 rounded bg-indigo-500/15 px-1.5 text-[10px] font-medium text-indigo-300">
                  {i === 0 && busy ? "Siguiente" : `En cola ${i + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => editQueued(q.id)}
                  title="Editar (vuelve al cuadro de texto)"
                  className="min-w-0 flex-1 truncate text-left text-zinc-300 hover:text-zinc-100"
                >
                  {q.scheduled && <HugeiconsIcon icon={Clock01Icon} size={11} className="mr-1 inline text-amber-400" />}
                  {q.text || `(${q.attachments.length} imagen/es)`}
                </button>
                {!busy && (
                  <button
                    type="button"
                    onClick={() => sendQueued(q.id)}
                    title="Enviar ahora"
                    className="flex size-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-emerald-400"
                  >
                    <HugeiconsIcon icon={PlayIcon} size={11} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setQueue((cur) => cur.filter((x) => x.id !== q.id))}
                  title="Quitar de la cola"
                  className="flex size-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={11} />
                </button>
              </div>
            ))}
            {!busy && queue.length > 0 && (
              <div className="px-1 text-[10px] text-zinc-600">
                Cola en pausa · pulsa ▶ para enviar o escribe un mensaje nuevo
              </div>
            )}
            {scheduled.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSchedule(true)}
                className="flex items-center gap-1.5 self-start rounded-full px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300"
              >
                <HugeiconsIcon icon={Clock01Icon} size={12} className="text-amber-400" />
                {scheduled.length} programado{scheduled.length > 1 ? "s" : ""}
                {scheduled.some((s) => s.missed) ? (
                  <span className="text-red-400">· hay perdidos</span>
                ) : (
                  <span>· próximo {fmtWhen(Math.min(...scheduled.map((s) => s.at)))}</span>
                )}
              </button>
            )}
          </div>
        )}
        <BorderBeam
          size="md"
          colorVariant="colorful"
          strength={0.6}
          active
          theme="dark"
          className="block"
        >
          <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-[#1a1a1a] p-3 focus-within:border-zinc-700">
            <div className="flex items-center gap-1">
              <button
                ref={atRef}
                type="button"
                onClick={() => {
                  const r = atRef.current?.getBoundingClientRect();
                  if (r) setMentionPos({ left: r.left, bottom: window.innerHeight - r.top + 8 });
                  setMentionOpen((o) => !o);
                }}
                aria-label="Mencionar archivos"
                className={cn(
                  "flex size-7 items-center justify-center rounded-full transition-colors",
                  mentions.length || mentionOpen
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                )}
              >
                <AtIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={attachImages}
                aria-label="Adjuntar imagen"
                className="flex size-7 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                <HugeiconsIcon icon={ImageAdd01Icon} size={16} />
              </button>
              <button
                ref={clockRef}
                type="button"
                onClick={() => setShowSchedule((o) => !o)}
                aria-label="Programar prompt"
                title="Programar un prompt para más tarde"
                className={cn(
                  "flex size-7 items-center justify-center rounded-full transition-colors",
                  showSchedule
                    ? "bg-amber-500/20 text-amber-300"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                )}
              >
                <HugeiconsIcon icon={Clock01Icon} size={16} />
              </button>
            </div>

            {mentions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {mentions.map((f) => (
                  <span
                    key={f}
                    title={f}
                    className="flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-200"
                  >
                    @{f.split("/").pop()}
                    <button
                      type="button"
                      onClick={() => toggleMention(f)}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <div
                    key={i}
                    className="relative size-14 overflow-hidden rounded-lg border border-zinc-700"
                  >
                    <img src={a.dataUrl} alt="" className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      aria-label="Quitar imagen"
                      className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-bl bg-black/70 text-white"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              ref={inputRef}
              value={input}
              placeholder={
                busy
                  ? "Escribe el siguiente mensaje: Enter lo pone en cola…"
                  : "Pide cualquier cosa…  (pega una imagen con Ctrl+V)"
              }
              onChange={(e) => setInput(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              className="max-h-48 min-h-[44px] w-full resize-none bg-transparent px-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PillSelect
                  value={perm}
                  options={PERM_OPTIONS}
                  onChange={(v) => {
                    setPerm(v);
                    applySettings(v, model);
                  }}
                />
                <PillSelect
                  value={model}
                  options={MODEL_OPTIONS}
                  onChange={(v) => {
                    setModel(v);
                    applySettings(perm, v);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setAutoApprove(!autoApprove)}
                  title={
                    autoApprove
                      ? "Auto-permitir activado: Claude no te pide permiso para comandos ni archivos. Clic para volver a preguntar."
                      : "Aprobar automáticamente todos los permisos (comandos, archivos…) sin preguntar"
                  }
                  className={cn(
                    "flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] transition-colors",
                    autoApprove
                      ? "border-amber-500/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                      : "border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300",
                  )}
                >
                  <HugeiconsIcon icon={ShieldKeyIcon} size={12} />
                  {autoApprove ? "Auto-permitir" : "Preguntar"}
                </button>
              </div>
              {busy ? (
                <div className="flex items-center gap-1.5">
                {(input.trim() || attachments.length > 0) && (
                  <button
                    type="button"
                    onClick={() => send()}
                    title="Añadir a la cola (se envía al terminar el turno) · Enter"
                    className="flex h-8 items-center gap-1 rounded-full bg-indigo-600 px-3 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    <HugeiconsIcon icon={TaskAdd01Icon} size={14} /> A la cola
                  </button>
                )}
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Detener"
                  title="Detener (preserva el contexto)"
                  className="flex size-8 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-500"
                >
                  <HugeiconsIcon icon={StopIcon} size={15} />
                </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => send()}
                  disabled={!input.trim() && attachments.length === 0}
                  aria-label="Enviar"
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full transition-colors",
                    input.trim() || attachments.length > 0
                      ? "bg-white text-black hover:bg-zinc-200"
                      : "cursor-default bg-zinc-700/60 text-zinc-500",
                  )}
                >
                  <HugeiconsIcon icon={ArrowUp01Icon} size={16} />
                </button>
              )}
            </div>
          </div>
        </BorderBeam>
      </div>

      {mentionOpen && mentionPos && (
        <MentionPicker
          cwd={cwd}
          pos={mentionPos}
          selected={mentions}
          anchor={atRef.current}
          onToggle={toggleMention}
          onClose={() => setMentionOpen(false)}
        />
      )}
      {showSchedule && (
        <SchedulePopover
          project={sessionId}
          anchor={clockRef.current}
          draft={input}
          onScheduled={() => setInput("")}
          onRunNow={fireScheduled}
          onClose={() => setShowSchedule(false)}
        />
      )}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function SchedulePopover({
  project,
  anchor,
  draft,
  onScheduled,
  onRunNow,
  onClose,
}: {
  project: string;
  anchor: HTMLElement | null;
  draft: string;
  onScheduled: () => void;
  onRunNow: (id: string) => void;
  onClose: () => void;
}) {
  const list = useScheduled(project);
  const [text, setText] = useState(draft);
  const [at, setAt] = useState(() => toLocalInput(Date.now() + 30 * 60_000));
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [fresh, setFresh] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const r = anchor?.getBoundingClientRect();
  const pos = r ? { left: r.left, bottom: window.innerHeight - r.top + 8 } : { left: 16, bottom: 120 };

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [anchor, onClose]);

  const tomorrow9 = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
  };
  const quick = [
    { label: "En 30 min", at: () => Date.now() + 30 * 60_000 },
    { label: "En 1 h", at: () => Date.now() + 3600_000 },
    { label: "En 3 h", at: () => Date.now() + 3 * 3600_000 },
    { label: "Mañana 9:00", at: tomorrow9 },
  ];
  const atMs = new Date(at).getTime();
  const valid = text.trim() && Number.isFinite(atMs) && atMs > Date.now();

  const submit = () => {
    if (!valid) return;
    addScheduled(project, { text: text.trim(), at: atMs, repeat, fresh });
    if (text.trim() === draft.trim()) onScheduled();
    setText("");
  };

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", left: pos.left, bottom: pos.bottom }}
      className="z-50 flex max-h-[70vh] w-[340px] flex-col gap-2 overflow-auto rounded-xl border border-zinc-800 bg-[#1a1a1a] p-3 shadow-xl shadow-black/50"
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
        <HugeiconsIcon icon={Clock01Icon} size={14} className="text-amber-400" /> Programar prompt
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="¿Qué debe hacer Claude a esa hora?"
        className="w-full resize-none rounded-lg border border-zinc-800 bg-[#141414] px-2.5 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-700"
      />
      <div className="flex flex-wrap gap-1">
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => setAt(toLocalInput(q.at()))}
            className="rounded-full border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
          >
            {q.label}
          </button>
        ))}
      </div>
      <input
        type="datetime-local"
        value={at}
        onChange={(e) => setAt(e.target.value)}
        className="rounded-lg border border-zinc-800 bg-[#141414] px-2.5 py-1.5 text-xs text-zinc-200 outline-none [color-scheme:dark] focus:border-zinc-700"
      />
      <div className="flex flex-wrap gap-1">
        {(Object.keys(REPEAT_LABEL) as Repeat[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setRepeat(k)}
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] transition-colors",
              repeat === k ? "bg-indigo-600 text-white" : "bg-zinc-800/70 text-zinc-400 hover:text-zinc-200",
            )}
          >
            {REPEAT_LABEL[k]}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[11px] text-zinc-400">
        <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} className="accent-indigo-500" />
        Empezar con contexto nuevo (ahorra tokens)
      </label>
      <button
        type="button"
        disabled={!valid}
        onClick={submit}
        className="rounded-lg bg-white py-1.5 text-xs font-medium text-black hover:bg-zinc-200 disabled:cursor-default disabled:bg-zinc-700/60 disabled:text-zinc-500"
      >
        {Number.isFinite(atMs) && atMs <= Date.now() ? "Elige una hora futura" : `Programar · ${valid ? fmtWhen(atMs) : ""}`}
      </button>
      <div className="text-[10px] leading-snug text-zinc-600">
        Agentico debe estar abierto a esa hora. Si Claude está trabajando, el prompt entra en la cola.
      </div>

      {list.length > 0 && (
        <div className="mt-1 flex flex-col gap-1 border-t border-zinc-800 pt-2">
          {list.map((s) => (
            <div key={s.id} className="group flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-zinc-800/50">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-zinc-200" title={s.text}>
                  {s.text}
                </div>
                <div className={cn("flex items-center gap-1 text-[10px]", s.missed ? "text-red-400" : "text-zinc-500")}>
                  {s.missed ? `Perdido · era ${fmtWhen(s.at)}` : fmtWhen(s.at)}
                  {s.repeat !== "none" && (
                    <span className="flex items-center gap-0.5 text-indigo-300">
                      <HugeiconsIcon icon={RepeatIcon} size={10} /> {REPEAT_LABEL[s.repeat]}
                    </span>
                  )}
                  {s.fresh && <span className="text-zinc-600">· contexto nuevo</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRunNow(s.id)}
                title="Ejecutar ahora"
                className="flex size-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-emerald-400"
              >
                <HugeiconsIcon icon={PlayIcon} size={12} />
              </button>
              <button
                type="button"
                onClick={() => removeScheduled(project, s.id)}
                title="Eliminar"
                className="flex size-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
              >
                <HugeiconsIcon icon={Delete02Icon} size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

// Resumen de una herramienta en una línea (lo más útil de su input).
function toolDetail(input: any): string {
  if (!input || typeof input !== "object") return "";
  const v = input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.description;
  if (typeof v === "string") return v.slice(0, 200);
  try {
    return JSON.stringify(input).slice(0, 200);
  } catch {
    return "";
  }
}

// Mensaje del chat → forma ligera que se manda al teléfono (sin imágenes en base64).
function toRemoteMsg(m: Msg) {
  switch (m.kind) {
    case "user":
      return { id: m.id, k: "user", text: m.text, images: m.images?.length || undefined };
    case "assistant":
      return { id: m.id, k: "assistant", text: m.text, streaming: m.streaming };
    case "tool":
      return { id: m.id, k: "tool", name: m.name, status: m.status, detail: toolDetail(m.input), result: m.result?.slice(0, 1500) };
    case "permission":
      return {
        id: m.id,
        k: "permission",
        name: m.toolName,
        status: m.status,
        description: m.description,
        detail: toolDetail(m.input),
        canAlways: !!m.suggestions?.length,
      };
    case "result":
      return { id: m.id, k: "result", isError: !!m.isError, durationMs: m.durationMs };
    default:
      return { id: m.id, k: m.kind, text: m.text };
  }
}

function UsageBar({ usage }: { usage: Usage }) {
  const [open, setOpen] = useState(false);
  if (usage.turns === 0) return null;
  return (
    <div className="shrink-0 border-b border-zinc-800/60 bg-[#141414]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Uso de la sesión (clic para detalle)"
        className="flex w-full items-center gap-3 px-4 py-1.5 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <span className="font-medium text-zinc-300">${usage.costUsd.toFixed(4)}</span>
        <span className="flex items-center gap-0.5" title="Tokens de entrada">
          <HugeiconsIcon icon={ArrowUp01Icon} size={11} /> {fmtTok(usage.inputTokens)}
        </span>
        <span className="flex items-center gap-0.5" title="Tokens de salida">
          <HugeiconsIcon icon={ArrowDown01Icon} size={11} /> {fmtTok(usage.outputTokens)}
        </span>
        <span className="ml-auto text-zinc-600">
          {usage.turns} {usage.turns === 1 ? "turno" : "turnos"}
        </span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800/60 px-4 py-2 text-[11px]">
          <Stat label="Costo" value={`$${usage.costUsd.toFixed(4)}`} />
          <Stat label="Entrada" value={fmtTok(usage.inputTokens)} />
          <Stat label="Salida" value={fmtTok(usage.outputTokens)} />
          <Stat label="Caché lectura" value={fmtTok(usage.cacheRead)} />
          <Stat label="Caché escritura" value={fmtTok(usage.cacheCreate)} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-zinc-600">{label}:</span>
      <span className="text-zinc-300">{value}</span>
    </span>
  );
}

function MentionPicker({
  cwd,
  pos,
  selected,
  anchor,
  onToggle,
  onClose,
}: {
  cwd: string;
  pos: { left: number; bottom: number };
  selected: string[];
  anchor: HTMLElement | null;
  onToggle: (f: string) => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<string[] | null>(null);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<string[]>("fs_list_all", { path: cwd })
      .then(setFiles)
      .catch(() => setFiles([]));
  }, [cwd]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [anchor, onClose]);

  const filtered = (files ?? [])
    .filter((f) => f.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 120);

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", left: pos.left, bottom: pos.bottom }}
      className="z-50 flex max-h-80 w-80 flex-col rounded-lg border border-zinc-800 bg-[#1a1a1a] shadow-xl shadow-black/50"
    >
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar archivo…"
        spellCheck={false}
        className="shrink-0 border-b border-zinc-800 bg-transparent px-3 py-2 text-xs text-zinc-100 outline-none"
      />
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {files === null ? (
          <div className="p-2 text-[11px] text-zinc-600">cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-2 text-[11px] text-zinc-600">sin resultados</div>
        ) : (
          filtered.map((f) => {
            const sel = selected.includes(f);
            const { icon, color } = fileIcon(f.split("/").pop() ?? f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => onToggle(f)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs",
                  sel ? "bg-indigo-600/20 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800",
                )}
              >
                <HugeiconsIcon icon={icon} size={12} className={cn("shrink-0", color)} />
                <span className="truncate">{f}</span>
                {sel && (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    size={12}
                    className="ml-auto shrink-0 text-indigo-400"
                  />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body,
  );
}

function PillSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Option[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const current = options.find((o) => o.value === value) ?? options[0];

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // Posición fija anclada encima del botón → el menú vive en un portal a
      // <body>, así no lo recorta el contenedor del BorderBeam.
      setPos({ left: r.left, bottom: window.innerHeight - r.top + 6 });
    }
    setOpen((o) => !o);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="flex items-center gap-1 rounded-full bg-zinc-800/70 px-3 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700/70"
      >
        {current.label}
        <HugeiconsIcon icon={ArrowDown01Icon} size={12} className="text-zinc-500" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", left: pos.left, bottom: pos.bottom }}
            className="z-50 min-w-[190px] rounded-lg border border-zinc-800 bg-[#1a1a1a] p-1 shadow-xl shadow-black/50"
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (o.value !== value) onChange(o.value);
                }}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-800"
              >
                <div className="flex-1">
                  <div className="text-xs text-zinc-200">{o.label}</div>
                  <div className="text-[10px] text-zinc-500">{o.hint}</div>
                </div>
                {o.value === value && (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    size={14}
                    className="mt-0.5 shrink-0 text-indigo-400"
                  />
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function Bubble({
  msg,
  locked,
  onAnswer,
  onPermission,
}: {
  msg: Msg;
  locked: boolean;
  onAnswer: (text: string) => void;
  onPermission: (d: PermissionDecision) => void;
}) {
  switch (msg.kind) {
    case "user":
      return (
        <div className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-indigo-600 px-3.5 py-2 text-sm text-white">
          {msg.images && msg.images.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {msg.images.map((src, i) => (
                <img key={i} src={src} alt="" className="max-h-44 rounded-lg" />
              ))}
            </div>
          )}
          {msg.mentions && msg.mentions.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1">
              {msg.mentions.map((f, i) => (
                <span key={i} title={f} className="rounded bg-white/15 px-1.5 py-0.5 text-[10px]">
                  @{f.split("/").pop()}
                </span>
              ))}
            </div>
          )}
          {msg.text && <div className="whitespace-pre-wrap break-words">{msg.text}</div>}
        </div>
      );
    case "assistant":
      // No renderizamos burbujas vacías (bloques de texto sin contenido que
      // claude emite alrededor de las llamadas a herramientas).
      if (!msg.text.trim() && !msg.streaming) return null;
      return (
        <div className="max-w-[88%] self-start rounded-2xl rounded-bl-sm border border-zinc-800 bg-zinc-800/50 px-3.5 py-2 text-sm text-zinc-100">
          {splitQuestions(msg.text).map((seg, i) =>
            seg.kind === "md" ? (
              seg.text.trim() ? (
                <div key={i} className="md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.text}</ReactMarkdown>
                </div>
              ) : null
            ) : !seg.complete ? (
              <QuestionsPending key={i} />
            ) : seg.questions ? (
              <QuestionsCard key={i} questions={seg.questions} locked={locked} onSubmit={onAnswer} />
            ) : (
              <pre key={i} className="whitespace-pre-wrap text-xs text-zinc-400">
                {seg.raw}
              </pre>
            ),
          )}
          {msg.streaming && !msg.text && (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
              <span className="inline-block h-3.5 w-1.5 animate-pulse bg-indigo-400" /> escribiendo…
            </span>
          )}
          {msg.streaming && msg.text && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-indigo-400" />
          )}
        </div>
      );
    case "tool":
      return <ToolCard msg={msg} />;
    case "permission":
      return (
        <PermissionCard
          toolName={msg.toolName}
          input={msg.input}
          description={msg.description}
          reason={msg.reason}
          canAlways={!!msg.suggestions?.length}
          status={msg.status}
          onDecide={onPermission}
        />
      );
    case "result":
      return (
        <div
          className={`flex items-center gap-1.5 self-center text-[11px] ${
            msg.isError ? "text-red-400" : "text-zinc-600"
          }`}
        >
          <HugeiconsIcon icon={msg.isError ? Alert02Icon : Tick02Icon} size={12} />
          {msg.isError ? "terminó con error" : "turno completo"}
          {msg.durationMs != null && ` · ${(msg.durationMs / 1000).toFixed(1)}s`}
          {msg.costUsd != null && ` · $${msg.costUsd.toFixed(4)}`}
        </div>
      );
    case "system":
      return <div className="self-center text-[11px] text-zinc-600">{msg.text}</div>;
    case "error":
      return (
        <div className="self-stretch whitespace-pre-wrap rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {msg.text}
        </div>
      );
  }
}

function ToolCard({ msg }: { msg: Extract<Msg, { kind: "tool" }> }) {
  const statusIcon =
    msg.status === "running" ? (
      <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin text-amber-400" />
    ) : msg.status === "error" ? (
      <HugeiconsIcon icon={Alert02Icon} size={14} className="text-red-400" />
    ) : (
      <HugeiconsIcon icon={Tick02Icon} size={14} className="text-emerald-400" />
    );

  return (
    <details className="max-w-[88%] self-start overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/70 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-zinc-300 hover:bg-zinc-800/40">
        <HugeiconsIcon icon={Wrench01Icon} size={14} className="text-indigo-400" />
        <span className="font-medium">{msg.name}</span>
        <span className="ml-auto">{statusIcon}</span>
      </summary>
      <div className="border-t border-zinc-800 px-3 py-2">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">input</div>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] text-zinc-400">
          {JSON.stringify(msg.input, null, 2)}
        </pre>
        {msg.result != null && (
          <>
            <div className="mb-1 mt-2 text-[10px] uppercase tracking-wide text-zinc-600">
              resultado
            </div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] text-zinc-400">
              {msg.result}
            </pre>
          </>
        )}
      </div>
    </details>
  );
}
