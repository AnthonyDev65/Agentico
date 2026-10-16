import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import {
  googleFontsUrl,
  mainValue,
  parseTypeValue,
  parseVisualSystem,
  replaceTokenValue,
  toCssVars,
  getSync,
  setSync,
  type TokenSync,
  type Section,
  type Token,
} from "@/lib/visualSystem";
import { cn } from "@/lib/utils";
import { importTokensInEntry, suggestSync, syncDesign } from "@/lib/designSync";

// Vista visual de un archivo `.design`: página tipo documento (papel claro) con
// cabecera generada de la paleta, muestras de color editables, especímenes tipográficos,
// espaciado, radios y sombras. Lo editable se guarda en el texto (autoguardado).

// ── Color helpers ──
function toRgb(color: string): [number, number, number] | null {
  const el = document.createElement("canvas").getContext("2d");
  if (!el) return null;
  el.fillStyle = "#000";
  el.fillStyle = color;
  const v = el.fillStyle as string; // normaliza a #rrggbb o rgba()
  if (v.startsWith("#")) {
    const n = parseInt(v.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = v.match(/\d+(\.\d+)?/g);
  return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : null;
}
function luminance([r, g, b]: [number, number, number]) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const toHex = (rgb: [number, number, number]) => "#" + rgb.map((x) => x.toString(16).padStart(2, "0")).join("");
const isColor = (v: string) => typeof CSS !== "undefined" && CSS.supports("color", v);

export default function VisualSystemView({
  content,
  onChange,
  projectPath,
  designPath,
}: {
  content: string;
  onChange: (text: string) => void;
  projectPath?: string;
  designPath?: string;
}) {
  const vs = useMemo(() => parseVisualSystem(content), [content]);
  const [copied, setCopied] = useState<string | null>(null);

  // Carga las fuentes declaradas desde Google Fonts (si hay internet).
  const fontsUrl = googleFontsUrl(vs);
  useEffect(() => {
    if (!fontsUrl) return;
    const id = "agentico-vs-fonts";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== fontsUrl) link.href = fontsUrl;
  }, [fontsUrl]);

  const colors = vs.sections.find((s) => s.kind === "colors")?.tokens ?? [];
  const palette = colors.map((t) => mainValue(t, "colors")).filter(isColor);
  const accentTok = colors.find((t) => /accent|acento/i.test(t.name));
  const accentHint = accentTok && isColor(mainValue(accentTok, "colors")) ? mainValue(accentTok, "colors") : undefined;
  const typeTokens = (vs.sections.find((s) => s.kind === "type")?.tokens ?? []).map(parseTypeValue);
  const display = typeTokens.find((t) => /display|hero|title|titular/i.test(t.name)) ?? typeTokens[0];
  const body = typeTokens.find((t) => /body|texto|text|base/i.test(t.name));

  const copy = async (label: string, text: string) => {
    await invoke("clipboard_write", { text }).catch(() => navigator.clipboard?.writeText(text));
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
  };

  const editColor = (t: Token, next: string) => onChange(replaceTokenValue(content, t, "colors", next));

  const bodyFont = body ? `"${body.family}", system-ui, sans-serif` : undefined;

  return (
    <div className="h-full overflow-y-auto bg-[#121212] p-4">
      <article
        className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-[#FAFAF9] text-[#1c1c1c] shadow-2xl shadow-black/40"
        style={{ fontFamily: bodyFont }}
      >
        {/* Cabecera generada con la paleta */}
        <header className="px-8 pt-8 sm:px-10">
          <HeroStrip palette={palette} accentHint={accentHint} />
          <h1
            className="mt-8 max-w-3xl text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl"
            style={
              display
                ? {
                    fontFamily: `"${display.family}", system-ui, sans-serif`,
                    fontWeight: Number(display.weight) || 700,
                    letterSpacing: display.tracking || undefined,
                  }
                : undefined
            }
          >
            {vs.title || "Visual System"}
          </h1>
          {vs.subtitle && <p className="mt-3 text-[15px] text-[#5f5f5f]">{vs.subtitle}</p>}
          <div className="mt-6 flex flex-wrap gap-2 pb-6">
            <CopyBtn label="CSS variables" done={copied === "css"} onClick={() => copy("css", toCssVars(vs))} />
            <CopyBtn
              label="Tailwind @theme"
              done={copied === "tw"}
              onClick={() => copy("tw", toCssVars(vs, true))}
            />
          </div>
          {projectPath && designPath && (
            <div className="-mt-2 pb-6">
              <SyncControl content={content} onChange={onChange} projectPath={projectPath} designPath={designPath} />
            </div>
          )}
        </header>

        <div className="border-t border-[#e7e5e4] px-8 py-8 sm:px-10">
          {vs.intro && (
            <div className="vs-md mb-10 max-w-3xl">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{vs.intro}</ReactMarkdown>
            </div>
          )}

          {vs.sections.map((s, i) => (
            <section key={i} className="mb-12">
              <h2 className="mb-4 text-xl font-semibold tracking-tight">{s.title}</h2>
              {s.kind === "colors" && <Colors s={s} onEdit={editColor} onCopy={copy} copied={copied} />}
              {s.kind === "type" && <Typography s={s} />}
              {s.kind === "spacing" && <Spacing s={s} />}
              {s.kind === "radius" && <Radius s={s} accent={palette[palette.length - 1]} />}
              {s.kind === "shadow" && <Shadows s={s} />}
              {s.md && (
                <div className={cn("vs-md max-w-3xl", s.kind !== "md" && "mt-4")}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.md}</ReactMarkdown>
                </div>
              )}
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}

// Bloques decorativos con los colores (estilo cartel): bloque fuerte, trama de cruces,
// bloque medio y un cuadrado de acento.
function HeroStrip({ palette, accentHint }: { palette: string[]; accentHint?: string }) {
  if (!palette.length) return null;
  const info = palette.map((c) => {
    const rgb = toRgb(c) ?? [128, 128, 128];
    return { c, l: luminance(rgb), sat: Math.max(...rgb) - Math.min(...rgb) };
  });
  const byLum = [...info].sort((a, b) => a.l - b.l);
  const dark = byLum[0].c;
  const light = byLum[byLum.length - 1].c;
  // Bloque medio: el tono intermedio menos saturado (un gris/neutro si lo hay).
  const middle = byLum.slice(1, -1);
  const mid = (middle.length ? [...middle].sort((a, b) => a.sat - b.sat)[0] : byLum[0]).c;
  // Acento: el token llamado «accent» si existe; si no, el más saturado.
  const accent = accentHint ?? [...info].sort((a, b) => b.sat - a.sat)[0].c;
  const plus = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><path d='M12 8v8M8 12h8' stroke='#6b6b6b' stroke-width='1.2'/></svg>`,
  );
  return (
    <div className="flex h-28 items-end gap-4">
      <div className="relative h-full w-[42%]" style={{ background: dark }}>
        <div className="absolute bottom-3 right-6 h-7 w-4" style={{ background: light }} />
      </div>
      <div
        className="h-full flex-1"
        style={{ background: `${mix(light, dark)} url("data:image/svg+xml,${plus}")` }}
      />
      <div className="h-full w-[14%]" style={{ background: mid }} />
      <div className="size-4 shrink-0" style={{ background: accent }} />
    </div>
  );
}

// Un gris claro entre fondo y tinta para la trama.
function mix(light: string, dark: string) {
  const a = toRgb(light);
  const b = toRgb(dark);
  if (!a || !b) return "#e5e5e5";
  return toHex(a.map((x, i) => Math.round(x * 0.88 + b[i] * 0.12)) as [number, number, number]);
}

function Colors({
  s,
  onEdit,
  onCopy,
  copied,
}: {
  s: Section;
  onEdit: (t: Token, v: string) => void;
  onCopy: (label: string, text: string) => void;
  copied: string | null;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
      {s.tokens.map((t) => {
        const v = mainValue(t, "colors");
        const rgb = isColor(v) ? toRgb(v) : null;
        const L = rgb ? luminance(rgb) : 1;
        const onWhite = contrast(L, 1);
        const onBlack = contrast(L, 0);
        const fg = onBlack > onWhite ? "#111" : "#fff";
        return <ColorSwatch key={t.line} t={t} v={v} rgb={rgb} fg={fg} onWhite={onWhite} onBlack={onBlack} onEdit={onEdit} onCopy={onCopy} copied={copied === `c:${t.line}`} />;
      })}
    </div>
  );
}

function ColorSwatch({
  t,
  v,
  rgb,
  fg,
  onWhite,
  onBlack,
  onEdit,
  onCopy,
  copied,
}: {
  t: Token;
  v: string;
  rgb: [number, number, number] | null;
  fg: string;
  onWhite: number;
  onBlack: number;
  onEdit: (t: Token, v: string) => void;
  onCopy: (label: string, text: string) => void;
  copied: boolean;
}) {
  const pick = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ratio = Math.max(onWhite, onBlack);
  const grade = ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA grande" : "bajo";
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e7e5e4] bg-white">
      <button
        type="button"
        onClick={() => pick.current?.showPicker?.()}
        title="Cambiar color"
        className="relative flex h-24 w-full items-end justify-between p-3 text-left"
        style={{ background: v, color: fg }}
      >
        <span className="text-[11px] font-medium opacity-90">Aa</span>
        <span className="rounded-full px-1.5 text-[10px] font-medium" style={{ background: fg === "#fff" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.08)" }}>
          {ratio.toFixed(1)} · {grade}
        </span>
        <input
          ref={pick}
          type="color"
          value={rgb ? toHex(rgb) : "#000000"}
          onChange={(e) => {
            const val = e.target.value.toUpperCase();
            // Debounce: el selector dispara muchos cambios al arrastrar.
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => onEdit(t, val), 120);
          }}
          className="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0"
          tabIndex={-1}
        />
      </button>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold">{t.name}</span>
          <button
            type="button"
            onClick={() => onCopy(`c:${t.line}`, v)}
            className="flex items-center gap-1 rounded font-mono text-[11px] text-[#5f5f5f] hover:text-[#111]"
            title="Copiar"
          >
            {copied ? <HugeiconsIcon icon={Tick02Icon} size={11} /> : null}
            {v}
          </button>
        </div>
        {t.desc && <div className="mt-1 text-[11px] leading-snug text-[#7a7a7a]">{t.desc}</div>}
      </div>
    </div>
  );
}

function Typography({ s }: { s: Section }) {
  return (
    <div className="flex flex-col divide-y divide-[#e7e5e4] rounded-2xl border border-[#e7e5e4] bg-white">
      {s.tokens.map((raw) => {
        const t = parseTypeValue(raw);
        const size = parseFloat(t.size) || 16;
        return (
          <div key={t.line} className="grid gap-3 p-5 sm:grid-cols-[180px_1fr]">
            <div className="text-[11px] leading-relaxed text-[#6b6b6b]">
              <div className="text-[13px] font-semibold text-[#1c1c1c]">{t.name}</div>
              <div>{t.family}</div>
              <div className="font-mono">
                {t.weight} · {t.size}
                {t.lineHeight && ` / ${t.lineHeight}`}
                {t.tracking && ` · ${t.tracking}`}
              </div>
              {t.desc && <div className="mt-1">{t.desc}</div>}
            </div>
            <div
              className="min-w-0 truncate"
              style={{
                fontFamily: `"${t.family}", ${/mono|code/i.test(t.family) ? "ui-monospace, monospace" : "system-ui, sans-serif"}`,
                fontWeight: Number(t.weight) || 400,
                fontSize: Math.min(size, 64),
                lineHeight: t.lineHeight || 1.3,
                letterSpacing: t.tracking || undefined,
              }}
            >
              {size >= 28 ? "Diseño con intención" : "El veloz murciélago hindú comía feliz cardillo y kiwi. 0123456789"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Spacing({ s }: { s: Section }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[#e7e5e4] bg-white p-5">
      {s.tokens.map((t) => {
        const v = mainValue(t, "spacing");
        return (
          <div key={t.line} className="flex items-center gap-4 text-[12px]">
            <span className="w-24 shrink-0 font-mono text-[#5f5f5f]">{t.name}</span>
            <span className="h-3 rounded-sm bg-[#1c1c1c]" style={{ width: `min(${v}, 100%)` }} />
            <span className="font-mono text-[#7a7a7a]">{v}</span>
            {t.desc && <span className="text-[#9a9a9a]">{t.desc}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Radius({ s, accent }: { s: Section; accent?: string }) {
  return (
    <div className="flex flex-wrap gap-5">
      {s.tokens.map((t) => {
        const v = mainValue(t, "radius");
        return (
          <div key={t.line} className="flex flex-col items-center gap-2">
            <div
              className="size-20 border-2"
              style={{ borderRadius: v, borderColor: accent ?? "#1c1c1c", background: "white" }}
            />
            <div className="text-center text-[11px]">
              <div className="font-semibold">{t.name}</div>
              <div className="font-mono text-[#7a7a7a]">{v}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Shadows({ s }: { s: Section }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-6 rounded-2xl bg-[#f1f0ee] p-6">
      {s.tokens.map((t) => (
        <div key={t.line} className="flex h-28 flex-col justify-end rounded-xl bg-white p-3" style={{ boxShadow: t.value }}>
          <div className="text-[13px] font-semibold">{t.name}</div>
          {t.desc && <div className="text-[11px] text-[#7a7a7a]">{t.desc}</div>}
        </div>
      ))}
    </div>
  );
}

function CopyBtn({ label, done, onClick }: { label: string; done: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-[#e2e0dd] bg-white px-3 py-1 text-[12px] text-[#3a3a3a] transition-colors hover:border-[#1c1c1c]"
    >
      <HugeiconsIcon icon={done ? Tick02Icon : Copy01Icon} size={12} />
      {done ? "Copiado" : `Copiar ${label}`}
    </button>
  );
}

// ───────────────────── Sincronización con el proyecto ─────────────────────

function SyncControl({
  content,
  onChange,
  projectPath,
  designPath,
}: {
  content: string;
  onChange: (text: string) => void;
  projectPath: string;
  designPath: string;
}) {
  const sync = getSync(content);
  const [form, setForm] = useState<{ path: string; format: TokenSync["format"]; entry: string | null; importIt: boolean } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openForm = async () => {
    const s = await suggestSync(projectPath);
    setForm({ path: s.path, format: s.format, entry: s.entry, importIt: !!s.entry });
  };

  // Escritura inmediata (además del watcher) para dar feedback al momento.
  const regenerate = async (msgPrefix = "") => {
    setBusy(true);
    try {
      // El .design se autoguarda con debounce: espera a que esté en disco.
      await new Promise((r) => setTimeout(r, 700));
      const r = await syncDesign(projectPath, designPath);
      setStatus(r ? `${msgPrefix}${r.written ? "Tokens actualizados" : "Tokens al día"} en ${r.target}` : null);
    } catch (e) {
      setStatus(`Error: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    if (!form || !form.path.trim()) return;
    const cfg: TokenSync = { path: form.path.trim().replace(/^[./\\]+/, ""), format: form.format };
    onChange(setSync(content, cfg));
    let prefix = "";
    if (form.importIt) {
      const entry = await importTokensInEntry(projectPath, cfg.path).catch(() => null);
      if (entry) prefix = `Importado en ${entry} · `;
    }
    setForm(null);
    regenerate(prefix);
  };

  if (sync) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-50 px-3 py-1 text-emerald-800">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Sincronizado con <span className="font-mono">{sync.path}</span> · {sync.format === "tailwind" ? "Tailwind @theme" : "CSS variables"}
        </span>
        <button type="button" onClick={() => regenerate()} disabled={busy} className="rounded-full px-2 py-1 text-[#5f5f5f] hover:bg-[#efeeec] hover:text-[#111]">
          {busy ? "…" : "Regenerar"}
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(setSync(content, null));
            setStatus("Desconectado: el archivo de tokens se queda, pero ya no se actualiza.");
          }}
          className="rounded-full px-2 py-1 text-[#9a9a9a] hover:bg-[#efeeec] hover:text-red-700"
        >
          Desconectar
        </button>
        {status && <span className="text-[11px] text-[#7a7a7a]">{status}</span>}
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openForm}
          className="flex items-center gap-1.5 rounded-full bg-[#1c1c1c] px-3 py-1 text-[12px] text-white hover:bg-black"
          title="Genera un archivo de tokens CSS desde este Visual System y lo mantiene sincronizado"
        >
          Conectar al proyecto
        </button>
        {status && <span className="text-[11px] text-[#7a7a7a]">{status}</span>}
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-2.5 rounded-2xl border border-[#e2e0dd] bg-white p-4 text-[12px] text-[#3a3a3a]">
      <div className="text-[13px] font-semibold text-[#111]">Conectar al proyecto</div>
      <div className="text-[11px] leading-relaxed text-[#7a7a7a]">
        Se genera un archivo de tokens y se regenera solo cada vez que cambies este Visual System (también si lo cambia el agente).
        Si el proyecto usa esas variables, el cambio se ve en toda la app.
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-[#7a7a7a]">Archivo de tokens (relativo al proyecto)</span>
        <input
          value={form.path}
          onChange={(e) => setForm({ ...form, path: e.target.value })}
          className="h-8 rounded-lg border border-[#e2e0dd] bg-[#fafaf9] px-2.5 font-mono text-[12px] outline-none focus:border-[#1c1c1c]"
        />
      </label>
      <div className="flex gap-1.5">
        {(["tailwind", "css"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setForm({ ...form, format: f })}
            className={cn(
              "rounded-full border px-3 py-1",
              form.format === f ? "border-[#1c1c1c] bg-[#1c1c1c] text-white" : "border-[#e2e0dd] hover:border-[#1c1c1c]",
            )}
          >
            {f === "tailwind" ? "Tailwind v4 (@theme)" : "CSS variables (:root)"}
          </button>
        ))}
      </div>
      {form.entry ? (
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={form.importIt} onChange={(e) => setForm({ ...form, importIt: e.target.checked })} />
          Importarlo en <span className="font-mono">{form.entry}</span>
        </label>
      ) : (
        <div className="text-[11px] text-amber-700">No encontré el CSS principal: importa el archivo de tokens a mano.</div>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={connect} className="rounded-full bg-[#1c1c1c] px-4 py-1.5 text-white hover:bg-black">
          Conectar
        </button>
        <button type="button" onClick={() => setForm(null)} className="rounded-full px-3 py-1.5 text-[#7a7a7a] hover:bg-[#efeeec]">
          Cancelar
        </button>
      </div>
    </div>
  );
}
