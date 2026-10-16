import { useEffect, useRef, useState } from "react";
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
  ComputerTerminal01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { squircleClip } from "@/lib/squircle";
import LiquidGlass from "@/components/LiquidGlass";
import IconGlass from "@/components/IconGlass";
import WallpaperGallery, {
  BUILTIN_WALLPAPERS,
  WallpaperLayer,
  loadWalls,
  photoToWallpaper,
  saveWalls,
  type WallState,
} from "@/components/WallpaperGallery";
import SafariView, { type SafariFavorite } from "@/components/SafariView";
import { originOf, pathOf, proxyBase } from "@/lib/phoneProxy";

// Cada app se carga por un proxy de Agentico (Dev → «agproxy», las añadidas → «agapp0..7»,
// cada una con su propio origen). El proxy simula las safe areas del iPhone (reescribe
// env(safe-area-inset-*) a variables que fijamos aquí por postMessage), hace sin CORS las
// peticiones de la página a su API y reenvía su consola.
const APP_SLOTS = 8;
type PhoneLog = { id: number; app: string; level: string; text: string };
type Insets = { top: number; right: number; bottom: number; left: number };
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

const DEVICE_SVG = "/devices/iphone-17-promax-deepblue.svg";
const SCREEN = { left: 24 / 448, top: 21 / 916, right: 426 / 448, bottom: 895 / 916 };
const CORNER_VB = 54;
const ASPECT = 448 / 916;

const DEV_ID = "__dev__";
const DEV_TILE = "#6366f1";

// Safari integrado (clon de iOS): navegador por el proxy «agsafari».
const SAFARI_ID = "__safari__";
const SAFARI_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#22d0ff'/><stop offset='1' stop-color='#0a5cf0'/></linearGradient></defs>" +
      "<rect width='100' height='100' fill='#fff'/>" +
      "<circle cx='50' cy='50' r='41' fill='url(#g)'/>" +
      "<circle cx='50' cy='50' r='35' fill='none' stroke='#fff' stroke-width='5' stroke-dasharray='0.7 2.6' opacity='.75'/>" +
      "<polygon points='76,24 55,55 45,45' fill='#ff3b30'/>" +
      "<polygon points='24,76 45,45 55,55' fill='#fff'/>" +
      "</svg>",
  );
const SAFARI_DEFAULTS: SafariFavorite[] = [
  { name: "DuckDuckGo", url: "https://duckduckgo.com", color: "#de5833" },
  { name: "Wikipedia", url: "https://es.wikipedia.org", color: "#111111" },
  { name: "GitHub", url: "https://github.com", color: "#24292f" },
  { name: "MDN", url: "https://developer.mozilla.org/es/", color: "#000000" },
];

// Layout del home
const COLS = 4;
const ROWS = 6;

// Cuadrícula del home de iOS, medida sobre una captura real de iPhone (lienzo de 393 pt).
// Los 4 iconos se reparten con el MISMO espacio entre ellos y hasta el borde:
// 5 × 29 pt + 4 × 62 pt = 393 pt. Todo se escala al ancho real del mock:
// 1 pt = (ancho de pantalla / 393) px.
const IOS = {
  canvasW: 393,
  icon: 62,
  gapX: 29, // = margen lateral (reparto uniforme)
  gapY: 16, // fila a fila ≈ 98 pt (icono + nombre + 16)
  padX: 29,
  padTop: 82,
  iconRadius: 14, // esquina continua (≈ 22,5 % del icono)
  label: 12,
  labelGap: 5,
  dockH: 94,
  dockInsetX: 13,
  dockBottom: 15,
  dockArea: 94 + 15,
  dockRadius: 40,
};
const PER_PAGE = COLS * ROWS;

type WebApp = { id: string; name: string; url: string; color: string; icon?: string };
type Rect = { x: number; y: number; w: number; h: number };
type Transition = { id: string; dir: "open" | "close" } | null;

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

// Favicon de una URL (null para localhost: usamos el icono Globe).
function faviconFor(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    if (/^(localhost|127\.|0\.0\.0\.0|::1|\[::1\])/.test(host)) return null;
    return `https://www.google.com/s/ticon?sz=64&domain=${host}`;
  } catch {
    return null;
  }
}

// Overlay transparente: los glifos se invierten contra el contenido de la app
// (cero detección de color). La app pinta su propio fondo bajo la barra.
function StatusBar({ time, heightPct }: { time: string; heightPct: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center"
      style={{ height: `${heightPct}%`, color: "#ffffff", mixBlendMode: "difference" }}
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
  const [time, setTime] = useState(nowTime);

  // Fondo de pantalla (mantener pulsado el fondo del home abre la galería).
  const [wallState, setWallState] = useState<WallState>(loadWalls);
  const [wallOpen, setWallOpen] = useState(false);
  const [wallNotice, setWallNotice] = useState<string | null>(null);
  const walls = [...BUILTIN_WALLPAPERS, ...wallState.custom];
  const currentWall = walls.find((w) => w.id === wallState.selected) ?? walls[0];
  const updateWalls = (fn: (s: WallState) => WallState) =>
    setWallState((s) => {
      const n = fn(s);
      if (saveWalls(n)) {
        setWallNotice(null);
        return n;
      }
      setWallNotice("No queda espacio para más fotos: elimina alguna.");
      return s;
    });
  // Por app: ¿declara viewport-fit=cover? Como en iOS: sí → pinta bajo la barra de estado
  // y recibe safe areas; no → modo Safari (empieza bajo la barra, env() = 0).
  const [covers, setCovers] = useState<Record<string, boolean>>({});
  const [bgs, setBgs] = useState<Record<string, string>>({});
  // Origen configurado en cada esquema de proxy (para no cargar antes de tiempo).
  const [targets, setTargets] = useState<Record<string, string>>({});
  const frames = useRef<Record<string, HTMLIFrameElement | null>>({});
  const insetsFor = useRef<(id: string) => Insets>(() => NO_INSETS);
  const [showConsole, setShowConsole] = useState(false);
  const [logs, setLogs] = useState<PhoneLog[]>([]);
  const logId = useRef(0);
  const logEnd = useRef<HTMLDivElement>(null);

  // ── Home screen / apps ──
  const [userApps, setUserApps] = useState<WebApp[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("agentico.phoneApps") ?? "[]");
    } catch {
      return [];
    }
  });
  // Al entrar en modo teléfono se abre Dev directamente (no el homescreen).
  const [foreground, setForeground] = useState<string | null>(DEV_ID);
  const [running, setRunning] = useState<string[]>([DEV_ID]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<WebApp | null>(null);

  // Animación morph (apertura/cierre de app)
  const [transition, setTransition] = useState<Transition>(null);
  const [expanded, setExpanded] = useState(false);
  const iconRects = useRef<Record<string, Rect>>({});

  // Switcher (mazo de tarjetas): posición continua (índice enfocado, sigue al dedo),
  // arrastre en curso (sin transiciones) y desplazamiento vertical de cada tarjeta.
  const [deckF, setDeckF] = useState(0);
  const [deckDragging, setDeckDragging] = useState(false);
  const [cardDy, setCardDy] = useState<Record<string, number>>({});

  const paneRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState({ w: 0, h: 0 });

  const url = `http://localhost:${port}`;
  const [devCfg, setDevCfg] = useState<{ name?: string; color?: string; icon?: string }>(() => {
    try {
      return JSON.parse(localStorage.getItem("agentico.phoneDev") ?? "{}");
    } catch {
      return {};
    }
  });
  const devApp: WebApp = { id: DEV_ID, name: devCfg.name || "Dev", url, color: devCfg.color || DEV_TILE, icon: devCfg.icon };
  const safariApp: WebApp = { id: SAFARI_ID, name: "Safari", url: "https://www.apple.com/safari/", color: "#ffffff", icon: SAFARI_ICON };
  const apps: WebApp[] = [devApp, safariApp, ...userApps];
  const appById = (id: string) => apps.find((a) => a.id === id);

  // Apps del dock (ids, en orden). El resto va en la pantalla de inicio.
  const [dockIds, setDockIds] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("agentico.phoneDock") ?? "null");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [DEV_ID, SAFARI_ID];
    } catch {
      return [DEV_ID, SAFARI_ID];
    }
  });
  const saveDock = (ids: string[]) => {
    setDockIds(ids);
    try {
      localStorage.setItem("agentico.phoneDock", JSON.stringify(ids));
    } catch {
      /* no-op */
    }
  };
  const dockApps = dockIds.map((id) => appById(id)).filter(Boolean) as WebApp[];
  const gridApps = apps.filter((a) => !dockIds.includes(a.id));

  const persistApps = (next: WebApp[]) => {
    setUserApps(next);
    try {
      localStorage.setItem("agentico.phoneApps", JSON.stringify(next));
    } catch {
      /* no-op */
    }
  };

  // Mide el icono pulsado (relativo al área de contenido) para el morph.
  const captureRect = (id: string, el: HTMLElement | null) => {
    const cr = contentRef.current?.getBoundingClientRect();
    const ir = el?.getBoundingClientRect();
    if (!cr || !ir) return;
    iconRects.current[id] = { x: ir.left - cr.left, y: ir.top - cr.top, w: ir.width, h: ir.height };
  };

  const openApp = (id: string, iconEl?: HTMLElement | null) => {
    if (iconEl) captureRect(id, iconEl);
    setRunning((r) => (r.includes(id) ? r : [...r, id]));
    setForeground(id);
    setSwitcherOpen(false);
    if (iconRects.current[id]) {
      setExpanded(false);
      setTransition({ id, dir: "open" });
    } else {
      setTransition(null);
      setExpanded(true);
    }
  };

  const goHome = () => {
    setWallOpen(false);
    setSwitcherOpen(false);
    if (foreground && iconRects.current[foreground]) {
      setExpanded(true);
      setTransition({ id: foreground, dir: "close" });
    } else {
      setForeground(null);
      setTransition(null);
    }
  };

  const closeApp = (id: string) => {
    setRunning((r) => r.filter((x) => x !== id));
    setForeground((f) => (f === id ? null : f));
    setTransition((t) => (t?.id === id ? null : t));
  };

  const normalizeUrl = (raw: string) => {
    const t = raw.trim();
    return t.startsWith("http") ? t : `http://${t}`;
  };

  const addApp = (data: AppFormData) => {
    const u = normalizeUrl(data.url);
    const app: WebApp = { id: crypto.randomUUID(), name: data.name.trim() || u, url: u, color: data.color, icon: data.icon };
    persistApps([...userApps, app]);
    setAddOpen(false);
    openApp(app.id);
  };

  const updateApp = (id: string, data: AppFormData) => {
    if (id === DEV_ID) {
      const cfg = { name: data.name.trim() || undefined, color: data.color, icon: data.icon };
      setDevCfg(cfg);
      try {
        localStorage.setItem("agentico.phoneDev", JSON.stringify(cfg));
      } catch {
        /* no-op (icono demasiado grande) */
      }
      setEditing(null);
      return;
    }
    const u = normalizeUrl(data.url);
    persistApps(userApps.map((a) => (a.id === id ? { ...a, name: data.name.trim() || u, url: u, color: data.color, icon: data.icon } : a)));
    setEditing(null);
  };

  const removeApp = (id: string) => {
    if (id === DEV_ID) return;
    persistApps(userApps.filter((a) => a.id !== id));
    closeApp(id);
  };

  // Dispara la segunda fase de la transición (arranque → destino) en el frame siguiente.
  useEffect(() => {
    if (!transition) return;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setExpanded(transition.dir === "open"));
    });
    return () => cancelAnimationFrame(raf);
  }, [transition]);

  const onMorphEnd = (id: string) => {
    setTransition((t) => {
      if (!t || t.id !== id) return t;
      if (t.dir === "close") setForeground(null);
      return null;
    });
  };

  const openSwitcher = () => {
    if (running.length === 0) return;
    const idx = foreground ? Math.max(0, running.indexOf(foreground)) : running.length - 1;
    setDeckF(idx);
    setCardDy({});
    setSwitcherOpen(true);
  };

  // Tarjeta lanzada hacia arriba: cierra la app y reajusta el mazo.
  const swipeClose = (id: string) => {
    const idx = running.indexOf(id);
    const left = running.length - 1;
    closeApp(id);
    setCardDy((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    if (left <= 0) {
      setSwitcherOpen(false);
      setForeground(null);
      return;
    }
    setDeckF((f) => {
      const r = Math.round(f);
      return Math.max(0, Math.min(left - 1, idx < r ? r - 1 : r));
    });
  };

  // Esquema de proxy de cada app (las añadidas, por su posición; más de 8 → directas).
  const slotOf = (a: WebApp): string | null => {
    if (a.id === SAFARI_ID || !originOf(a.url)) return null; // Safari gestiona su proxy
    if (a.id === DEV_ID) return "agproxy";
    const i = userApps.findIndex((u) => u.id === a.id);
    return i >= 0 && i < APP_SLOTS ? `agapp${i}` : null;
  };
  const srcOf = (a: WebApp) => {
    const slot = slotOf(a);
    if (!slot) return a.url;
    return targets[slot] === originOf(a.url) ? `${proxyBase(slot)}${pathOf(a.url)}` : "about:blank";
  };

  // Configura el destino de cada proxy antes de cargar su app.
  const wanted = running
    .map((id) => appById(id))
    .filter(Boolean)
    .map((a) => [slotOf(a!), originOf(a!.url)] as const)
    .filter(([slot, origin]) => slot && origin && targets[slot] !== origin);
  const wantedKey = wanted.map(([s1, o]) => `${s1}=${o}`).join("|");
  useEffect(() => {
    let cancelled = false;
    for (const [slot, origin] of wanted) {
      invoke("set_proxy_target", { slot, base: origin })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setTargets((t) => ({ ...t, [slot!]: origin! }));
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey]);

  // Petición de navegación para Safari (enlace externo pulsado en cualquier app).
  const [safariReq, setSafariReq] = useState<{ url: string; n: number } | null>(null);
  const openInSafari = useRef<(url: string) => void>(() => {});
  openInSafari.current = (u: string) => {
    setSafariReq((r) => ({ url: u, n: (r?.n ?? 0) + 1 }));
    setRunning((r) => (r.includes(SAFARI_ID) ? r : [...r, SAFARI_ID]));
    setForeground(SAFARI_ID);
    setSwitcherOpen(false);
    setTransition(null);
    setExpanded(true);
  };
  const safariFavorites: SafariFavorite[] = [
    ...userApps.filter((a) => originOf(a.url)).map((a) => ({ name: a.name, url: a.url, color: a.color })),
    { name: devApp.name, url, color: devApp.color },
    ...SAFARI_DEFAULTS,
  ];

  // Mensajes del script del proxy: viewport-fit, color de fondo y consola de cada app.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const id = Object.keys(frames.current).find((k) => frames.current[k]?.contentWindow === e.source);
      if (!id) return;
      const w = frames.current[id]!.contentWindow!;
      const d = e.data as {
        __agviewport?: { cover?: boolean };
        __agproxyBg?: string;
        __agconsole?: { level?: string; text?: string };
        __agopen?: string;
      } | null;
      if (typeof d?.__agopen === "string" && /^https?:\/\//i.test(d.__agopen)) {
        openInSafari.current(d.__agopen);
        return;
      }
      if (d?.__agviewport) {
        const c = !!d.__agviewport.cover;
        setCovers((m) => (m[id] === c ? m : { ...m, [id]: c }));
        // Con el valor nuevo (el estado aún no se ha aplicado).
        w.postMessage({ __agsafe: c && id !== SAFARI_ID ? insetsFor.current(id) : NO_INSETS }, "*");
      }
      if (typeof d?.__agproxyBg === "string") {
        const bg = d.__agproxyBg;
        setBgs((m) => (m[id] === bg ? m : { ...m, [id]: bg }));
      }
      const c = d?.__agconsole;
      if (c && typeof c.text === "string") {
        const text = c.text;
        setLogs((l) => [...l.slice(-399), { id: ++logId.current, app: id, level: c.level || "log", text }]);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (showConsole) logEnd.current?.scrollIntoView();
  }, [logs, showConsole]);

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

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContent({ w: el.clientWidth, h: el.clientHeight }));
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

  const runningApps = running.map((id) => appById(id)).filter(Boolean) as WebApp[];

  // Safe areas en px CSS del iframe (escaladas al tamaño del mock; iPhone: 62 arriba,
  // 34 abajo en vertical; 62 a los lados y 21 abajo en horizontal). Solo con cover.
  const frameW = (content.w || 1) / zf;
  const frameH = (content.h || 1) / zf;
  const deviceInsets: Insets = landscape
    ? { top: 0, left: Math.round((frameW * 62) / 874), right: Math.round((frameW * 62) / 874), bottom: Math.round((frameH * 21) / 402) }
    : { top: Math.round((frameH * topInset) / 100), right: 0, bottom: Math.round((frameH * 34) / 874), left: 0 };
  insetsFor.current = () => deviceInsets;
  const insetsKey = `${deviceInsets.top},${deviceInsets.right},${deviceInsets.bottom},${deviceInsets.left}|${JSON.stringify(covers)}`;
  useEffect(() => {
    for (const [id, f] of Object.entries(frames.current)) {
      f?.contentWindow?.postMessage({ __agsafe: covers[id] && id !== SAFARI_ID ? deviceInsets : NO_INSETS }, "*");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insetsKey]);
  // Pinta bajo la barra de estado (cover) o empieza debajo (Safari).
  const bleeds = (a: WebApp) => landscape || !!covers[a.id];
  const errors = logs.filter((l) => l.level === "error").length;

  const appIframeStyle: React.CSSProperties = {
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

  // Home visible: detrás durante el cierre, oculto durante apertura/switcher.
  const homeVisible = switcherOpen
    ? true
    : transition
    ? transition.dir === "close"
    : foreground === null;

  const cw = content.w || 1;
  const ch = content.h || 1;

  // Geometría del mazo del switcher.
  // Como iOS: la enfocada al centro, las anteriores apiladas a la izquierda (asoman) y
  // las siguientes separadas a la derecha.
  const cardScale = 0.7;
  const cardW = cw * cardScale;
  const cardH = ch * cardScale;
  const cardTop = ch * 0.15;
  const leftStep = cw * 0.15;
  const rightStep = cardW + cw * 0.08;
  const cardX = (slot: number) => cw / 2 - cardW / 2 + (slot >= 0 ? slot * rightStep : slot * leftStep);

  const CARD_RADIUS = 38;
  const cardClip = squircleClip(cw, ch, CARD_RADIUS / cardScale, 0.6);
  const fullClip = squircleClip(cw, ch, 0, 0.6);

  // Sombra de cada tarjeta del mazo (el clip-path de la tarjeta la recortaría).
  const cardShadowStyle = (a: WebApp, index: number): React.CSSProperties => {
    const slot = index - deckF;
    const dy = cardDy[a.id] ?? 0;
    const fade = dy < 0 ? Math.max(0, 1 + dy / (ch * 0.9)) : 1;
    return {
      position: "absolute",
      left: 0,
      top: 0,
      width: cw,
      height: ch,
      transformOrigin: "top left",
      transform: `translate(${cardX(slot)}px, ${cardTop + dy}px) scale(${cardScale})`,
      borderRadius: `${(CARD_RADIUS * 1.25) / cardScale}px`,
      boxShadow: `0 ${18 / cardScale}px ${50 / cardScale}px rgba(0,0,0,.5)`,
      opacity: slot < -3.5 ? 0 : fade,
      zIndex: index + 1,
      pointerEvents: "none",
      transition: deckDragging ? "none" : "transform .38s cubic-bezier(.22,1,.36,1), opacity .3s ease",
    };
  };

  // Estilo del contenedor de cada app abierta según su modo.
  const appWrapStyle = (a: WebApp, index: number): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      transformOrigin: "top left",
      willChange: "transform, opacity, border-radius",
      background: "#0b0b14",
    };
    if (switcherOpen) {
      const slot = index - deckF;
      const dy = cardDy[a.id] ?? 0;
      const fade = dy < 0 ? Math.max(0, 1 + dy / (ch * 0.9)) : 1;
      return {
        ...base,
        transform: `translate(${cardX(slot)}px, ${cardTop + dy}px) scale(${cardScale})`,
        opacity: slot < -3.5 ? 0 : fade,
        zIndex: index + 1,
        // 38 px con suavizado 60 % (tras escalar la tarjeta). El clip recorta la sombra,
        // así que la sombra va en una capa aparte (cardShadowStyle).
        clipPath: cardClip,
        transition: deckDragging
          ? "none"
          : "transform .38s cubic-bezier(.22,1,.36,1), opacity .3s ease, clip-path .38s cubic-bezier(.22,1,.36,1)",
        pointerEvents: "none",
      };
    }
    if (transition?.id === a.id) {
      const r = iconRects.current[a.id];
      const atIcon = !expanded;
      const sx = r ? r.w / cw : 1;
      const sy = r ? r.h / ch : 1;
      const dur = transition.dir === "open" ? 0.42 : 0.34;
      const ease = transition.dir === "open" ? "cubic-bezier(.22,1,.36,1)" : "cubic-bezier(.37,0,.63,1)";
      return {
        ...base,
        transform: atIcon && r ? `translate(${r.x}px, ${r.y}px) scale(${sx}, ${sy})` : "translate(0,0) scale(1,1)",
        borderRadius: atIcon ? "48px" : "0px",
        transition: `transform ${dur}s ${ease}, border-radius ${dur}s ${ease}`,
        pointerEvents: "none",
      };
    }
    if (foreground === a.id) {
      // Con transición: al abrir desde el mazo la tarjeta crece hasta pantalla completa.
      return {
        ...base,
        transform: "translate(0,0) scale(1,1)",
        borderRadius: 0,
        // Mismo trazado con radio 0: la forma se anima de tarjeta a pantalla completa.
        clipPath: fullClip,
        transition: "transform .38s cubic-bezier(.22,1,.36,1), clip-path .38s cubic-bezier(.22,1,.36,1)",
      };
    }
    return { ...base, opacity: 0, pointerEvents: "none" };
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
            foreground === null && !switcherOpen ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
          )}
        >
          <HugeiconsIcon icon={Home01Icon} size={14} />
        </button>
        <button
          type="button"
          onClick={() => (switcherOpen ? setSwitcherOpen(false) : openSwitcher())}
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

        <button
          type="button"
          onClick={() => setShowConsole((v) => !v)}
          title="Consola de las apps (console.log, errores y peticiones fallidas)"
          className={cn(
            "flex h-6 items-center gap-1 rounded px-1.5",
            showConsole ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
          )}
        >
          <HugeiconsIcon icon={ComputerTerminal01Icon} size={13} />
          {errors > 0 && !showConsole && <span className="rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{errors}</span>}
        </button>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-zinc-500">
          <span>localhost:</span>
          <input type="number" value={port} onChange={(e) => onPortChange(Number(e.target.value) || port)} className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-200 outline-none focus:border-indigo-500" />
          <button type="button" onClick={() => { setLogs([]); setReloadKey((k) => k + 1); }} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-zinc-800 hover:text-zinc-200">
            <HugeiconsIcon icon={Refresh01Icon} size={12} /> Recargar
          </button>
          <button type="button" onClick={onExit} title="Salir del modo teléfono" className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-zinc-800 hover:text-zinc-200">
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
          </button>
        </div>
      </div>

      <div ref={paneRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#0a0a0a]">
        <div className="relative shrink-0 drop-shadow-2xl" style={{ width: boxW, height: boxH }}>
          <div className="absolute isolate overflow-hidden" style={{ ...screenStyle, background: "#000" }}>
            {/* Área de contenido a pantalla completa (las apps pintan bajo la barra) */}
            <div ref={contentRef} className="absolute inset-0 overflow-hidden">
              {/* Wallpaper + home. El wallpaper llena todo; el contenido del home
                  respeta el safe-area superior con paddingTop. */}
              <div
                className={cn("absolute inset-0", !homeVisible && "pointer-events-none")}
                style={{
                  opacity: homeVisible ? 1 : 0,
                  transform: homeVisible ? "scale(1)" : "scale(0.96)",
                  transition: "opacity .32s ease, transform .32s cubic-bezier(.22,1,.36,1)",
                }}
              >
                <WallpaperLayer wall={currentWall} adj={wallState.adj[currentWall.id]} />
                <HomeScreen
                  onBackgroundLongPress={() => setWallOpen(true)}
                  dockApps={dockApps}
                  gridApps={gridApps}
                  onDockChange={saveDock}
                  pt={Math.min(cw, ch) / IOS.canvasW}
                  onOpen={openApp}
                  onAdd={() => {
                    setEditing(null);
                    setAddOpen(true);
                  }}
                  onEdit={(app) => {
                    if (app.id === SAFARI_ID) return;
                    setAddOpen(false);
                    setEditing(app);
                  }}
                />
              </div>

              {/* Fondo oscuro del switcher: DETRÁS de las tarjetas (no las desenfoca) */}
              {switcherOpen && <div className="absolute inset-0 bg-black/45 backdrop-blur-xl" />}

              {/* Apps abiertas (montadas; sirven de preview en el switcher) */}
              {switcherOpen && runningApps.map((a, index) => <div key={`sh-${a.id}`} style={cardShadowStyle(a, index)} />)}
              {runningApps.map((a, index) => (
                <div
                  key={a.id}
                  style={{ ...appWrapStyle(a, index), ...(bleeds(a) ? null : { background: bgs[a.id] || "#ffffff" }) }}
                  onTransitionEnd={(e) => e.propertyName === "transform" && onMorphEnd(a.id)}
                >
                  {a.id === SAFARI_ID ? (
                    <SafariView
                      pt={Math.min(cw, ch) / IOS.canvasW}
                      statusPct={topInset}
                      zf={zf}
                      reloadKey={reloadKey}
                      request={safariReq}
                      favorites={safariFavorites}
                      pageBg={bgs[SAFARI_ID]}
                      frameRef={(el) => {
                        if (el) frames.current[SAFARI_ID] = el;
                        else delete frames.current[SAFARI_ID];
                      }}
                    />
                  ) : (
                  /* Safe area superior: en modo Safari la web empieza bajo la barra de estado */
                  <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ top: bleeds(a) ? 0 : `${topInset}%` }}>
                    <iframe
                      key={`${a.id}-${reloadKey}`}
                      ref={(el) => {
                        if (el) frames.current[a.id] = el;
                        else delete frames.current[a.id];
                      }}
                      name="agphone"
                      src={srcOf(a)}
                      title={a.name}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                      // Sin proxy no se pueden ocultar sus barras de scroll: el iframe se
                      // ensancha 16 px para que queden fuera de la pantalla.
                      style={slotOf(a) ? appIframeStyle : { ...appIframeStyle, width: `calc(${100 / zf}% + 16px)` }}
                    />
                  </div>
                  )}
                  {switcherOpen && (
                    <div
                      className="pointer-events-none absolute inset-0 bg-black"
                      style={{
                        opacity: Math.min(0.45, Math.max(0, deckF - index) * 0.22),
                        transition: deckDragging ? "none" : "opacity .38s ease",
                      }}
                    />
                  )}
                  {/* Capa de icono que se desvanece durante el morph */}
                  {transition?.id === a.id && (
                    <div
                      className="pointer-events-none absolute inset-0 grid place-items-center"
                      style={{
                        background: a.color,
                        color: fgOn(a.color),
                        opacity: expanded ? 0 : 1,
                        transition: `opacity ${transition.dir === "open" ? 0.28 : 0.3}s ease`,
                      }}
                    >
                      <div className="size-20" style={TILE_CONTAINER}>
                        <AppGlyph app={a} />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Switcher: mazo de tarjetas (reutiliza los iframes de arriba) */}
              {switcherOpen && (
                <SwitcherDeck
                  apps={runningApps}
                  f={deckF}
                  setF={setDeckF}
                  dragging={deckDragging}
                  setDragging={setDeckDragging}
                  cardDy={cardDy}
                  setCardDy={setCardDy}
                  contentW={cw}
                  cardW={cardW}
                  cardH={cardH}
                  cardTop={cardTop}
                  cardX={cardX}
                  onOpen={(id) => {
                    // Desde el mazo la tarjeta crece a pantalla completa (sin morph de icono).
                    setTransition(null);
                    setExpanded(true);
                    setForeground(id);
                    setSwitcherOpen(false);
                  }}
                  onSwipeClose={swipeClose}
                  onDismiss={() => setSwitcherOpen(false)}
                />
              )}

              {/* Añadir / editar app */}
              {(addOpen || editing) && (
                <AppForm
                  editing={editing}
                  onSubmit={(data) => (editing ? updateApp(editing.id, data) : addApp(data))}
                  onDelete={editing && editing.id !== DEV_ID ? () => removeApp(editing.id) : undefined}
                  onCancel={() => {
                    setAddOpen(false);
                    setEditing(null);
                  }}
                />
              )}

              {/* Galería de fondos de pantalla */}
              {wallOpen && (
                <WallpaperGallery
                  walls={walls}
                  state={wallState}
                  cw={cw}
                  ch={ch}
                  time={time}
                  notice={wallNotice}
                  onApply={(id) => updateWalls((s) => ({ ...s, selected: id }))}
                  onAdd={(file) =>
                    photoToWallpaper(file)
                      .then((src) =>
                        updateWalls((s) => ({
                          ...s,
                          custom: [...s.custom, { id: crypto.randomUUID(), kind: "photo", name: file.name, src }],
                        })),
                      )
                      .catch(() => setWallNotice("No se pudo leer esa imagen."))
                  }
                  onAdjust={(id, adj) => updateWalls((s) => ({ ...s, adj: { ...s.adj, [id]: adj } }))}
                  onRemove={(id) =>
                    updateWalls((s) => {
                      const adjRest = { ...s.adj };
                      delete adjRest[id];
                      return {
                        selected: s.selected === id ? BUILTIN_WALLPAPERS[0].id : s.selected,
                        custom: s.custom.filter((w) => w.id !== id),
                        adj: adjRest,
                      };
                    })
                  }
                  onClose={() => setWallOpen(false)}
                />
              )}

              {/* Barra de inicio: un toque → inicio; doble clic → apps */}
              {!addOpen && !editing && (
                <button
                  type="button"
                  onClick={() => (switcherOpen ? setSwitcherOpen(false) : goHome())}
                  onDoubleClick={openSwitcher}
                  title="Inicio (doble clic: apps)"
                  className="absolute inset-x-0 bottom-0 z-40 flex h-6 items-end justify-center pb-1.5"
                >
                  {/* Barra adaptativa (se invierte contra el contenido) */}
                  <span className="h-1 w-1/3 rounded-full bg-white" style={{ mixBlendMode: "difference" }} />
                </button>
              )}
            </div>

            {!landscape && <StatusBar time={time} heightPct={topInset} />}
          </div>

          <img src={DEVICE_SVG} alt="" draggable={false} className="pointer-events-none select-none" style={imgStyle} />
        </div>
      </div>

      {showConsole && (
        <div className="flex h-44 shrink-0 flex-col border-t border-zinc-800 bg-[#0d0d10]">
          <div className="flex h-7 shrink-0 items-center gap-2 border-b border-zinc-800 px-3 text-[11px] text-zinc-500">
            <HugeiconsIcon icon={ComputerTerminal01Icon} size={12} />
            Consola
            <span className="text-zinc-600">· {logs.length}</span>
            {errors > 0 && <span className="text-red-400">· {errors} error(es)</span>}
            <button
              type="button"
              onClick={() => setLogs([])}
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <HugeiconsIcon icon={Delete02Icon} size={12} /> Limpiar
            </button>
            <button
              type="button"
              onClick={() => setShowConsole(false)}
              title="Cerrar consola"
              className="flex size-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed">
            {logs.length === 0 ? (
              <div className="text-zinc-600">Sin mensajes. Interactúa con la app o recárgala.</div>
            ) : (
              logs.map((l) => (
                <div
                  key={l.id}
                  className={cn(
                    "whitespace-pre-wrap break-all border-b border-zinc-900/60 py-0.5",
                    l.level === "error" ? "text-red-400" : l.level === "warn" ? "text-amber-400" : l.level === "info" ? "text-sky-300" : "text-zinc-300",
                  )}
                >
                  <span className="mr-1.5 select-none text-zinc-600">{appById(l.app)?.name ?? "app"} ›</span>
                  {l.text}
                </div>
              ))
            )}
            <div ref={logEnd} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Glifo del icono (favicon / Globe para Dev / inicial) ──
// Escala con el tamaño del tile vía container queries: el tile contenedor debe
// tener `container-type: size` (helper TILE_CONTAINER más abajo).
function AppGlyph({ app }: { app: WebApp }) {
  const [failed, setFailed] = useState(false);
  // Icono personalizado (si lo hay) → favicon → inicial. Dev: globo si no tiene imagen.
  const isDev = app.id === DEV_ID && !app.icon;
  const src = isDev ? null : app.icon || faviconFor(app.url);
  // Un icono personalizado (data URL / imagen subida) llena todo el tile.
  const custom = !!app.icon && !failed;
  useEffect(() => setFailed(false), [app.icon]);
  return (
    <span className="grid h-full w-full place-items-center [&>svg]:h-[52cqmin] [&>svg]:w-[52cqmin]">
      {isDev ? (
        <HugeiconsIcon icon={GlobeIcon} size={32} />
      ) : src && !failed ? (
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
          className="select-none"
          style={
            custom
              ? { width: "100%", height: "100%", objectFit: "cover" }
              : { width: "58cqmin", height: "58cqmin", objectFit: "contain" }
          }
        />
      ) : (
        <span style={{ fontSize: "48cqmin", fontWeight: 700, lineHeight: 1 }}>
          {app.name.trim()[0]?.toUpperCase() || "?"}
        </span>
      )}
    </span>
  );
}

// Cada arrastre de icono incrementa esto: una pulsación que acabó en arrastre ya no abre
// la edición (aunque el temporizador venza después de soltar).
let iconDragEpoch = 0;

// Mantener pulsado (como en iOS) → editar la app.
function useLongPress(onLong: () => void, ms = 550) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    fired,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        clear();
        const epoch = iconDragEpoch;
        timer.current = window.setTimeout(() => {
          if (epoch !== iconDragEpoch) return;
          fired.current = true;
          onLong();
        }, ms);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clear();
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    },
  };
}

// Esquina continua (squircle) de los iconos de iOS: 13,5 pt sobre 60 pt.
const iconClip = (pt: number) => squircleClip(IOS.icon * pt, IOS.icon * pt, IOS.iconRadius * pt, 0.6);

// Estilo base de un tile de icono (contenedor de tamaño para las cq units).
const TILE_CONTAINER: React.CSSProperties = { containerType: "size" };

// ── Icono pulsable del home ──
function AppTile({
  app,
  pt,
  onOpen,
  onEdit,
}: {
  app: WebApp;
  pt: number;
  onOpen: (id: string, el: HTMLElement | null) => void;
  onEdit: (app: WebApp) => void;
}) {
  const size = IOS.icon * pt;
  const iconRef = useRef<HTMLSpanElement>(null);
  const tile = app.color;
  const lp = useLongPress(() => onEdit(app));
  return (
    <button
      type="button"
      {...lp.handlers}
      onClick={() => !lp.fired.current && onOpen(app.id, iconRef.current)}
      onContextMenu={(e) => {
        e.preventDefault();
        onEdit(app);
      }}
      className="group flex flex-col items-center"
      style={{ width: size, gap: IOS.labelGap * pt }}
      title={`${app.url} — mantén pulsado o clic derecho: editar / cambiar icono`}
    >
      <span
        ref={iconRef}
        data-icon
        className="relative block overflow-hidden transition-transform group-active:scale-90"
        style={{ width: size, height: size, clipPath: iconClip(pt), background: tile, color: fgOn(tile), ...TILE_CONTAINER }}
      >
        <AppGlyph app={app} />
        <IconGlass size={size} radius={IOS.iconRadius * pt} />
      </span>
      <span
        className="w-[130%] truncate text-center font-medium leading-tight text-white"
        style={{ fontSize: IOS.label * pt, textShadow: "0 1px 2px rgba(0,0,0,.35)" }}
      >
        {app.name}
      </span>
    </button>
  );
}

// ── Home: pager horizontal (grids + App Library) + dock + puntos ──
const MAX_DOCK = 4;
type IconDrag = {
  app: WebApp;
  from: "grid" | "dock";
  sx: number;
  sy: number;
  x: number;
  y: number;
  size: number;
  active: boolean;
  hot: boolean; // sobre el dock y cabe
  index: number; // posición de inserción en el dock
};

function HomeScreen({
  onBackgroundLongPress,
  dockApps,
  gridApps,
  onDockChange,
  pt,
  onOpen: openRaw,
  onAdd,
  onEdit,
}: {
  onBackgroundLongPress: () => void;
  dockApps: WebApp[];
  gridApps: WebApp[];
  onDockChange: (ids: string[]) => void;
  onOpen: (id: string, el: HTMLElement | null) => void;
  onAdd: () => void;
  onEdit: (app: WebApp) => void;
  /** px por punto de iOS (ancho del mock / 393). */
  pt: number;
}) {
  const icon = IOS.icon * pt;
  // ── Arrastrar iconos: pulsar y mover levanta el icono; soltarlo sobre el dock lo
  // añade (máx. 4) en el hueco indicado; sacarlo del dock lo devuelve a la pantalla.
  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const press = useRef<IconDrag | null>(null);
  const justDragged = useRef(false);
  const [iconDrag, setIconDrag] = useState<IconDrag | null>(null);
  const latest = useRef({ dockApps, onDockChange });
  latest.current = { dockApps, onDockChange };
  // Tras arrastrar, el clic que sigue al soltar no abre la app.
  const onOpen = (id: string, el: HTMLElement | null) => {
    if (!justDragged.current) openRaw(id, el);
  };

  const startPress = (e: React.PointerEvent, app: WebApp, from: IconDrag["from"]) => {
    if (e.button !== 0) return;
    const icon = (e.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-icon]");
    const size = icon?.getBoundingClientRect().width || 56;
    press.current = { app, from, sx: e.clientX, sy: e.clientY, x: 0, y: 0, size, active: false, hot: false, index: 0 };
  };

  useEffect(() => {
    const overDock = (cx: number, cy: number) => {
      const r = dockRef.current?.getBoundingClientRect();
      return !!r && cx >= r.left && cx <= r.right && cy >= r.top - 16 && cy <= r.bottom + 8;
    };
    // Hueco = cuántos iconos del dock (sin el arrastrado) quedan a la izquierda del dedo.
    const dockIndexAt = (cx: number, skipId: string) =>
      [...(dockRef.current?.querySelectorAll<HTMLElement>("[data-dock-id]") ?? [])]
        .filter((el) => el.dataset.dockId !== skipId)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left + r.width / 2 < cx;
        }).length;

    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.active) {
        if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 8) return;
        p.active = true;
        iconDragEpoch++;
      }
      const root = rootRef.current?.getBoundingClientRect();
      if (!root) return;
      p.x = e.clientX - root.left;
      p.y = e.clientY - root.top;
      const others = latest.current.dockApps.filter((a) => a.id !== p.app.id).length;
      p.hot = overDock(e.clientX, e.clientY) && (p.from === "dock" || others < MAX_DOCK);
      p.index = p.hot ? dockIndexAt(e.clientX, p.app.id) : 0;
      setIconDrag({ ...p });
    };
    const up = () => {
      const p = press.current;
      press.current = null;
      if (!p?.active) return;
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false), 0);
      setIconDrag(null);
      const ids = latest.current.dockApps.map((a) => a.id).filter((id) => id !== p.app.id);
      if (p.hot) {
        ids.splice(Math.min(p.index, ids.length), 0, p.app.id);
        latest.current.onDockChange(ids);
      } else if (p.from === "dock") {
        latest.current.onDockChange(ids);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  // Mantener pulsado el fondo (no un icono, ni el dock, ni un control) → fondos de pantalla.
  const bgPress = useRef<{ x: number; y: number; t: number } | null>(null);
  const cancelBgPress = () => {
    if (bgPress.current) window.clearTimeout(bgPress.current.t);
    bgPress.current = null;
  };
  const onRootPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (e.button !== 0 || t.closest("button,input,textarea,[data-noswipe],[data-dock-id]") || dockRef.current?.contains(t)) return;
    cancelBgPress();
    bgPress.current = {
      x: e.clientX,
      y: e.clientY,
      t: window.setTimeout(() => {
        bgPress.current = null;
        onBackgroundLongPress();
      }, 600),
    };
  };
  const onRootPointerMove = (e: React.PointerEvent) => {
    const b = bgPress.current;
    if (b && Math.hypot(e.clientX - b.x, e.clientY - b.y) > 8) cancelBgPress();
  };

  const dragging = iconDrag?.active ? iconDrag : null;
  // Dock mostrado: sin el icono arrastrado y con un hueco donde caerá.
  const dockShown: (WebApp | "slot")[] = dockApps.filter((a) => a.id !== dragging?.app.id);
  if (dragging?.hot) dockShown.splice(Math.min(dragging.index, dockShown.length), 0, "slot");

  // Reparte iconos (+ botón Añadir) en páginas de PER_PAGE.
  const items: ({ kind: "app"; app: WebApp } | { kind: "add" })[] = [
    ...gridApps.map((app) => ({ kind: "app" as const, app })),
    { kind: "add" as const },
  ];
  const gridPages: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += PER_PAGE) gridPages.push(items.slice(i, i + PER_PAGE));
  // Última página = App Library (siempre presente).
  const pageCount = gridPages.length + 1;
  const libraryIndex = gridPages.length;
  const allApps = [...dockApps, ...gridApps];

  const [page, setPage] = useState(0); // página destino (entera)
  const [pos, setPos] = useState(0); // posición continua (para el drag)
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startPos: number; active: boolean } | null>(null);

  useEffect(() => {
    if (!drag.current?.active) setPos(page);
  }, [page]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (pageCount < 2) return;
    // No arrastrar páginas si se interactúa con un control (input, botón…).
    if ((e.target as HTMLElement).closest("input,textarea,button,[data-noswipe]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startPos: pos, active: true };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const w = trackRef.current?.clientWidth || 1;
    if (!d?.active) return;
    const next = d.startPos - (e.clientX - d.startX) / w;
    setPos(Math.max(0, Math.min(pageCount - 1, next)));
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d?.active) return;
    d.active = false;
    const snapped = Math.max(0, Math.min(pageCount - 1, Math.round(pos)));
    setPage(snapped);
    setPos(snapped);
  };

  const onLibrary = Math.round(pos) === libraryIndex;

  return (
    <div
      ref={rootRef}
      className="relative flex h-full select-none flex-col"
      onPointerDownCapture={onRootPointerDown}
      onPointerMoveCapture={onRootPointerMove}
      onPointerUpCapture={cancelBgPress}
      onPointerCancelCapture={cancelBgPress}
      onPointerLeave={cancelBgPress}
    >
      <div
        ref={trackRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="flex h-full"
          style={{
            width: `${pageCount * 100}%`,
            transform: `translateX(-${(pos * 100) / pageCount}%)`,
            transition: drag.current?.active ? "none" : "transform .32s cubic-bezier(.22,1,.36,1)",
          }}
        >
          {gridPages.map((pageItems, pi) => (
            <div key={pi} className="h-full" style={{ width: `${100 / pageCount}%` }}>
              {/* 29 + 62 + 29 + 62 + 29 + 62 + 29 + 62 + 29 = 393 pt */}
              <div
                className="grid h-full content-start justify-center"
                style={{
                  gridTemplateColumns: `repeat(${COLS}, ${icon}px)`,
                  columnGap: IOS.gapX * pt,
                  rowGap: IOS.gapY * pt,
                  paddingLeft: IOS.padX * pt,
                  paddingRight: IOS.padX * pt,
                  paddingTop: IOS.padTop * pt,
                }}
              >
                {pageItems.map((it, idx) =>
                  it.kind === "app" ? (
                    <div
                      key={it.app.id}
                      onPointerDownCapture={(e) => startPress(e, it.app, "grid")}
                      style={{ opacity: dragging?.app.id === it.app.id ? 0.25 : 1 }}
                    >
                      <AppTile app={it.app} pt={pt} onOpen={onOpen} onEdit={onEdit} />
                    </div>
                  ) : (
                    <button
                      key={`add-${idx}`}
                      type="button"
                      onClick={onAdd}
                      className="flex flex-col items-center"
                      style={{ width: icon, gap: IOS.labelGap * pt }}
                      title="Añadir web app"
                    >
                      <span
                        className="relative grid place-items-center bg-white/10 text-white/80"
                        style={{ width: icon, height: icon, clipPath: iconClip(pt) }}
                      >
                        <HugeiconsIcon icon={Add01Icon} size={Math.round(icon * 0.36)} />
                        <IconGlass size={icon} radius={IOS.iconRadius * pt} />
                      </span>
                      <span className="font-medium leading-tight text-white/80" style={{ fontSize: IOS.label * pt }}>
                        Añadir
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>
          ))}

          {/* App Library */}
          <div className="h-full" style={{ width: `${100 / pageCount}%`, paddingTop: LIB.searchTop * pt }}>
            <AppLibrary apps={allApps} pt={pt} active={onLibrary} onOpen={onOpen} onEdit={onEdit} onAdd={onAdd} />
          </div>
        </div>
      </div>

      {/* Puntos de página */}
      {pageCount > 1 && (
        <div className="flex justify-center gap-2" style={{ paddingBottom: 10 * pt }}>
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(i)}
              className="size-1.5 rounded-full"
              title={i === libraryIndex ? "App Library" : `Página ${i + 1}`}
              style={{ background: Math.round(pos) === i ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.35)" }}
            />
          ))}
        </div>
      )}

      {/* Dock (sin etiquetas, barra ancha estilo iOS) */}
      <div
        className="flex shrink-0 flex-col justify-end"
        style={{ height: IOS.dockArea * pt, paddingLeft: IOS.dockInsetX * pt, paddingRight: IOS.dockInsetX * pt, paddingBottom: IOS.dockBottom * pt }}
      >
        <LiquidGlass
          innerRef={dockRef}
          radius={IOS.dockRadius * pt}
          bezel={16 * pt}
          refraction={30 * pt}
          blur={7}
          style={{ height: IOS.dockH * pt, background: dragging?.hot ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.06)" }}
          contentClassName="flex items-center justify-center"
        >
          <div className="flex items-center justify-center" style={{ gap: IOS.gapX * pt, height: "100%" }}>
          {dockShown.map((app) =>
            app === "slot" ? (
              <div key="slot" className="shrink-0 bg-white/15" style={{ width: icon, height: icon, clipPath: iconClip(pt) }} />
            ) : (
              <div key={app.id} data-dock-id={app.id} onPointerDownCapture={(e) => startPress(e, app, "dock")}>
                <DockIcon app={app} pt={pt} onOpen={onOpen} onEdit={onEdit} />
              </div>
            ),
          )}
          {dockShown.length === 0 && <span className="text-[10px] text-white/50">Arrastra aquí tus apps</span>}
          </div>
        </LiquidGlass>
      </div>

      {/* Icono arrastrado (sigue al dedo) */}
      {dragging && (
        <div
          className="pointer-events-none absolute z-50"
          style={{
            left: dragging.x - dragging.size / 2,
            top: dragging.y - dragging.size / 2,
            width: dragging.size,
            height: dragging.size,
            transform: "scale(1.12)",
          }}
        >
          <span
            className="relative block size-full overflow-hidden"
            style={{
              background: dragging.app.color,
              color: fgOn(dragging.app.color),
              clipPath: squircleClip(dragging.size, dragging.size, (IOS.iconRadius / IOS.icon) * dragging.size, 0.6),
              ...TILE_CONTAINER,
            }}
          >
            <AppGlyph app={dragging.app} />
            <IconGlass size={dragging.size} radius={(IOS.iconRadius / IOS.icon) * dragging.size} />
          </span>
        </div>
      )}
    </div>
  );
}

// Icono del dock: tile sin etiqueta.
function DockIcon({
  app,
  pt,
  onOpen,
  onEdit,
}: {
  app: WebApp;
  pt: number;
  onOpen: (id: string, el: HTMLElement | null) => void;
  onEdit: (app: WebApp) => void;
}) {
  const size = IOS.icon * pt;
  const ref = useRef<HTMLSpanElement>(null);
  const tile = app.color;
  const lp = useLongPress(() => onEdit(app));
  return (
    <button
      type="button"
      data-noswipe
      {...lp.handlers}
      onClick={() => !lp.fired.current && onOpen(app.id, ref.current)}
      onContextMenu={(e) => {
        e.preventDefault();
        onEdit(app);
      }}
      className="block shrink-0"
      style={{ width: size }}
      title={`${app.url} — mantén pulsado o clic derecho: editar / cambiar icono`}
    >
      <span
        ref={ref}
        data-icon
        className="relative block overflow-hidden transition-transform active:scale-90"
        style={{ width: size, height: size, clipPath: iconClip(pt), background: tile, color: fgOn(tile), ...TILE_CONTAINER }}
      >
        <AppGlyph app={app} />
        <IconGlass size={size} radius={IOS.iconRadius * pt} />
      </span>
    </button>
  );
}

// ── App Library: búsqueda + carpetas auto-agrupadas ──
// Biblioteca de apps, medida sobre una captura real de iPhone (393 pt): búsqueda en
// píldora de 340 × 43 pt a 77 pt del borde; carpetas de 159 pt en 2 columnas
// (26,5 + 159 + 22 + 159 + 26,5 = 393); dentro, 2 × 2 iconos de ~62 pt (relleno 12,7,
// separación 10) y en la 4.ª casilla 2 × 2 mini-iconos de 24 pt.
const LIB = {
  searchTop: 77,
  searchH: 43,
  padX: 26.5,
  folder: 159,
  colGap: 22,
  rowGap: 16,
  firstGap: 30, // de la búsqueda a la primera fila
  fPad: 12.7,
  fGap: 10,
  fRadius: 26,
  mini: 24,
  miniGap: 6.7,
  label: 12,
  labelGap: 5,
};
const FOLDER_NAMES = ["Sugeridas", "Recientes"];

function AppLibrary({
  apps,
  pt,
  active,
  onOpen,
  onEdit,
  onAdd,
}: {
  apps: WebApp[];
  pt: number;
  active: boolean;
  onOpen: (id: string, el: HTMLElement | null) => void;
  onEdit: (app: WebApp) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searching = focused || query.trim().length > 0;

  // Al salir de la página de App Library, limpia la búsqueda.
  useEffect(() => {
    if (!active) {
      setQuery("");
      setFocused(false);
    }
  }, [active]);

  // Carpetas de hasta 7 apps: 4 grandes si caben; si no, 3 grandes + 4 mini en la 4.ª casilla.
  const folders: WebApp[][] = [];
  for (let i = 0; i < apps.length; i += 7) folders.push(apps.slice(i, i + 7));

  const q = query.trim().toLowerCase();
  const filtered = [...apps]
    .filter((a) => !q || a.name.toLowerCase().includes(q) || a.url.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  const cancel = () => {
    setQuery("");
    setFocused(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
  };

  const padX = LIB.padX * pt;
  const placeholder = "Biblioteca de apps";

  return (
    <div className="flex h-full flex-col">
      {/* Barra de búsqueda: píldora de cristal, texto centrado hasta que se escribe */}
      <div className="flex shrink-0 items-center" style={{ paddingLeft: padX, paddingRight: padX, gap: 10 * pt }}>
        <LiquidGlass
          radius={(LIB.searchH / 2) * pt}
          bezel={8 * pt}
          refraction={10 * pt}
          blur={8}
          className="min-w-0 flex-1"
          style={{ height: LIB.searchH * pt, background: "rgba(255,255,255,.07)" }}
          contentClassName="flex items-center"
        >
          <div
            className={cn("flex h-full w-full cursor-text items-center", searching ? "justify-start" : "justify-center")}
            style={{ gap: 6 * pt, paddingLeft: 14 * pt, paddingRight: 14 * pt }}
            onClick={() => inputRef.current?.focus()}
          >
            <svg viewBox="0 0 24 24" className="flex-none text-white/70" style={{ width: 19 * pt, height: 19 * pt }} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3-3" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              value={query}
              placeholder={placeholder}
              size={searching ? undefined : placeholder.length}
              spellCheck={false}
              onFocus={() => setFocused(true)}
              onChange={(e) => setQuery(e.target.value)}
              className={cn("min-w-0 bg-transparent text-white placeholder-white/70 outline-none", searching && "flex-1")}
              style={{ fontSize: 17 * pt }}
            />
          </div>
        </LiquidGlass>
        {searching && (
          <button type="button" data-noswipe onClick={cancel} className="shrink-0 text-white" style={{ fontSize: 16 * pt }}>
            Cancelar
          </button>
        )}
      </div>

      {/* Carpetas (vista por defecto): 2 columnas simétricas */}
      {!searching && (
        <div
          className="grid min-h-0 flex-1 content-start justify-center overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            gridTemplateColumns: `repeat(2, ${LIB.folder * pt}px)`,
            columnGap: LIB.colGap * pt,
            rowGap: LIB.rowGap * pt,
            paddingLeft: padX,
            paddingRight: padX,
            paddingTop: LIB.firstGap * pt,
            paddingBottom: 40 * pt,
          }}
        >
          {folders.length === 0 ? (
            <div className="col-span-2 mt-10 text-center text-xs text-white/50">
              Sin apps todavía.
              <button type="button" data-noswipe onClick={onAdd} className="ml-1 underline">
                Añadir una
              </button>
            </div>
          ) : (
            folders.map((group, i) => (
              <Folder key={i} group={group} name={FOLDER_NAMES[i] ?? `Grupo ${i + 1}`} pt={pt} onOpen={onOpen} onEdit={onEdit} />
            ))
          )}
        </div>
      )}

      {/* Lista alfabética (al buscar) */}
      {searching && (
        <div className="min-h-0 flex-1 overflow-y-auto pb-6 pt-2 [scrollbar-width:none]" style={{ paddingLeft: padX, paddingRight: padX }}>
          {filtered.length === 0 ? (
            <div className="mt-10 text-center text-xs text-white/50">Sin resultados para “{query}”.</div>
          ) : (
            filtered.map((app) => (
              <AppRow key={app.id} app={app} onOpen={onOpen} onEdit={onEdit} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Carpeta: rejilla 2 × 2 fija (siempre simétrica). Hasta 4 apps → 4 iconos grandes;
// más → 3 grandes y la 4.ª casilla con 2 × 2 mini-iconos del resto.
function Folder({
  group,
  name,
  pt,
  onOpen,
  onEdit,
}: {
  group: WebApp[];
  name: string;
  pt: number;
  onOpen: (id: string, el: HTMLElement | null) => void;
  onEdit: (app: WebApp) => void;
}) {
  const size = LIB.folder * pt;
  const icon = (LIB.folder - 2 * LIB.fPad - LIB.fGap) / 2;
  const big = group.length <= 4 ? group : group.slice(0, 3);
  const minis = group.length <= 4 ? [] : group.slice(3, 7);
  const slots: (WebApp | "minis" | null)[] = [0, 1, 2, 3].map((i) => (minis.length && i === 3 ? "minis" : big[i] ?? null));
  return (
    <div className="flex flex-col items-center" style={{ gap: LIB.labelGap * pt }}>
      <LiquidGlass
        radius={LIB.fRadius * pt}
        bezel={10 * pt}
        refraction={12 * pt}
        blur={10}
        style={{ width: size, height: size, background: "rgba(255,255,255,.06)" }}
      >
        <div
          className="grid h-full"
          style={{
            gridTemplateColumns: `repeat(2, ${icon * pt}px)`,
            gridTemplateRows: `repeat(2, ${icon * pt}px)`,
            gap: LIB.fGap * pt,
            padding: LIB.fPad * pt,
          }}
        >
          {slots.map((slot, i) =>
            slot === "minis" ? (
              <div
                key="minis"
                className="grid place-content-center"
                style={{ gridTemplateColumns: `repeat(2, ${LIB.mini * pt}px)`, gridTemplateRows: `repeat(2, ${LIB.mini * pt}px)`, gap: LIB.miniGap * pt }}
              >
                {minis.map((app) => (
                  <FolderIcon key={app.id} app={app} size={LIB.mini * pt} onOpen={onOpen} onEdit={onEdit} />
                ))}
              </div>
            ) : slot ? (
              <FolderIcon key={slot.id} app={slot} size={icon * pt} onOpen={onOpen} onEdit={onEdit} />
            ) : (
              <div key={`empty-${i}`} />
            ),
          )}
        </div>
      </LiquidGlass>
      <span className="w-full truncate text-center font-medium text-white" style={{ fontSize: LIB.label * pt }}>
        {name}
      </span>
    </div>
  );
}

function FolderIcon({
  app,
  size,
  onOpen,
  onEdit,
}: {
  app: WebApp;
  size: number;
  onOpen: (id: string, el: HTMLElement | null) => void;
  onEdit: (app: WebApp) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const tile = app.color;
  return (
    <button
      ref={ref}
      type="button"
      data-noswipe
      onClick={() => onOpen(app.id, ref.current)}
      onContextMenu={(e) => {
        e.preventDefault();
        onEdit(app);
      }}
      className="relative block overflow-hidden transition-transform active:scale-90"
      style={{
        width: size,
        height: size,
        // Misma esquina continua que los iconos del home (14 / 62).
        clipPath: squircleClip(size, size, (IOS.iconRadius / IOS.icon) * size, 0.6),
        background: tile,
        color: fgOn(tile),
        ...TILE_CONTAINER,
      }}
      title={app.name}
    >
      <AppGlyph app={app} />
      <IconGlass size={size} radius={(IOS.iconRadius / IOS.icon) * size} />
    </button>
  );
}

// Fila de la lista alfabética.
function AppRow({
  app,
  onOpen,
  onEdit,
}: {
  app: WebApp;
  onOpen: (id: string, el: HTMLElement | null) => void;
  onEdit: (app: WebApp) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const tile = app.color;
  const lp = useLongPress(() => onEdit(app));
  return (
    <button
      type="button"
      data-noswipe
      {...lp.handlers}
      onClick={() => !lp.fired.current && onOpen(app.id, ref.current)}
      onContextMenu={(e) => {
        e.preventDefault();
        onEdit(app);
      }}
      className="flex w-full items-center gap-3 border-b border-white/10 py-2 text-left"
    >
      <span
        ref={ref}
        className="size-11 flex-none overflow-hidden rounded-[26%] shadow"
        style={{ background: tile, color: fgOn(tile), ...TILE_CONTAINER }}
      >
        <AppGlyph app={app} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-white">{app.name}</span>
        <span className="block truncate text-[11px] text-white/45">{app.url}</span>
      </span>
    </button>
  );
}

// ── Switcher estilo iOS: deslizar en horizontal recorre el mazo (las tarjetas siguen al
// dedo), arrastrar una tarjeta hacia arriba la cierra y hacia abajo solo tiene elasticidad.
type DeckDrag = {
  x: number;
  y: number;
  f: number;
  card: string | null;
  axis: "x" | "y" | null;
  lx: number;
  ly: number;
  lt: number;
  vx: number;
  vy: number;
};

function SwitcherDeck({
  apps,
  f,
  setF,
  dragging,
  setDragging,
  cardDy,
  setCardDy,
  contentW,
  cardW,
  cardH,
  cardTop,
  cardX,
  onOpen,
  onSwipeClose,
  onDismiss,
}: {
  apps: WebApp[];
  f: number;
  setF: (n: number) => void;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  cardDy: Record<string, number>;
  setCardDy: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  contentW: number;
  cardW: number;
  cardH: number;
  cardTop: number;
  cardX: (slot: number) => number;
  onOpen: (id: string) => void;
  onSwipeClose: (id: string) => void;
  onDismiss: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DeckDrag | null>(null);
  const n = apps.length;
  const ease = "cubic-bezier(.22,1,.36,1)";

  // Resistencia elástica: crece cada vez menos cuanto más se estira.
  const rubberPx = (d: number) => 70 * (1 - Math.exp(-d / 160));
  const rubberF = (d: number) => 0.35 * (1 - Math.exp(-d / 0.6));

  // Tarjeta bajo el puntero (la de mayor índice va encima). Incluye su etiqueta.
  const hit = (px: number, py: number) => {
    for (let i = n - 1; i >= 0; i--) {
      const x = cardX(i - f);
      const y = cardTop + (cardDy[apps[i].id] ?? 0);
      if (px >= x && px <= x + cardW && py >= y - 36 && py <= y + cardH) return apps[i].id;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* puntero ya liberado */
    }
    const now = performance.now();
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      f,
      card: hit(e.clientX - r.left, e.clientY - r.top),
      axis: null,
      lx: e.clientX,
      ly: e.clientY,
      lt: now,
      vx: 0,
      vy: 0,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const now = performance.now();
    const dt = Math.max(1, now - d.lt);
    d.vx = (e.clientX - d.lx) / dt;
    d.vy = (e.clientY - d.ly) / dt;
    d.lx = e.clientX;
    d.ly = e.clientY;
    d.lt = now;
    if (!d.axis) {
      if (Math.hypot(dx, dy) < 6) return;
      d.axis = Math.abs(dy) > Math.abs(dx) && d.card ? "y" : "x";
      setDragging(true);
    }
    if (d.axis === "x") {
      let nf = d.f - dx / (contentW * 0.55);
      if (nf < 0) nf = -rubberF(-nf);
      if (nf > n - 1) nf = n - 1 + rubberF(nf - (n - 1));
      setF(nf);
    } else {
      const id = d.card!;
      setCardDy((c) => ({ ...c, [id]: dy < 0 ? dy : rubberPx(dy) }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    setDragging(false);
    if (!d.axis) {
      if (d.card) onOpen(d.card);
      else onDismiss();
      return;
    }
    if (d.axis === "x") {
      const flick = Math.abs(d.vx) > 0.5 ? -Math.sign(d.vx) * 0.6 : 0;
      setF(Math.max(0, Math.min(n - 1, Math.round(f + flick))));
      return;
    }
    const id = d.card!;
    const dy = e.clientY - d.y;
    if (dy < -cardH * 0.28 || d.vy < -0.8) {
      // Sale disparada por arriba y se cierra.
      setCardDy((c) => ({ ...c, [id]: -(cardTop + cardH) - 60 }));
      window.setTimeout(() => onSwipeClose(id), 260);
    } else {
      setCardDy((c) => ({ ...c, [id]: 0 }));
    }
  };

  const onPointerCancel = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d?.card) setCardDy((c) => ({ ...c, [d.card!]: 0 }));
    setF(Math.max(0, Math.min(n - 1, Math.round(f))));
  };

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-30 touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* Icono + nombre sobre cada tarjeta; en las apiladas detrás solo asoma el icono */}
      {apps.map((a, i) => {
        const slot = i - f;
        const dy = cardDy[a.id] ?? 0;
        const op = slot < -3.5 ? 0 : dy < 0 ? Math.max(0, 1 + dy / (cardH * 0.6)) : 1;
        return (
          <div
            key={a.id}
            className="pointer-events-none absolute flex items-center gap-2"
            style={{
              left: cardX(slot) + 42,
              top: cardTop + dy - 36,
              zIndex: i + 1,
              opacity: op,
              transition: dragging ? "none" : `left .38s ${ease}, top .38s ${ease}, opacity .3s ease`,
            }}
          >
            <span
              className="size-7 flex-none overflow-hidden rounded-[26%] shadow-md shadow-black/40"
              style={{ background: a.color, color: fgOn(a.color), ...TILE_CONTAINER }}
            >
              <AppGlyph app={a} />
            </span>
            <span
              className="max-w-40 truncate text-sm font-semibold text-white drop-shadow"
              style={{ opacity: slot > -0.5 ? 1 : 0, transition: "opacity .2s ease" }}
            >
              {a.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6"];

type AppFormData = { name: string; url: string; color: string; icon?: string };

function AppForm({
  editing,
  onSubmit,
  onDelete,
  onCancel,
}: {
  editing: WebApp | null;
  onSubmit: (data: AppFormData) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [color, setColor] = useState(editing?.color ?? COLORS[0]);
  const [icon, setIcon] = useState<string | undefined>(editing?.icon);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (url.trim()) onSubmit({ name, url, color, icon });
  };

  const isDevApp = editing?.id === DEV_ID;

  // La imagen se recorta (cover) a 192×192 para que quepa en localStorage.
  const pickIcon = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : undefined;
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        const S = 192;
        const c = document.createElement("canvas");
        c.width = S;
        c.height = S;
        const g = c.getContext("2d");
        if (!g || !img.width || !img.height) return setIcon(src);
        const k = Math.max(S / img.width, S / img.height);
        const w = img.width * k;
        const h = img.height * k;
        g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        setIcon(c.toDataURL("image/png"));
      };
      img.onerror = () => setIcon(src);
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  // Preview del tile.
  const preview: WebApp = { id: editing?.id ?? "preview", name: name || "App", url: url || "https://example.com", color, icon };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" data-noswipe>
      <div className="w-full rounded-2xl border border-white/10 bg-[#1a1a1a] p-3">
        <div className="mb-2.5 text-xs font-medium text-zinc-100">{editing ? "Editar app" : "Añadir web app"}</div>

        {/* Icono: preview + subir / quitar */}
        <div className="mb-3 flex items-center gap-3">
          <span
            className="size-14 flex-none overflow-hidden rounded-[24%] shadow-lg shadow-black/40"
            style={{ background: color, color: fgOn(color), containerType: "size" }}
          >
            <AppGlyph app={preview} />
          </span>
          <div className="flex flex-col gap-1.5">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickIcon(e.target.files?.[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800">
              {icon ? "Cambiar icono" : "Subir icono"}
            </button>
            {icon && (
              <button type="button" onClick={() => setIcon(undefined)} className="rounded-md px-2.5 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
                Quitar icono ({isDevApp ? "usar el globo" : "usar favicon"})
              </button>
            )}
          </div>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="nombre"
          spellCheck={false}
          className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-indigo-500"
        />
        {isDevApp ? (
          <div className="mb-2 truncate px-0.5 font-mono text-[11px] text-zinc-500" title="La app Dev siempre abre el servidor del proyecto">
            {url}
          </div>
        ) : (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="URL (ej. localhost:3000 o https://…)"
            spellCheck={false}
            className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100 outline-none focus:border-indigo-500"
          />
        )}
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
            onClick={submit}
            className="flex-1 rounded-md bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {editing ? "Guardar" : "Añadir"}
          </button>
          {onDelete && (
            <button type="button" onClick={onDelete} className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
              Quitar
            </button>
          )}
          <button type="button" onClick={onCancel} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
