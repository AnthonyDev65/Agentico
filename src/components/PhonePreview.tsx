import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Refresh01Icon,
  Cancel01Icon,
  SmartPhone01Icon,
  SmartPhoneLandscapeIcon,
  ZoomInIcon,
  ZoomOutIcon,
  Home01Icon,
  DashboardSquare01Icon,
  Add01Icon,
  GlobeIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

const DEVICE_SVG = "/devices/iphone-17-promax-deepblue.svg";
const PROXY =
  typeof window !== "undefined" && window.location.protocol.startsWith("http")
    ? "http://agproxy.localhost"
    : "agproxy://localhost";
const SCREEN = { left: 24 / 448, top: 21 / 916, right: 426 / 448, bottom: 895 / 916 };
const CORNER_VB = 54;
const ASPECT = 448 / 916;

const DEV_ID = "__dev__";
const HOME_BG = "#17172a";
const DEV_TILE = "#6366f1";

type WebApp = { id: string; name: string; url: string; color: string };

function luminance(color: string): number {
  let r = 255,
    g = 255,
    b = 255;
  const m = color.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(",").map((s) => parseFloat(s));
    [r, g, b] = p;
  } else if (color[0] === "#") {
    const h = color.slice(1);
    const hex = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
const fgOn = (bg: string) => (luminance(bg) < 0.6 ? "#ffffff" : "#000000");

function nowTime(): string {
  const d = new Date();
  let h = d.getHours() % 12;
  if (h === 0) h = 12;
  return `${h}:${d.getMinutes().toString().padStart(2, "0")}`;
}

const isOpaque = (c: string) =>
  !!c && c !== "transparent" && c !== "rgba(0, 0, 0, 0)" && !/,\s*0(\.0+)?\)\s*$/.test(c);

function bgFromCss(css: string): string {
  const re = /(?::root|html|body)[^{]*\{([^}]*)\}/gi;
  let m: RegExpExecArray | null;
  let found = "";
  while ((m = re.exec(css))) {
    const bm = m[1].match(/background(?:-color)?\s*:\s*([^;]+)/i);
    if (bm) {
      const col = bm[1].match(/#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)/i);
      if (col && isOpaque(col[0])) found = col[0];
    }
  }
  return found;
}

function StatusBar({ bg, time, heightPct }: { bg: string; time: string; heightPct: number }) {
  const fg = fgOn(bg);
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center"
      style={{ height: `${heightPct}%`, background: bg, color: fg }}
    >
      <svg viewBox="0 0 402 62" preserveAspectRatio="xMidYMid meet" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="69" y="33" textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight={600} fontFamily="'Plus Jakarta Sans Variable', system-ui, sans-serif" letterSpacing="0.2" fill="currentColor">
          {time}
        </text>
        <path fillRule="evenodd" clipRule="evenodd" d="M312.365 27.533C312.365 26.9 311.887 26.3868 311.298 26.3868H310.232C309.643 26.3868 309.165 26.9 309.165 27.533V37.467C309.165 38.1 309.643 38.6132 310.232 38.6132H311.298C311.887 38.6132 312.365 38.1 312.365 37.467V27.533ZM304.931 28.8321H305.998C306.587 28.8321 307.064 29.3576 307.064 30.0058V37.4395C307.064 38.0877 306.587 38.6132 305.998 38.6132H304.931C304.342 38.6132 303.864 38.0877 303.864 37.4395V30.0058C303.864 29.3576 304.342 28.8321 304.931 28.8321ZM300.599 31.4811H299.532C298.943 31.4811 298.466 32.0133 298.466 32.6698V37.4245C298.466 38.081 298.943 38.6132 299.532 38.6132H300.599C301.188 38.6132 301.666 38.081 301.666 37.4245V32.6698C301.666 32.0133 301.188 31.4811 300.599 31.4811ZM295.298 33.9264H294.232C293.643 33.9264 293.165 34.451 293.165 35.0981V37.4415C293.165 38.0886 293.643 38.6132 294.232 38.6132H295.298C295.887 38.6132 296.365 38.0886 296.365 37.4415V35.0981C296.365 34.451 295.887 33.9264 295.298 33.9264Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M327.937 28.8022C330.424 28.8023 332.816 29.7243 334.618 31.3778C334.754 31.5055 334.971 31.5039 335.105 31.3742L336.402 30.1107C336.47 30.045 336.507 29.9559 336.507 29.8632C336.506 29.7705 336.468 29.6819 336.399 29.6169C331.668 25.2422 324.204 25.2422 319.473 29.6169C319.405 29.6819 319.366 29.7705 319.365 29.8632C319.365 29.9558 319.402 30.0449 319.47 30.1107L320.768 31.3742C320.901 31.5041 321.119 31.5057 321.254 31.3778C323.057 29.7242 325.449 28.8022 327.937 28.8022ZM327.933 33.0224C329.291 33.0223 330.599 33.5341 331.606 34.4582C331.742 34.5894 331.956 34.5865 332.089 34.4518L333.376 33.1325C333.444 33.0633 333.481 32.9694 333.48 32.8719C333.479 32.7743 333.44 32.6812 333.371 32.6134C330.307 29.7226 325.562 29.7226 322.498 32.6134C322.429 32.6812 322.39 32.7744 322.389 32.8719C322.388 32.9695 322.426 33.0634 322.493 33.1325L323.78 34.4518C323.913 34.5865 324.127 34.5894 324.263 34.4582C325.269 33.5347 326.577 33.023 327.933 33.0224ZM330.458 35.816C330.46 35.9213 330.422 36.0229 330.355 36.0967L328.179 38.5514C328.115 38.6236 328.028 38.6642 327.937 38.6642C327.846 38.6642 327.759 38.6236 327.695 38.5514L325.518 36.0967C325.451 36.0229 325.414 35.9212 325.416 35.8159C325.418 35.7105 325.459 35.6108 325.529 35.5402C326.919 34.2263 328.955 34.2263 330.345 35.5402C330.415 35.6108 330.456 35.7106 330.458 35.816Z" fill="currentColor" />
        <rect opacity="0.35" x="344.007" y="26.5" width="24" height="12" rx="3.8" stroke="currentColor" />
        <path opacity="0.4" d="M369.507 30.7811V34.8566C370.312 34.5114 370.835 33.7085 370.835 32.8189C370.835 31.9293 370.312 31.1263 369.507 30.7811Z" fill="currentColor" />
        <rect x="345.507" y="28" width="21" height="9" rx="2.5" fill="currentColor" />
      </svg>
    </div>
  );
}

export default function PhonePreview({
  port,
  onPortChange,
  onExit,
}: {
  port: number;
  onPortChange: (p: number) => void;
  onExit: () => void;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const [landscape, setLandscape] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pageBg, setPageBg] = useState("#000000");
  const [probeDoc, setProbeDoc] = useState<string | null>(null);
  const [manualBg, setManualBg] = useState<string | null>(null);
  const [time, setTime] = useState(nowTime);

  // ── Home screen / apps ──
  const [userApps, setUserApps] = useState<WebApp[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("agentico.phoneApps") ?? "[]");
    } catch {
      return [];
    }
  });
  const [foreground, setForeground] = useState<string | null>(DEV_ID);
  const [running, setRunning] = useState<Set<string>>(new Set([DEV_ID]));
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const paneRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLIFrameElement>(null);

  const url = `http://localhost:${port}`;
  const devApp: WebApp = { id: DEV_ID, name: "Dev", url, color: DEV_TILE };
  const apps: WebApp[] = [devApp, ...userApps];
  const appById = (id: string) => apps.find((a) => a.id === id);

  const persistApps = (next: WebApp[]) => {
    setUserApps(next);
    try {
      localStorage.setItem("agentico.phoneApps", JSON.stringify(next));
    } catch {
      /* no-op */
    }
  };
  const openApp = (id: string) => {
    setRunning((s) => new Set(s).add(id));
    setForeground(id);
    setSwitcherOpen(false);
  };
  const goHome = () => {
    setForeground(null);
    setSwitcherOpen(false);
  };
  const closeApp = (id: string) => {
    setRunning((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    setForeground((f) => (f === id ? null : f));
  };
  const addApp = (name: string, rawUrl: string, color: string) => {
    const u = rawUrl.trim().startsWith("http") ? rawUrl.trim() : `http://${rawUrl.trim()}`;
    const app: WebApp = { id: crypto.randomUUID(), name: name.trim() || u, url: u, color };
    persistApps([...userApps, app]);
    setAddOpen(false);
    openApp(app.id);
  };
  const removeApp = (id: string) => {
    if (id === DEV_ID) return;
    persistApps(userApps.filter((a) => a.id !== id));
    closeApp(id);
  };

  // Detección del fondo de la app Dev (localhost) para la barra de estado.
  const readProbeBg = () => {
    try {
      const d = probeRef.current?.contentDocument;
      const win = probeRef.current?.contentWindow;
      if (!d) return;
      const gcs = (el: Element) => (win ? win.getComputedStyle(el) : getComputedStyle(el));
      let found = "";
      const w = win?.innerWidth || 390;
      for (const y of [6, 48, 120, 300]) {
        let el: Element | null = d.elementFromPoint ? d.elementFromPoint(Math.floor(w / 2), y) : null;
        let depth = 0;
        while (el && depth++ < 18) {
          const c = gcs(el).backgroundColor;
          if (isOpaque(c)) {
            found = c;
            break;
          }
          el = el.parentElement;
        }
        if (found) break;
      }
      if (!found && d.body) {
        const c = gcs(d.body).backgroundColor;
        if (isOpaque(c)) found = c;
      }
      if (!found && d.documentElement) {
        const c = gcs(d.documentElement).backgroundColor;
        if (isOpaque(c)) found = c;
      }
      if (found) setPageBg(found);
    } catch {
      /* no legible */
    }
  };

  useEffect(() => {
    let cancel = false;
    setProbeDoc(null);
    (async () => {
      let html = "";
      try {
        await invoke("set_proxy_port", { port });
        const r = await fetch(`${PROXY}/?agbg=${reloadKey}`, { cache: "no-store" });
        if (r.ok) html = await r.text();
      } catch {
        /* proxy no disponible */
      }
      if (!html) {
        try {
          const r = await fetch(`${url}/?agbg=${reloadKey}`, { cache: "no-store" });
          if (r.ok) html = await r.text();
        } catch {
          /* dev server apagado */
        }
      }
      if (!html || cancel) return;
      const tc =
        html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']theme-color["']/i);
      if (tc && isOpaque(tc[1].trim())) setPageBg(tc[1].trim());
      const inlineCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
      const fromCss = bgFromCss(inlineCss);
      if (fromCss) setPageBg(fromCss);
      const base = `<base href="${url}/"><style>html,body{min-height:100%!important}</style>`;
      let doc = html;
      if (/<head[^>]*>/i.test(doc)) doc = doc.replace(/<head[^>]*>/i, (m) => m + base);
      else doc = `<head>${base}</head>` + doc;
      if (!cancel) setProbeDoc(doc);
    })();
    return () => {
      cancel = true;
    };
  }, [port, reloadKey]);

  useEffect(() => {
    const id = setInterval(() => setTime(nowTime()), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const availW = Math.max(120, size.w - 40);
  const availH = Math.max(120, size.h - 40);
  const longPx = landscape ? Math.min(availW, availH / ASPECT) : Math.min(availH, availW / ASPECT);
  const shortPx = longPx * ASPECT;
  const radius = Math.round((shortPx * CORNER_VB) / 448);
  const boxW = landscape ? longPx : shortPx;
  const boxH = landscape ? shortPx : longPx;

  const screen = landscape
    ? { left: SCREEN.top, top: SCREEN.left, right: SCREEN.bottom, bottom: SCREEN.right }
    : SCREEN;
  const screenStyle: React.CSSProperties = {
    left: `${screen.left * 100}%`,
    top: `${screen.top * 100}%`,
    width: `${(screen.right - screen.left) * 100}%`,
    height: `${(screen.bottom - screen.top) * 100}%`,
    borderRadius: `${radius}px`,
  };
  const imgStyle: React.CSSProperties = landscape
    ? {
        position: "absolute",
        width: shortPx,
        height: longPx,
        left: (longPx - shortPx) / 2,
        top: (shortPx - longPx) / 2,
        transform: "rotate(90deg)",
        transformOrigin: "center",
      }
    : { position: "absolute", inset: 0, width: "100%", height: "100%" };

  const zf = zoom / 100;
  const topInset = landscape ? 0 : 7;

  // Color de la barra/pantalla según lo que esté en primer plano.
  const appStatusColor = (id: string | null) =>
    id === DEV_ID ? pageBg : id ? appById(id)?.color ?? HOME_BG : HOME_BG;
  const statusBg = manualBg ?? appStatusColor(foreground);
  const runningApps = apps.filter((a) => running.has(a.id));

  const appIframeStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: `calc(${100 / zf}% + 16px)`,
    height: `${100 / zf}%`,
    transform: `scale(${zf})`,
    transformOrigin: "top left",
    border: 0,
    background: "white",
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-3 text-xs text-zinc-400">
        <HugeiconsIcon icon={SmartPhone01Icon} size={14} />
        <span className="font-medium">Vista móvil</span>

        <button
          type="button"
          onClick={goHome}
          title="Inicio (home screen)"
          className={cn(
            "ml-1 flex size-6 items-center justify-center rounded",
            foreground === null ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
          )}
        >
          <HugeiconsIcon icon={Home01Icon} size={14} />
        </button>
        <button
          type="button"
          onClick={() => setSwitcherOpen((v) => !v)}
          title="Apps abiertas"
          className={cn(
            "flex size-6 items-center justify-center rounded",
            switcherOpen ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
          )}
        >
          <HugeiconsIcon icon={DashboardSquare01Icon} size={14} />
          {runningApps.length > 0 && (
            <span className="ml-0.5 text-[9px] text-zinc-500">{runningApps.length}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setLandscape((l) => !l)}
          title={landscape ? "Vertical" : "Horizontal"}
          className="flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <HugeiconsIcon icon={landscape ? SmartPhoneLandscapeIcon : SmartPhone01Icon} size={14} />
        </button>

        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => setZoom((z) => Math.max(25, z - 10))} title="Alejar" className="flex size-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            <HugeiconsIcon icon={ZoomOutIcon} size={12} />
          </button>
          <button type="button" onClick={() => setZoom(100)} title="Restablecer zoom" className="w-10 text-center tabular-nums hover:text-zinc-200">
            {zoom}%
          </button>
          <button type="button" onClick={() => setZoom((z) => Math.min(300, z + 10))} title="Acercar" className="flex size-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            <HugeiconsIcon icon={ZoomInIcon} size={12} />
          </button>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-zinc-500" title="Color de la barra de estado">
          <span>barra:</span>
          <label className="flex cursor-pointer items-center">
            <input type="color" value={manualBg ?? "#ffffff"} onChange={(e) => setManualBg(e.target.value)} className="size-4 cursor-pointer appearance-none rounded-sm border-0 bg-transparent p-0" />
          </label>
          <button type="button" onClick={() => setManualBg(null)} className={cn("rounded px-1.5 py-0.5", manualBg ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200" : "bg-zinc-700 text-white")}>
            Auto
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-zinc-500">
          <span>localhost:</span>
          <input type="number" value={port} onChange={(e) => onPortChange(Number(e.target.value) || port)} className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-200 outline-none focus:border-indigo-500" />
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-zinc-800 hover:text-zinc-200">
            <HugeiconsIcon icon={Refresh01Icon} size={12} /> Recargar
          </button>
          <button type="button" onClick={onExit} title="Salir del modo teléfono" className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-zinc-800 hover:text-zinc-200">
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
          </button>
        </div>
      </div>

      <div ref={paneRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#0a0a0a]">
        <div className="relative shrink-0 drop-shadow-2xl" style={{ width: boxW, height: boxH }}>
          <div className="absolute isolate overflow-hidden" style={{ ...screenStyle, background: statusBg }}>
            {/* Área de contenido (bajo la franja de la isla) */}
            <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ top: `${topInset}%` }}>
              {/* Home screen */}
              <div
                className={cn("absolute inset-0 overflow-auto", foreground !== null && "pointer-events-none opacity-0")}
                style={{ background: `linear-gradient(180deg, ${HOME_BG}, #0b0b14)` }}
              >
                <HomeGrid apps={apps} devBg={pageBg} onOpen={openApp} onAdd={() => setAddOpen(true)} onRemove={removeApp} />
              </div>

              {/* Apps abiertas (montadas; se mantienen en segundo plano) */}
              {runningApps.map((a) => (
                <div
                  key={a.id}
                  className={cn("absolute inset-0", foreground === a.id ? "" : "pointer-events-none opacity-0")}
                >
                  <iframe
                    src={a.url}
                    title={a.name}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                    style={appIframeStyle}
                  />
                </div>
              ))}

              {/* App switcher */}
              {switcherOpen && (
                <div className="absolute inset-0 z-20 flex flex-col bg-black/75 p-3 backdrop-blur-sm">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/60">
                    Apps abiertas
                  </div>
                  {runningApps.length === 0 ? (
                    <div className="text-xs text-white/50">No hay apps abiertas.</div>
                  ) : (
                    <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-auto">
                      {runningApps.map((a) => (
                        <div key={a.id} className="relative">
                          <button
                            type="button"
                            onClick={() => openApp(a.id)}
                            className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-white/15 text-xs font-medium shadow-lg"
                            style={{ background: a.id === DEV_ID ? DEV_TILE : a.color, color: fgOn(a.id === DEV_ID ? DEV_TILE : a.color) }}
                          >
                            {a.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => closeApp(a.id)}
                            title="Cerrar"
                            className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-black text-white shadow"
                          >
                            <HugeiconsIcon icon={Cancel01Icon} size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => setSwitcherOpen(false)} className="mt-2 rounded-lg bg-white/10 py-1.5 text-xs text-white hover:bg-white/15">
                    Cerrar
                  </button>
                </div>
              )}

              {/* Añadir app */}
              {addOpen && <AddAppForm onAdd={addApp} onCancel={() => setAddOpen(false)} />}

              {/* Barra de inicio (home indicator): un toque → inicio */}
              {!switcherOpen && !addOpen && (
                <button
                  type="button"
                  onClick={goHome}
                  onDoubleClick={() => setSwitcherOpen(true)}
                  title="Inicio (doble clic: apps)"
                  className="absolute inset-x-0 bottom-0 z-30 flex h-6 items-end justify-center pb-1.5"
                >
                  <span className="h-1 w-1/3 rounded-full" style={{ background: fgOn(statusBg) === "#ffffff" ? "rgba(255,255,255,.6)" : "rgba(0,0,0,.4)" }} />
                </button>
              )}
            </div>

            {!landscape && <StatusBar bg={statusBg} time={time} heightPct={topInset} />}
          </div>

          {probeDoc && (
            <iframe
              ref={probeRef}
              key={`${port}-${reloadKey}`}
              srcDoc={probeDoc}
              title="probe"
              aria-hidden
              tabIndex={-1}
              sandbox="allow-same-origin"
              onLoad={() => {
                readProbeBg();
                [200, 600, 1200, 2500, 4000].forEach((t) => setTimeout(readProbeBg, t));
              }}
              style={{ position: "absolute", width: 390, height: 844, left: -99999, top: 0, opacity: 0, pointerEvents: "none", border: 0 }}
            />
          )}

          <img src={DEVICE_SVG} alt="" draggable={false} className="pointer-events-none select-none" style={imgStyle} />
        </div>
      </div>
    </div>
  );
}

function HomeGrid({
  apps,
  devBg,
  onOpen,
  onAdd,
  onRemove,
}: {
  apps: WebApp[];
  devBg: string;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-x-3 gap-y-4 p-4 pt-5">
      {apps.map((a) => {
        const tile = a.id === DEV_ID ? DEV_TILE : a.color;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onOpen(a.id)}
            onContextMenu={(e) => {
              if (a.id !== DEV_ID) {
                e.preventDefault();
                onRemove(a.id);
              }
            }}
            className="group flex flex-col items-center gap-1"
            title={a.id === DEV_ID ? a.url : `${a.url} — clic derecho: quitar`}
          >
            <span
              className="grid aspect-square w-full place-items-center rounded-[26%] text-base font-bold shadow-lg shadow-black/40"
              style={{ background: tile, color: fgOn(tile) }}
            >
              {a.id === DEV_ID ? (
                <HugeiconsIcon icon={GlobeIcon} size={18} />
              ) : (
                a.name.trim()[0]?.toUpperCase() || "?"
              )}
            </span>
            <span className="max-w-full truncate text-[10px] text-white/90">{a.name}</span>
          </button>
        );
      })}
      <button type="button" onClick={onAdd} className="flex flex-col items-center gap-1" title="Añadir web app">
        <span className="grid aspect-square w-full place-items-center rounded-[26%] border border-dashed border-white/25 text-white/70">
          <HugeiconsIcon icon={Add01Icon} size={18} />
        </span>
        <span className="text-[10px] text-white/70">Añadir</span>
      </button>
      <div className="col-span-4 h-2" />
      <div className="col-span-4 -mt-1 text-center text-[9px] text-white/40" style={{ color: fgOn(devBg) === "#ffffff" ? "rgba(255,255,255,.4)" : "rgba(255,255,255,.4)" }}>
        Mantén apps abiertas y cámbialas desde el switcher
      </div>
    </div>
  );
}

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6"];

function AddAppForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, url: string, color: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full rounded-2xl border border-white/10 bg-[#1a1a1a] p-3">
        <div className="mb-2 text-xs font-medium text-zinc-100">Añadir web app</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="nombre"
          spellCheck={false}
          className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-indigo-500"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim()) onAdd(name, url, color);
          }}
          placeholder="URL (ej. localhost:3000 o https://…)"
          spellCheck={false}
          className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100 outline-none focus:border-indigo-500"
        />
        <div className="mb-3 flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn("size-5 rounded-full", color === c && "ring-2 ring-white ring-offset-2 ring-offset-[#1a1a1a]")}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!url.trim()}
            onClick={() => onAdd(name, url, color)}
            className="flex-1 rounded-md bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Añadir
          </button>
          <button type="button" onClick={onCancel} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
