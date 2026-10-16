import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  MinusSignIcon,
  Copy01Icon,
  Download04Icon,
  Image01Icon,
  ArrowExpand01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { DIAGRAM_TEMPLATES } from "@/lib/diagramTemplates";
import {
  THEMES,
  canvasOf,
  dotBackground,
  renderMermaid,
  setDiagramTheme,
  useDiagramTheme,
  type ThemeKey,
} from "@/lib/diagramThemes";
import { cn } from "@/lib/utils";

// Render con debounce (300ms) → { svg, error }. Se re-renderiza al cambiar el tema.
function useMermaidSvg(code: string, theme: ThemeKey) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!code.trim()) {
        setSvg("");
        setError(null);
        return;
      }
      try {
        const { svg } = await renderMermaid(code, theme);
        if (!cancelled) {
          setSvg(svg);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code, theme]);

  return { svg, error };
}

function ErrorBox({ error }: { error: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-red-400">Error en el diagrama</div>
      <pre className="whitespace-pre-wrap break-words text-[11px] text-zinc-400">{error}</pre>
    </div>
  );
}

// Diagrama estático (bloques ```mermaid del preview de Markdown).
export function MermaidDiagram({ code }: { code: string }) {
  const theme = useDiagramTheme();
  const { svg, error } = useMermaidSvg(code, theme);
  return (
    <span className="block rounded-lg p-4" style={dotBackground(theme)}>
      {error ? (
        <ErrorBox error={error} />
      ) : (
        <span
          className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </span>
  );
}

// Tamaño natural del SVG (viewBox) y versión con width/height fijos para poder escalarlo.
function sizedSvg(svg: string) {
  const vb = svg.match(/viewBox="([\d.\-\s]+)"/);
  const [, , w, h] = vb ? vb[1].trim().split(/\s+/).map(Number) : [0, 0, 800, 600];
  const out = svg.replace(/<svg([^>]*)>/, (_m, attrs: string) => {
    const clean = attrs
      .replace(/\swidth="[^"]*"/, "")
      .replace(/\sheight="[^"]*"/, "")
      .replace(/\sstyle="[^"]*"/, "");
    return `<svg${clean} width="${w}" height="${h}">`;
  });
  return { svg: out, w, h };
}

// Exportar: se re-renderiza sin htmlLabels (foreignObject "ensucia" el canvas → no se
// podría sacar el PNG), con tamaño fijo.
async function renderForExport(code: string, theme: ThemeKey) {
  const { svg } = await renderMermaid(code, theme, true);
  return sizedSvg(svg);
}

async function svgToPngBase64(svg: string, w: number, h: number, theme: ThemeKey, scale = 2) {
  const { bg, dot } = canvasOf(theme);
  const img = new Image();
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("No se pudo rasterizar el SVG"));
    img.src = url;
  });
  const pad = 24;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((w + pad * 2) * scale);
  canvas.height = Math.ceil((h + pad * 2) * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  // Fondo + patrón de puntos (igual que en el lienzo)
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w + pad * 2, h + pad * 2);
  ctx.fillStyle = dot;
  for (let y = 10; y < h + pad * 2; y += 20) {
    for (let x = 10; x < w + pad * 2; x += 20) {
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.drawImage(img, pad, pad, w, h);
  return canvas.toDataURL("image/png").split(",")[1];
}

const baseName = (p: string) => (p.split(/[\\/]/).pop() ?? "diagrama").replace(/\.[^.]+$/, "");

export default function MermaidView({
  code,
  filePath,
  onInsertTemplate,
  onCreateVisual,
}: {
  code: string;
  filePath?: string;
  onInsertTemplate?: (code: string) => void;
  onCreateVisual?: () => void;
}) {
  const theme = useDiagramTheme();
  const { svg: raw, error } = useMermaidSvg(code, theme);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [status, setStatus] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);
  // Mientras el usuario no mueva/haga zoom, el diagrama se reajusta solo al cambiar de tamaño.
  const userMoved = useRef(false);

  const sized = raw ? sizedSvg(raw) : null;

  const fit = useCallback(() => {
    const box = boxRef.current;
    if (!box || !sized) return;
    const cw = box.clientWidth;
    const ch = box.clientHeight;
    const z = Math.min(2, Math.max(0.1, Math.min(cw / sized.w, ch / sized.h) * 0.92));
    userMoved.current = false;
    setView({ z, x: (cw - sized.w * z) / 2, y: (ch - sized.h * z) / 2 });
  }, [sized?.w, sized?.h]);

  useLayoutEffect(() => {
    if (sized && !userMoved.current) fit();
  }, [sized?.w, sized?.h, fit]);

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const box = boxRef.current;
    if (!box) return;
    const px = cx ?? box.clientWidth / 2;
    const py = cy ?? box.clientHeight / 2;
    userMoved.current = true;
    setView((v) => {
      const z = Math.min(8, Math.max(0.1, v.z * factor));
      const k = z / v.z;
      return { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  };

  // Ctrl/⌘ + rueda = zoom en el puntero; rueda sola = desplazar.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = box.getBoundingClientRect();
        zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
      } else {
        userMoved.current = true;
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [raw]);

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus((s) => (s === msg ? null : s)), 2000);
  };

  const exportAs = async (kind: "svg" | "png") => {
    try {
      const name = `${filePath ? baseName(filePath) : "diagrama"}.${kind}`;
      const dir = filePath ? filePath.replace(/[\\/][^\\/]*$/, "") : undefined;
      const target = await save({
        defaultPath: dir ? `${dir}/${name}` : name,
        filters: [{ name: kind.toUpperCase(), extensions: [kind] }],
      });
      if (!target) return;
      const out = await renderForExport(code, theme);
      if (kind === "svg") {
        const withBg = out.svg.replace(/<svg([^>]*)>/, `<svg$1><rect width="100%" height="100%" fill="${canvasOf(theme).bg}"/>`);
        await invoke("fs_write", { path: target, content: withBg });
      } else {
        const data = await svgToPngBase64(out.svg, out.w, out.h, theme);
        await invoke("fs_write_base64", { path: target, data });
      }
      flash(`Exportado ${kind.toUpperCase()}`);
    } catch (e: any) {
      flash(`Error: ${e?.message ?? e}`);
    }
  };

  const copySvg = async () => {
    try {
      const out = await renderForExport(code, theme);
      await navigator.clipboard.writeText(out.svg);
      flash("SVG copiado");
    } catch (e: any) {
      flash(`Error: ${e?.message ?? e}`);
    }
  };

  if (!code.trim() && onInsertTemplate) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6" style={dotBackground(theme)}>
        <div className="text-sm text-zinc-400">Archivo vacío — empieza con una plantilla</div>
        <div className="flex flex-wrap justify-center gap-2">
          {DIAGRAM_TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onInsertTemplate(t.code + "\n")}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-indigo-500 hover:bg-zinc-800"
            >
              {t.label}
            </button>
          ))}
        </div>
        {onCreateVisual && (
          <button
            type="button"
            onClick={onCreateVisual}
            className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            o créalo sin código (editor visual)
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden" style={{ backgroundColor: canvasOf(theme).bg }}>
      {/* Lienzo con zoom/pan */}
      <div
        ref={boxRef}
        className={cn("absolute inset-0", dragging ? "cursor-grabbing" : "cursor-grab")}
        style={dotBackground(theme, 20 * view.z, view.x, view.y)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { sx: e.clientX, sy: e.clientY, x: view.x, y: view.y };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          userMoved.current = true;
          setView((v) => ({ ...v, x: d.x + e.clientX - d.sx, y: d.y + e.clientY - d.sy }));
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onDoubleClick={fit}
      >
        {sized && (
          <div
            className="absolute left-0 top-0 origin-top-left select-none"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
            dangerouslySetInnerHTML={{ __html: sized.svg }}
          />
        )}
      </div>

      {/* Error (se mantiene el último diagrama válido debajo) */}
      {error && (
        <div className="absolute inset-x-3 bottom-3 max-h-[40%] overflow-auto rounded-lg border border-red-500/30 bg-[#1a1010]/95 p-3">
          <ErrorBox error={error} />
        </div>
      )}

      {/* Barra de controles */}
      <div className="absolute right-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-0.5 rounded-lg border border-zinc-800 bg-[#161616]/95 p-1 text-zinc-400 shadow-lg">
        <div className="mr-1 flex overflow-hidden rounded-md border border-zinc-800 text-[11px]" title="Estilo del diagrama">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setDiagramTheme(t.value)}
              className={cn(
                "px-2 py-0.5 transition-colors",
                theme === t.value ? "bg-indigo-600 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <CtrlBtn title="Alejar (Ctrl+rueda)" onClick={() => zoomAt(1 / 1.2)} icon={MinusSignIcon} />
        <button
          type="button"
          title="Restablecer a 100%"
          onClick={() => {
            const box = boxRef.current;
            if (!box || !sized) return;
            userMoved.current = true;
            setView({ z: 1, x: (box.clientWidth - sized.w) / 2, y: (box.clientHeight - sized.h) / 2 });
          }}
          className="w-12 rounded px-1 py-1 text-center text-[11px] tabular-nums hover:bg-zinc-800 hover:text-zinc-100"
        >
          {Math.round(view.z * 100)}%
        </button>
        <CtrlBtn title="Acercar (Ctrl+rueda)" onClick={() => zoomAt(1.2)} icon={Add01Icon} />
        <CtrlBtn title="Ajustar a la pantalla (doble clic)" onClick={fit} icon={ArrowExpand01Icon} />
        <div className="mx-1 h-4 w-px bg-zinc-800" />
        <CtrlBtn title="Copiar SVG" onClick={copySvg} icon={Copy01Icon} />
        <CtrlBtn title="Exportar SVG" onClick={() => exportAs("svg")} icon={Download04Icon} label="SVG" />
        <CtrlBtn title="Exportar PNG" onClick={() => exportAs("png")} icon={Image01Icon} label="PNG" />
      </div>

      {status && (
        <div className="absolute right-3 top-14 flex items-center gap-1.5 rounded-md border border-zinc-800 bg-[#161616] px-2.5 py-1 text-[11px] text-zinc-300 shadow-lg">
          {!status.startsWith("Error") && <HugeiconsIcon icon={Tick02Icon} size={12} className="text-emerald-400" />}
          {status}
        </div>
      )}
    </div>
  );
}

function CtrlBtn({
  title,
  onClick,
  icon,
  label,
}: {
  title: string;
  onClick: () => void;
  icon: any;
  label?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] hover:bg-zinc-800 hover:text-zinc-100"
    >
      <HugeiconsIcon icon={icon} size={13} />
      {label}
    </button>
  );
}
