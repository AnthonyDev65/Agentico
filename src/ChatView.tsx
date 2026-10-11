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
  ArrowUp01Icon,
  ImageAdd01Icon,
  Cancel01Icon,
  StopIcon,
} from "@hugeicons/core-free-icons";
import { ThinkingOrb } from "thinking-orbs";
import { BorderBeam } from "border-beam";
import { fileIcon } from "@/lib/fileIcons";
import { cn } from "@/lib/utils";

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
  | { id: number; kind: "error"; text: string };

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
  { value: "acceptEdits", label: "Agent", hint: "Auto-acepta ediciones de archivos" },
  { value: "plan", label: "Plan", hint: "Solo planifica, no modifica nada" },
  { value: "bypassPermissions", label: "Full access", hint: "Permite todo sin preguntar" },
];

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

type ResumeReq = { id: string; file: string; nonce: number };

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
}: {
  sessionId: string;
  cwd: string;
  resume?: ResumeReq | null;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
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

  const idRef = useRef(0);
  const blockMap = useRef<Record<number, number>>({});
  const toolJson = useRef<Record<number, string>>({});
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
        case "content_block_start": {
          const idx: number = inner.index;
          const block = inner.content_block;
          if (block.type === "text") {
            const id = newId();
            blockMap.current[idx] = id;
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
            if (ev.session_id) sessionIdRef.current = ev.session_id;
            add({ id: newId(), kind: "system", text: `Sesión lista · ${ev.model ?? "claude"}` });
          }
          break;
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
          permissionMode: perm,
          model: model === "auto" ? null : model,
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Retomar una conversación antigua: precarga el transcript y reinicia la
  // sesión de claude con --resume (continúa el contexto del lado del CLI).
  useEffect(() => {
    if (!resume) return;
    (async () => {
      restartingRef.current = true;
      setBusy(false);
      setUsage(ZERO_USAGE);
      try {
        const raw = await invoke<string>("chat_session_read", { file: resume.file });
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
          permissionMode: perm,
          model: model === "auto" ? null : model,
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

  const toggleMention = (f: string) =>
    setMentions((m) => (m.includes(f) ? m.filter((x) => x !== f) : [...m, f]));

  const send = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0 && mentions.length === 0) || busy) return;
    const imgs = attachments;
    const mn = mentions;
    add({
      id: newId(),
      kind: "user",
      text,
      images: imgs.length ? imgs.map((a) => a.dataUrl) : undefined,
      mentions: mn.length ? mn : undefined,
    });
    setInput("");
    setAttachments([]);
    setMentions([]);
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
    setMessages((p) =>
      p.map((m) => (m.kind === "tool" && m.status === "running" ? { ...m, status: "error" } : m)),
    );
    add({ id: newId(), kind: "system", text: "Detenido por el usuario" });
    try {
      await invoke("chat_kill", { id: sessionId });
      await invoke("chat_start", {
        id: sessionId,
        cwd,
        permissionMode: perm,
        model: model === "auto" ? null : model,
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

  const removeAttachment = (idx: number) =>
    setAttachments((a) => a.filter((_, i) => i !== idx));

  const applySettings = async (nextPerm: string, nextModel: string) => {
    restartingRef.current = true;
    setBusy(false);
    setUsage(ZERO_USAGE);
    try {
      await invoke("chat_start", {
        id: sessionId,
        cwd,
        permissionMode: nextPerm,
        model: nextModel === "auto" ? null : nextModel,
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

  const streamingActive = messages.some((m) => m.kind === "assistant" && m.streaming);
  const runningTool = messages.find((m) => m.kind === "tool" && m.status === "running") as
    | Extract<Msg, { kind: "tool" }>
    | undefined;
  const orbState = runningTool ? "searching" : "working";
  const statusText = runningTool
    ? `Ejecutando ${runningTool.name}…`
    : streamingActive
      ? "Generando respuesta…"
      : "Pensando…";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <UsageBar usage={usage} />
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && (
          <div className="m-auto flex max-w-xs flex-col items-center gap-3 text-center text-sm text-zinc-500">
            <ThinkingOrb state="breathing" size={64} theme="dark" />
            Pídele algo a claude sobre este proyecto.
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} />
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

      <div className="p-3">
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
              value={input}
              placeholder="Pide cualquier cosa…  (pega una imagen con Ctrl+V)"
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
              </div>
              {busy ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Detener"
                  title="Detener (preserva el contexto)"
                  className="flex size-8 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-500"
                >
                  <HugeiconsIcon icon={StopIcon} size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={send}
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
    </div>
  );
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

function Bubble({ msg }: { msg: Msg }) {
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
          <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
          </div>
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
