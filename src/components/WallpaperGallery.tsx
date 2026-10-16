import { useEffect, useRef, useState } from "react";
import LiquidGlass from "@/components/LiquidGlass";
import { squircleClip } from "@/lib/squircle";

// Fondos de pantalla del teléfono + galería para elegirlos (como «mantener pulsado» en
// iOS): tarjetas con forma de pantalla que se deslizan en horizontal, con la fecha y la
// hora encima, «Personalizar» (atenuar / desenfocar) y «+» para añadir una foto.

export type Wallpaper = {
  id: string;
  kind: "gradient" | "photo";
  /** CSS `background` (degradados). */
  css?: string;
  /** data URL (fotos). */
  src?: string;
  name: string;
};
export type WallAdjust = { dim: number; blur: number };
export type WallState = { selected: string; custom: Wallpaper[]; adj: Record<string, WallAdjust> };

const mesh = (...layers: string[]) => layers.join(",");

export const BUILTIN_WALLPAPERS: Wallpaper[] = [
  {
    id: "aurora",
    kind: "gradient",
    name: "Aurora",
    css: mesh(
      "radial-gradient(130% 90% at 18% 8%, #3b2f6e 0%, rgba(59,47,110,0) 55%)",
      "radial-gradient(120% 90% at 88% 12%, #1f4f6e 0%, rgba(31,79,110,0) 50%)",
      "radial-gradient(130% 100% at 70% 100%, #5a2f5e 0%, rgba(90,47,94,0) 55%)",
      "radial-gradient(140% 120% at 10% 100%, #202a4a 0%, rgba(32,42,74,0) 60%)",
      "linear-gradient(170deg, #11111f 0%, #0b0b14 100%)",
    ),
  },
  {
    id: "atardecer",
    kind: "gradient",
    name: "Atardecer",
    css: mesh(
      "radial-gradient(120% 80% at 20% 10%, #ff9a5a 0%, rgba(255,154,90,0) 55%)",
      "radial-gradient(110% 90% at 90% 30%, #ff4f7b 0%, rgba(255,79,123,0) 55%)",
      "radial-gradient(130% 100% at 40% 100%, #5b2a86 0%, rgba(91,42,134,0) 60%)",
      "linear-gradient(175deg, #ff7a59 0%, #3a1450 100%)",
    ),
  },
  {
    id: "oceano",
    kind: "gradient",
    name: "Océano",
    css: mesh(
      "radial-gradient(120% 80% at 80% 0%, #4fd1ff 0%, rgba(79,209,255,0) 55%)",
      "radial-gradient(120% 100% at 10% 60%, #1d6fd8 0%, rgba(29,111,216,0) 60%)",
      "radial-gradient(130% 90% at 70% 100%, #0b2d6b 0%, rgba(11,45,107,0) 60%)",
      "linear-gradient(180deg, #1478c9 0%, #071a3d 100%)",
    ),
  },
  {
    id: "bosque",
    kind: "gradient",
    name: "Bosque",
    css: mesh(
      "radial-gradient(120% 80% at 15% 5%, #7be495 0%, rgba(123,228,149,0) 50%)",
      "radial-gradient(120% 100% at 90% 50%, #1f8a5b 0%, rgba(31,138,91,0) 60%)",
      "radial-gradient(130% 90% at 30% 100%, #0c3b2e 0%, rgba(12,59,46,0) 60%)",
      "linear-gradient(180deg, #2f9e6a 0%, #06261c 100%)",
    ),
  },
  {
    id: "duna",
    kind: "gradient",
    name: "Duna",
    css: mesh(
      "radial-gradient(120% 80% at 80% 10%, #ffe2c2 0%, rgba(255,226,194,0) 55%)",
      "radial-gradient(120% 100% at 10% 70%, #f2b48c 0%, rgba(242,180,140,0) 60%)",
      "linear-gradient(180deg, #f7d5b5 0%, #c9825b 100%)",
    ),
  },
  {
    id: "grafito",
    kind: "gradient",
    name: "Grafito",
    css: mesh(
      "radial-gradient(120% 80% at 30% 0%, #4a4a52 0%, rgba(74,74,82,0) 55%)",
      "radial-gradient(120% 90% at 90% 90%, #2a2a30 0%, rgba(42,42,48,0) 60%)",
      "linear-gradient(180deg, #2c2c32 0%, #0d0d10 100%)",
    ),
  },
];

const STORE = "agentico.phoneWalls";
export function loadWalls(): WallState {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null");
    if (v && typeof v.selected === "string" && Array.isArray(v.custom)) return { selected: v.selected, custom: v.custom, adj: v.adj ?? {} };
  } catch {
    /* sin datos */
  }
  return { selected: "aurora", custom: [], adj: {} };
}
export function saveWalls(s: WallState) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
    return true;
  } catch {
    return false; // sin espacio (fotos demasiado grandes)
  }
}

/** Foto → JPEG reducido (máx. 1400 px de alto) para que quepa en localStorage. */
export function photoToWallpaper(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const src = String(r.result);
      const img = new Image();
      img.onerror = () => reject(new Error("imagen no válida"));
      img.onload = () => {
        const k = Math.min(1, 1400 / img.height);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        const g = c.getContext("2d");
        if (!g) return resolve(src);
        g.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.84));
      };
      img.src = src;
    };
    r.readAsDataURL(file);
  });
}

/** Capa de fondo (con atenuado y desenfoque). Ocupa su contenedor (position: relative/absolute). */
export function WallpaperLayer({ wall, adj }: { wall: Wallpaper; adj?: WallAdjust }) {
  const blur = adj?.blur ?? 0;
  const dim = adj?.dim ?? 0;
  const bg: React.CSSProperties =
    wall.kind === "photo"
      ? { backgroundImage: `url("${wall.src}")`, backgroundSize: "cover", backgroundPosition: "center" }
      : { background: wall.css };
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ ...bg, filter: blur ? `blur(${blur}px)` : undefined, transform: blur ? "scale(1.08)" : undefined }}
      />
      {dim > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: dim }} />}
    </div>
  );
}

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

export default function WallpaperGallery({
  walls,
  state,
  cw,
  ch,
  time,
  onApply,
  onAdd,
  onAdjust,
  onRemove,
  onClose,
  notice,
}: {
  walls: Wallpaper[];
  state: WallState;
  cw: number;
  ch: number;
  time: string;
  onApply: (id: string) => void;
  onAdd: (file: File) => void;
  onAdjust: (id: string, adj: WallAdjust) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  /** Aviso (p. ej. sin espacio para más fotos). */
  notice?: string | null;
}) {
  const start = Math.max(0, walls.findIndex((w) => w.id === state.selected));
  const [f, setF] = useState(start);
  const [dragging, setDragging] = useState(false);
  const [custom, setCustom] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; f: number; moved: boolean; vx: number; lx: number; lt: number } | null>(null);

  // Entrada: fundido + las tarjetas «se alejan» desde la pantalla (sin depender de rAF).
  useEffect(() => {
    rootRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: "ease" });
    rootRef.current
      ?.querySelectorAll<HTMLElement>("[data-wall-card]")
      .forEach((el) => el.animate([{ scale: "1.25" }, { scale: "1" }], { duration: 400, easing: "cubic-bezier(.22,1,.36,1)" }));
  }, []);
  // Foto añadida → se enfoca la nueva; eliminada → el índice se mantiene dentro de rango.
  const prevLen = useRef(walls.length);
  useEffect(() => {
    if (walls.length > prevLen.current) setF(walls.length - 1);
    else setF((x) => Math.max(0, Math.min(walls.length - 1, Math.round(x))));
    prevLen.current = walls.length;
  }, [walls.length]);

  const cardW = cw * 0.695;
  const cardH = ch * 0.7;
  const cardTop = ch * 0.15;
  const step = cw * 0.754;
  const focus = Math.max(0, Math.min(walls.length - 1, Math.round(f)));
  const current = walls[focus];
  const adj = current ? state.adj[current.id] ?? { dim: 0, blur: 0 } : { dim: 0, blur: 0 };
  const now = new Date();
  const date = `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
  const ease = "cubic-bezier(.22,1,.36,1)";

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,input,[data-noswipe]")) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    drag.current = { x: e.clientX, f, moved: false, vx: 0, lx: e.clientX, lt: performance.now() };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const now2 = performance.now();
    d.vx = (e.clientX - d.lx) / Math.max(1, now2 - d.lt);
    d.lx = e.clientX;
    d.lt = now2;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 6) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
      setCustom(false);
    }
    let nf = d.f - dx / step;
    const max = walls.length - 1;
    if (nf < 0) nf = -0.35 * (1 - Math.exp(nf / 0.6));
    if (nf > max) nf = max + 0.35 * (1 - Math.exp(-(nf - max) / 0.6));
    setF(nf);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    setDragging(false);
    if (d.moved) {
      const flick = Math.abs(d.vx) > 0.45 ? -Math.sign(d.vx) * 0.6 : 0;
      setF(Math.max(0, Math.min(walls.length - 1, Math.round(f + flick))));
      return;
    }
    // Toque: la tarjeta central se aplica; una lateral pasa al centro.
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (y < cardTop || y > cardTop + cardH) return;
    const left = cw / 2 - cardW / 2;
    if (x >= left && x <= left + cardW) {
      onApply(walls[focus].id);
      onClose();
    } else setF(x < left ? Math.max(0, focus - 1) : Math.min(walls.length - 1, focus + 1));
  };

  const pill = 42 * (cw / 393);
  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-[39] touch-none select-none bg-black"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
        setF(focus);
      }}
    >
      {/* Tipo de fondo */}
      <div className="absolute inset-x-0 text-center font-medium tracking-wider text-white" style={{ top: ch * 0.105, fontSize: 13 * (cw / 393) }}>
        {current?.kind === "photo" ? "FOTO" : "DEGRADADO"}
      </div>

      {/* Tarjetas */}
      {walls.map((w, i) => {
        const slot = i - f;
        const x = cw / 2 - cardW / 2 + slot * step;
        if (Math.abs(slot) > 2.2) return null;
        const a = state.adj[w.id];
        return (
          <div
            key={w.id}
            data-wall-card
            className="absolute overflow-hidden"
            style={{
              left: 0,
              top: cardTop,
              width: cardW,
              height: cardH,
              transform: `translateX(${x}px)`,
              transformOrigin: "center",
              clipPath: squircleClip(cardW, cardH, cardW * 0.11, 0.6),
              transition: dragging ? "none" : `transform .4s ${ease}`,
            }}
          >
            <WallpaperLayer wall={w} adj={a} />
            {/* Borde fino del cristal de la tarjeta */}
            <div className="absolute inset-0 rounded-[11%] ring-1 ring-inset ring-white/25" style={{ borderRadius: cardW * 0.11 }} />
            <div className="relative flex flex-col items-center text-white" style={{ paddingTop: cardH * 0.09 }}>
              <div className="font-semibold" style={{ fontSize: cardW * 0.058, textShadow: "0 1px 4px rgba(0,0,0,.3)" }}>
                {date}
              </div>
              <div
                className="font-extralight leading-none tracking-tight"
                style={{ fontSize: cardW * 0.36, color: "rgba(255,255,255,.88)", textShadow: "0 2px 18px rgba(0,0,0,.25)" }}
              >
                {time}
              </div>
            </div>
            {w.id === state.selected && (
              <div className="absolute inset-x-0 flex justify-center" style={{ bottom: cardH * 0.06 }}>
                <span className="rounded-full bg-black/35 px-3 py-1 text-white backdrop-blur-md" style={{ fontSize: cardW * 0.045 }}>
                  Actual
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* Puntos */}
      <div className="absolute inset-x-0 flex justify-center" style={{ top: ch * 0.872, gap: 8 * (cw / 393) }}>
        {walls.map((w, i) => (
          <span
            key={w.id}
            className="rounded-full"
            style={{ width: 7 * (cw / 393), height: 7 * (cw / 393), background: i === focus ? "#fff" : "rgba(255,255,255,.35)" }}
          />
        ))}
      </div>

      {/* Personalizar */}
      {custom && current && (
        <div className="absolute inset-x-0 flex justify-center" data-noswipe style={{ bottom: ch * 0.1 + pill + 12 }}>
          <LiquidGlass radius={22} bezel={10} refraction={10} blur={14} style={{ width: cardW, background: "rgba(40,40,44,.55)" }}>
            <div className="flex flex-col gap-3 p-4 text-[12px] text-white">
              {(
                [
                  ["Atenuar", "dim", 0, 0.7, 0.05],
                  ["Desenfocar", "blur", 0, 24, 1],
                ] as const
              ).map(([label, key, min, max, stepV]) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="flex justify-between text-white/80">
                    {label}
                    <span className="tabular-nums text-white/50">{key === "dim" ? `${Math.round(adj.dim * 100)} %` : `${adj.blur} px`}</span>
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={stepV}
                    value={adj[key]}
                    onChange={(e) => onAdjust(current.id, { ...adj, [key]: Number(e.target.value) })}
                    className="accent-white"
                  />
                </label>
              ))}
              {current.kind === "photo" && (
                <button type="button" onClick={() => onRemove(current.id)} className="self-start text-red-400 hover:text-red-300">
                  Eliminar esta foto
                </button>
              )}
            </div>
          </LiquidGlass>
        </div>
      )}

      {notice && (
        <div className="absolute inset-x-0 text-center text-[11px] text-amber-300" style={{ bottom: ch * 0.06 + pill + 8 }}>
          {notice}
        </div>
      )}

      {/* Botones */}
      <div className="absolute inset-x-0 flex items-center justify-center" style={{ bottom: ch * 0.06, gap: 14 * (cw / 393) }} data-noswipe>
        <div style={{ width: pill }} />
        <LiquidGlass radius={pill / 2} bezel={8} refraction={8} blur={10} style={{ width: cw * 0.466, height: pill, background: "rgba(40,40,44,.6)" }}>
          <button type="button" onClick={() => setCustom((v) => !v)} className="size-full text-white" style={{ fontSize: 16 * (cw / 393) }}>
            Personalizar
          </button>
        </LiquidGlass>
        <LiquidGlass radius={pill / 2} bezel={8} refraction={8} blur={10} style={{ width: pill, height: pill, background: "rgba(40,40,44,.6)" }}>
          <button type="button" onClick={() => fileRef.current?.click()} title="Añadir foto" className="grid size-full place-items-center text-white">
            <svg viewBox="0 0 24 24" style={{ width: pill * 0.45, height: pill * 0.45 }} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </LiquidGlass>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onAdd(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
