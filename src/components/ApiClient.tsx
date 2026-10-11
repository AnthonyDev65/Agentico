import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Add01Icon,
  Delete02Icon,
  FlashIcon,
  CodeIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

type Header = { on: boolean; k: string; v: string };
type HttpResult = {
  status: number;
  status_text: string;
  headers: [string, string][];
  body: string;
  time_ms: number;
  size: number;
};

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const methodColor = (m: string) =>
  m === "GET"
    ? "text-emerald-400"
    : m === "POST"
      ? "text-amber-400"
      : m === "PUT" || m === "PATCH"
        ? "text-sky-400"
        : m === "DELETE"
          ? "text-red-400"
          : "text-zinc-400";

const statusColor = (s: number) =>
  s >= 200 && s < 300
    ? "bg-emerald-500/15 text-emerald-400"
    : s >= 300 && s < 400
      ? "bg-sky-500/15 text-sky-400"
      : s >= 400
        ? "bg-red-500/15 text-red-400"
        : "bg-zinc-700/40 text-zinc-300";

const LS_KEY = "agentico.api.last";

function loadSaved(): { method: string; url: string; headers: Header[]; body: string } {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || "");
    if (s && typeof s.url === "string") return s;
  } catch {
    /* no-op */
  }
  return {
    method: "GET",
    url: "",
    headers: [{ on: true, k: "", v: "" }],
    body: "",
  };
}

function prettyBody(body: string, headers: [string, string][]): string {
  const ct = headers.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  if (/json/i.test(ct) || /^\s*[[{]/.test(body)) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      /* no-op */
    }
  }
  return body;
}

export default function ApiClient({ onClose }: { onClose: () => void }) {
  const saved = useRef(loadSaved());
  const [method, setMethod] = useState(saved.current.method);
  const [url, setUrl] = useState(saved.current.url);
  const [headers, setHeaders] = useState<Header[]>(saved.current.headers);
  const [body, setBody] = useState(saved.current.body);
  const [reqTab, setReqTab] = useState<"headers" | "body">("headers");
  const [respTab, setRespTab] = useState<"body" | "headers">("body");
  const [result, setResult] = useState<HttpResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ method, url, headers, body }));
    } catch {
      /* no-op */
    }
  }, [method, url, headers, body]);

  const close = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const send = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const hs = headers.filter((h) => h.on && h.k.trim()).map((h) => [h.k.trim(), h.v]);
      const r = await invoke<HttpResult>("http_request", {
        method,
        url: url.trim(),
        headers: hs,
        body: method === "GET" || method === "HEAD" ? null : body || null,
      });
      setResult(r);
      setRespTab("body");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const setHeader = (i: number, patch: Partial<Header>) =>
    setHeaders((hs) => hs.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const addHeader = () => setHeaders((hs) => [...hs, { on: true, k: "", v: "" }]);
  const delHeader = (i: number) => setHeaders((hs) => hs.filter((_, j) => j !== i));

  return createPortal(
    <>
      <div
        onMouseDown={close}
        className={cn(
          "fixed inset-0 z-[79] bg-black/40 transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className={cn(
          "fixed bottom-3 left-3 top-11 z-[80] flex w-[960px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#161616] shadow-2xl shadow-black/60 transition-transform duration-300 ease-out",
          visible ? "translate-x-0" : "-translate-x-[130%]",
        )}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-800 bg-[#1a1a1a] px-4">
          <HugeiconsIcon icon={FlashIcon} size={16} className="text-indigo-400" />
          <span className="text-sm font-semibold text-zinc-100">Cliente API</span>
          <button
            type="button"
            onClick={close}
            className="ml-auto flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={15} />
          </button>
        </div>

        {/* Barra de request */}
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 p-3">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className={cn(
              "rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs font-bold outline-none focus:border-indigo-500",
              methodColor(method),
            )}
          >
            {METHODS.map((m) => (
              <option key={m} className="text-zinc-200">
                {m}
              </option>
            ))}
          </select>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="https://api.ejemplo.com/endpoint"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={send}
            disabled={loading || !url.trim()}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {loading ? "…" : "Enviar"}
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Request editor */}
          <div className="flex w-1/2 min-w-0 flex-col border-r border-zinc-800">
            <div className="flex h-8 shrink-0 items-center gap-1 border-b border-zinc-800 px-2">
              <MiniTab active={reqTab === "headers"} onClick={() => setReqTab("headers")}>
                Headers ({headers.filter((h) => h.on && h.k.trim()).length})
              </MiniTab>
              <MiniTab active={reqTab === "body"} onClick={() => setReqTab("body")}>
                Body
              </MiniTab>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2">
              {reqTab === "headers" ? (
                <div className="flex flex-col gap-1">
                  {headers.map((h, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={h.on}
                        onChange={(e) => setHeader(i, { on: e.target.checked })}
                        className="accent-indigo-500"
                      />
                      <input
                        value={h.k}
                        onChange={(e) => setHeader(i, { k: e.target.value })}
                        placeholder="Header"
                        spellCheck={false}
                        className="w-2/5 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100 outline-none focus:border-indigo-500"
                      />
                      <input
                        value={h.v}
                        onChange={(e) => setHeader(i, { v: e.target.value })}
                        placeholder="valor"
                        spellCheck={false}
                        className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100 outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => delHeader(i)}
                        className="flex size-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:text-red-400"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addHeader}
                    className="mt-1 flex items-center gap-1 self-start rounded px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    <HugeiconsIcon icon={Add01Icon} size={11} /> Añadir header
                  </button>
                </div>
              ) : (
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={method === "GET" || method === "HEAD" ? "(GET/HEAD no envían body)" : '{\n  "clave": "valor"\n}'}
                  spellCheck={false}
                  className="h-full w-full resize-none rounded border border-zinc-800 bg-zinc-900 p-2 font-mono text-xs text-zinc-100 outline-none focus:border-indigo-500"
                />
              )}
            </div>
          </div>

          {/* Response */}
          <div className="flex w-1/2 min-w-0 flex-col">
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-zinc-800 px-3 text-[11px]">
              {result ? (
                <>
                  <span className={cn("rounded px-1.5 py-0.5 font-semibold", statusColor(result.status))}>
                    {result.status} {result.status_text}
                  </span>
                  <span className="text-zinc-500">{result.time_ms} ms</span>
                  <span className="text-zinc-600">{(result.size / 1024).toFixed(1)} KB</span>
                  <div className="ml-auto flex items-center gap-1">
                    <MiniTab active={respTab === "body"} onClick={() => setRespTab("body")}>
                      Body
                    </MiniTab>
                    <MiniTab active={respTab === "headers"} onClick={() => setRespTab("headers")}>
                      Headers
                    </MiniTab>
                  </div>
                </>
              ) : (
                <span className="text-zinc-600">Respuesta</span>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-[#0d0d10] p-3">
              {loading ? (
                <div className="text-sm text-zinc-500">enviando…</div>
              ) : error ? (
                <div className="whitespace-pre-wrap rounded border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-300">
                  {error}
                </div>
              ) : !result ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-600">
                  <HugeiconsIcon icon={CodeIcon} size={28} className="text-zinc-700" />
                  Envía una petición para ver la respuesta.
                </div>
              ) : respTab === "body" ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-200">
                  {prettyBody(result.body, result.headers) || "(cuerpo vacío)"}
                </pre>
              ) : (
                <div className="flex flex-col gap-1 font-mono text-[11px]">
                  {result.headers.map(([k, v], i) => (
                    <div key={i} className="flex gap-2 border-b border-zinc-900/60 py-0.5">
                      <span className="shrink-0 text-indigo-300">{k}:</span>
                      <span className="break-all text-zinc-300">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function MiniTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2 py-1 text-[11px] font-medium transition-colors",
        active ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
      )}
    >
      {children}
    </button>
  );
}
