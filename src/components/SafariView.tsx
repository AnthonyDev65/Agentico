import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import LiquidGlass from "@/components/LiquidGlass";
import IconGlass from "@/components/IconGlass";
import { squircleClip } from "@/lib/squircle";
import { originOf, pathOf, proxyBase, toUrl } from "@/lib/phoneProxy";

// Clon de Safari (iOS 26) para la vista móvil: la página ocupa la pantalla y la barra de
// direcciones flota abajo en cristal líquido. Navega por el proxy «agsafari», que cambia
// de destino en cada sitio; los enlaces a otro dominio llegan como __agopen (vía `request`).

export type SafariFavorite = { name: string; url: string; color: string };
type Props = {
  /** px por punto de iOS. */
  pt: number;
  /** Alto de la barra de estado, en % de la pantalla. */
  statusPct: number;
  zf: number;
  reloadKey: number;
  /** Navegación pedida desde fuera (enlace externo de otra app o de la propia página). */
  request: { url: string; n: number } | null;
  favorites: SafariFavorite[];
  /** Color de fondo detectado en la página (para la franja de la barra de estado). */
  pageBg?: string;
  frameRef: (el: HTMLIFrameElement | null) => void;
};

const SLOT = "agsafari";

function favicon(url: string) {
  try {
    const host = new URL(url).hostname;
    if (/^(localhost|127\.|0\.0\.0\.0)/.test(host)) return null;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
  } catch {
    return null;
  }
}

function FavTile({ fav, size, onOpen }: { fav: SafariFavorite; size: number; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const src = favicon(fav.url);
  return (
    <button type="button" onClick={onOpen} className="flex flex-col items-center" style={{ width: size, gap: size * 0.1 }}>
      <span
        className="relative grid place-items-center overflow-hidden bg-white"
        style={{ width: size, height: size, clipPath: squircleClip(size, size, size * 0.225, 0.6) }}
      >
        {src && !failed ? (
          <img src={src} alt="" draggable={false} onError={() => setFailed(true)} style={{ width: size * 0.55, height: size * 0.55 }} />
        ) : (
          <span className="grid size-full place-items-center font-bold text-white" style={{ background: fav.color, fontSize: size * 0.42 }}>
            {fav.name.trim()[0]?.toUpperCase() || "?"}
          </span>
        )}
        <IconGlass size={size} radius={size * 0.225} />
      </span>
      <span className="w-[130%] truncate text-center text-[#3c3c43]" style={{ fontSize: size * 0.19 }}>
        {fav.name}
      </span>
    </button>
  );
}

export default function SafariView({ pt, statusPct, zf, reloadKey, request, favorites, pageBg, frameRef }: Props) {
  const [hist, setHist] = useState<string[]>([]);
  const [idx, setIdx] = useState(-1);
  const url = idx >= 0 ? hist[idx] : null;
  const [src, setSrc] = useState("about:blank");
  const [loadN, setLoadN] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState(false);
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const urlRef = useRef<string | null>(null);
  urlRef.current = url;
  const idxRef = useRef(idx);
  idxRef.current = idx;

  const load = async (u: string) => {
    const o = originOf(u);
    if (!o) return;
    loadingRef.current = true;
    setLoading(true);
    await invoke("set_proxy_target", { slot: SLOT, base: o }).catch(() => {});
    setSrc(`${proxyBase(SLOT)}${pathOf(u)}`);
    setLoadN((n) => n + 1); // iframe nuevo: recarga aunque la URL sea la misma
  };

  const go = (u: string) => {
    setHist((h) => [...h.slice(0, idx + 1), u]);
    setIdx((i) => i + 1);
    setEditing(false);
    setMenu(false);
    load(u);
  };
  const back = () => {
    setMenu(false);
    if (idx <= 0) {
      setIdx(-1); // página de inicio
      return;
    }
    setIdx(idx - 1);
    load(hist[idx - 1]);
  };
  const forward = () => {
    setMenu(false);
    if (idx >= hist.length - 1) return;
    setIdx(idx + 1);
    load(hist[idx + 1]);
  };
  const reload = () => {
    setMenu(false);
    if (url) load(url);
  };

  // Enlaces externos (de otras apps o de la propia página).
  useEffect(() => {
    if (request) go(request.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.n]);

  useEffect(() => {
    if (url) load(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  // Navegación dentro del mismo sitio (enlaces, pushState): el script del proxy avisa con
  // __agnav. Mientras carga, sustituye la entrada actual (redirecciones); después, añade.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!iframe.current || e.source !== iframe.current.contentWindow) return;
      const path = (e.data as { __agnav?: string } | null)?.__agnav;
      const cur = urlRef.current;
      if (typeof path !== "string" || !cur) return;
      const o = originOf(cur);
      if (!o) return;
      const next = o + (path || "/");
      if (next === cur) return;
      if (loadingRef.current) {
        setHist((h) => h.map((x, i) => (i === idxRef.current ? next : x)));
      } else {
        setHist((h) => [...h.slice(0, idxRef.current + 1), next]);
        setIdx((i) => i + 1);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  const host = (() => {
    if (!url) return "";
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  })();
  const secure = !!url?.startsWith("https://");

  const startEdit = () => {
    setDraft(url ?? "");
    setMenu(false);
    setEditing(true);
  };

  const barH = 48 * pt;
  const glass = { background: "rgba(250,250,252,.62)" } as React.CSSProperties;
  const iframeStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: `${100 / zf}%`,
    height: `${100 / zf}%`,
    transform: `scale(${zf})`,
    transformOrigin: "top left",
    border: 0,
    background: "white",
  };
  const fav = 60 * pt;

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: url ? pageBg || "#ffffff" : "#f2f2f7" }}>
      {/* Página (bajo la barra de estado; la barra de Safari flota encima) */}
      <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ top: `${statusPct}%` }}>
        {url ? (
          <iframe
            key={`${loadN}-${reloadKey}`}
            ref={(el) => {
              iframe.current = el;
              frameRef(el);
            }}
            name="agphone"
            src={src}
            title="Safari"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            style={iframeStyle}
            onLoad={() => {
              loadingRef.current = false;
              setLoading(false);
            }}
          />
        ) : (
          // Página de inicio: Favoritos
          <div className="size-full overflow-y-auto [scrollbar-width:none]" style={{ padding: `${24 * pt}px ${29 * pt}px ${120 * pt}px` }}>
            <div className="font-bold text-black" style={{ fontSize: 22 * pt, marginBottom: 16 * pt }}>
              Favoritos
            </div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(4, ${fav}px)`, columnGap: 29 * pt, rowGap: 18 * pt, justifyContent: "space-between" }}>
              {favorites.map((f) => (
                <FavTile key={f.url} fav={f} size={fav} onOpen={() => go(f.url)} />
              ))}
            </div>
          </div>
        )}
        {loading && (
          <div className="absolute left-0 top-0 h-[2px] w-full overflow-hidden">
            <div className="h-full w-1/2 animate-pulse bg-[#0a84ff]" />
          </div>
        )}
      </div>

      {/* Toque fuera para cerrar el menú */}
      {menu && <div className="absolute inset-0" onClick={() => setMenu(false)} />}

      {/* Barra inferior flotante (iOS 26) */}
      <div
        className="absolute inset-x-0 flex items-center"
        style={{ bottom: 22 * pt, paddingLeft: 14 * pt, paddingRight: 14 * pt, gap: 8 * pt }}
      >
        {editing ? (
          <LiquidGlass radius={barH / 2} bezel={8 * pt} refraction={10 * pt} blur={10} className="flex-1" style={{ ...glass, height: barH }} contentClassName="flex items-center">
            <form
              className="flex h-full w-full items-center"
              style={{ paddingLeft: 16 * pt, paddingRight: 8 * pt, gap: 8 * pt }}
              onSubmit={(e) => {
                e.preventDefault();
                const u = toUrl(draft);
                if (u) go(u);
              }}
            >
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
                placeholder="Buscar o introducir sitio web"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-black placeholder-black/40 outline-none"
                style={{ fontSize: 16 * pt }}
              />
              <button type="button" onClick={() => setEditing(false)} className="shrink-0 text-[#0a84ff]" style={{ fontSize: 15 * pt }}>
                Cancelar
              </button>
            </form>
          </LiquidGlass>
        ) : (
          <>
            <LiquidGlass radius={barH / 2} bezel={8 * pt} refraction={10 * pt} blur={10} style={{ ...glass, width: barH, height: barH }}>
              <button
                type="button"
                onClick={back}
                disabled={idx < 0}
                title="Atrás"
                className="grid size-full place-items-center text-black disabled:text-black/25"
              >
                <svg viewBox="0 0 24 24" style={{ width: 20 * pt, height: 20 * pt }} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </button>
            </LiquidGlass>
            <LiquidGlass radius={barH / 2} bezel={8 * pt} refraction={10 * pt} blur={10} className="min-w-0 flex-1" style={{ ...glass, height: barH }}>
              <button
                type="button"
                onClick={startEdit}
                className="flex size-full items-center justify-center text-black"
                style={{ gap: 5 * pt, paddingLeft: 14 * pt, paddingRight: 14 * pt, fontSize: 15 * pt }}
              >
                {url ? (
                  <>
                    {secure && (
                      <svg viewBox="0 0 24 24" className="flex-none text-black/55" style={{ width: 12 * pt, height: 12 * pt }} fill="currentColor">
                        <path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h1zm2 0h6V7a3 3 0 0 0-6 0v3z" />
                      </svg>
                    )}
                    <span className="truncate font-medium">{host}</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="flex-none text-black/50" style={{ width: 15 * pt, height: 15 * pt }} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3-3" />
                    </svg>
                    <span className="truncate text-black/50">Buscar o introducir sitio web</span>
                  </>
                )}
              </button>
            </LiquidGlass>
            <div className="relative">
              <LiquidGlass radius={barH / 2} bezel={8 * pt} refraction={10 * pt} blur={10} style={{ ...glass, width: barH, height: barH }}>
                <button type="button" onClick={() => setMenu((m) => !m)} title="Más" className="grid size-full place-items-center text-black">
                  <svg viewBox="0 0 24 24" style={{ width: 20 * pt, height: 20 * pt }} fill="currentColor">
                    <circle cx="5" cy="12" r="1.9" />
                    <circle cx="12" cy="12" r="1.9" />
                    <circle cx="19" cy="12" r="1.9" />
                  </svg>
                </button>
              </LiquidGlass>
              {menu && (
                <div className="absolute right-0" style={{ bottom: barH + 10 * pt, width: 220 * pt }}>
                  <LiquidGlass radius={22 * pt} bezel={8 * pt} refraction={8 * pt} blur={14} style={{ background: "rgba(250,250,252,.8)" }}>
                    <div className="flex flex-col py-1 text-black" style={{ fontSize: 15 * pt }}>
                      {[
                        { label: "Adelante", on: forward, off: idx >= hist.length - 1 },
                        { label: "Recargar", on: reload, off: !url },
                        { label: "Página de inicio", on: () => (setMenu(false), setIdx(-1)), off: !url },
                        { label: "Abrir en el navegador", on: () => (setMenu(false), url && openUrl(url).catch(() => {})), off: !url },
                      ].map((it) => (
                        <button
                          key={it.label}
                          type="button"
                          disabled={it.off}
                          onClick={it.on}
                          className="text-left hover:bg-black/5 disabled:text-black/30"
                          style={{ padding: `${10 * pt}px ${16 * pt}px` }}
                        >
                          {it.label}
                        </button>
                      ))}
                    </div>
                  </LiquidGlass>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
