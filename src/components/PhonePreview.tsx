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
} from "@hugeicons/core-free-icons";

const DEVICE_SVG = "/devices/iphone-17-promax-deepblue.svg";
// Proxy del backend (esquema registrado en Rust). En Windows Tauri lo mapea a
// http://<scheme>.localhost; en Linux/macOS a <scheme>://localhost.
const PROXY =
  typeof window !== "undefined" && window.location.protocol.startsWith("http")
    ? "http://agproxy.localhost"
    : "agproxy://localhost";
// Área de pantalla dentro del viewBox 448×916 del SVG.
const SCREEN = { left: 24 / 448, top: 21 / 916, right: 426 / 448, bottom: 895 / 916 };
const CORNER_VB = 54;
const ASPECT = 448 / 916; // corto / largo

// Luminancia relativa (0=negro, 1=blanco) para decidir el color de los iconos.
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

function nowTime(): string {
  const d = new Date();
  let h = d.getHours() % 12;
  if (h === 0) h = 12;
  return `${h}:${d.getMinutes().toString().padStart(2, "0")}`;
}

const isOpaque = (c: string) =>
  !!c && c !== "transparent" && c !== "rgba(0, 0, 0, 0)" && !/,\s*0(\.0+)?\)\s*$/.test(c);

// Busca un color de fondo para html/body/:root dentro de texto CSS.
function bgFromCss(css: string): string {
  const re = /(?::root|html|body)[^{]*\{([^}]*)\}/gi;
  let m: RegExpExecArray | null;
  let found = "";
  while ((m = re.exec(css))) {
    const decl = m[1];
    const bm = decl.match(/background(?:-color)?\s*:\s*([^;]+)/i);
    if (bm) {
      const col = bm[1].match(/#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)/i);
      if (col && isOpaque(col[0])) found = col[0]; // la última regla gana (cascada)
    }
  }
  return found;
}

// Barra de estado estilo iOS (hora + señal/wifi/batería). El centro queda vacío
// para la isla dinámica. Se tinta según el fondo para que siempre contraste.
function StatusBar({ bg, time, heightPct }: { bg: string; time: string; heightPct: number }) {
  const fg = luminance(bg) < 0.6 ? "#ffffff" : "#000000";
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center"
      style={{ height: `${heightPct}%`, background: bg, color: fg }}
    >
      <svg
        viewBox="0 0 402 62"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <text
          x="69"
          y="33"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="16"
          fontWeight={600}
          fontFamily="'Plus Jakarta Sans Variable', system-ui, sans-serif"
          letterSpacing="0.2"
          fill="currentColor"
        >
          {time}
        </text>
        {/* Señal celular */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M312.365 27.533C312.365 26.9 311.887 26.3868 311.298 26.3868H310.232C309.643 26.3868 309.165 26.9 309.165 27.533V37.467C309.165 38.1 309.643 38.6132 310.232 38.6132H311.298C311.887 38.6132 312.365 38.1 312.365 37.467V27.533ZM304.931 28.8321H305.998C306.587 28.8321 307.064 29.3576 307.064 30.0058V37.4395C307.064 38.0877 306.587 38.6132 305.998 38.6132H304.931C304.342 38.6132 303.864 38.0877 303.864 37.4395V30.0058C303.864 29.3576 304.342 28.8321 304.931 28.8321ZM300.599 31.4811H299.532C298.943 31.4811 298.466 32.0133 298.466 32.6698V37.4245C298.466 38.081 298.943 38.6132 299.532 38.6132H300.599C301.188 38.6132 301.666 38.081 301.666 37.4245V32.6698C301.666 32.0133 301.188 31.4811 300.599 31.4811ZM295.298 33.9264H294.232C293.643 33.9264 293.165 34.451 293.165 35.0981V37.4415C293.165 38.0886 293.643 38.6132 294.232 38.6132H295.298C295.887 38.6132 296.365 38.0886 296.365 37.4415V35.0981C296.365 34.451 295.887 33.9264 295.298 33.9264Z"
          fill="currentColor"
        />
        {/* Wifi */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M327.937 28.8022C330.424 28.8023 332.816 29.7243 334.618 31.3778C334.754 31.5055 334.971 31.5039 335.105 31.3742L336.402 30.1107C336.47 30.045 336.507 29.9559 336.507 29.8632C336.506 29.7705 336.468 29.6819 336.399 29.6169C331.668 25.2422 324.204 25.2422 319.473 29.6169C319.405 29.6819 319.366 29.7705 319.365 29.8632C319.365 29.9558 319.402 30.0449 319.47 30.1107L320.768 31.3742C320.901 31.5041 321.119 31.5057 321.254 31.3778C323.057 29.7242 325.449 28.8022 327.937 28.8022ZM327.933 33.0224C329.291 33.0223 330.599 33.5341 331.606 34.4582C331.742 34.5894 331.956 34.5865 332.089 34.4518L333.376 33.1325C333.444 33.0633 333.481 32.9694 333.48 32.8719C333.479 32.7743 333.44 32.6812 333.371 32.6134C330.307 29.7226 325.562 29.7226 322.498 32.6134C322.429 32.6812 322.39 32.7744 322.389 32.8719C322.388 32.9695 322.426 33.0634 322.493 33.1325L323.78 34.4518C323.913 34.5865 324.127 34.5894 324.263 34.4582C325.269 33.5347 326.577 33.023 327.933 33.0224ZM330.458 35.816C330.46 35.9213 330.422 36.0229 330.355 36.0967L328.179 38.5514C328.115 38.6236 328.028 38.6642 327.937 38.6642C327.846 38.6642 327.759 38.6236 327.695 38.5514L325.518 36.0967C325.451 36.0229 325.414 35.9212 325.416 35.8159C325.418 35.7105 325.459 35.6108 325.529 35.5402C326.919 34.2263 328.955 34.2263 330.345 35.5402C330.415 35.6108 330.456 35.7106 330.458 35.816Z"
          fill="currentColor"
        />
        {/* Batería */}
        <rect
          opacity="0.35"
          x="344.007"
          y="26.5"
          width="24"
          height="12"
          rx="3.8"
          stroke="currentColor"
        />
        <path
          opacity="0.4"
          d="M369.507 30.7811V34.8566C370.312 34.5114 370.835 33.7085 370.835 32.8189C370.835 31.9293 370.312 31.1263 369.507 30.7811Z"
          fill="currentColor"
        />
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
  const [probeSrc, setProbeSrc] = useState<string | null>(null);
  const [time, setTime] = useState(nowTime);

  const paneRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const url = `http://localhost:${port}`;

  // Detección del color de fondo. Todo pasa por el proxy del backend
  // (esquema agproxy), que añade CORS e inyecta un script en el HTML: así la
  // sonda viva ejecuta el JS real de la página y reporta el fondo por
  // postMessage, incluso cuando se define en runtime (CSS-in-JS). Además se
  // hace una detección estática rápida (theme-color / CSS) como primer valor.
  useEffect(() => {
    let cancel = false;
    setProbeSrc(null);
    (async () => {
      try {
        await invoke("set_proxy_port", { port });
      } catch {
        /* backend sin proxy */
      }

      try {
        const res = await fetch(`${PROXY}/?agstatic=${reloadKey}`, { cache: "no-store" });
        if (res.ok) {
          const html = await res.text();

          const tc =
            html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']theme-color["']/i);
          if (tc && isOpaque(tc[1].trim()) && !cancel) setPageBg(tc[1].trim());

          const inlineCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
            .map((m) => m[1])
            .join("\n");
          const bodyInline =
            (html.match(/<body[^>]*style=["']([^"']*)["']/i) || [])[1] ||
            (html.match(/<html[^>]*style=["']([^"']*)["']/i) || [])[1] ||
            "";
          const fromInline = bgFromCss(inlineCss) || bgFromCss(`body{${bodyInline}}`);
          if (fromInline && !cancel) setPageBg(fromInline);

          const links = [...html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi)]
            .filter((m) => /stylesheet/i.test(m[0]) || /\.css(\?|$)/i.test(m[1]))
            .map((m) => new URL(m[1], `${PROXY}/`).href)
            .slice(0, 6);
          for (const href of links) {
            if (cancel) break;
            try {
              const cssRes = await fetch(href, { cache: "no-store" });
              if (!cssRes.ok) continue;
              const col = bgFromCss(await cssRes.text());
              if (col && !cancel) {
                setPageBg(col);
                break;
              }
            } catch {
              /* css inaccesible */
            }
          }
        }
      } catch {
        /* servidor apagado */
      }

      if (!cancel) setProbeSrc(`${PROXY}/?agprobe=${reloadKey}`);
    })();
    return () => {
      cancel = true;
    };
  }, [port, reloadKey]);

  // Recibe el color de fondo real que reporta la sonda viva.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const c = (e.data as { __agproxyBg?: unknown })?.__agproxyBg;
      if (typeof c === "string" && isOpaque(c)) setPageBg(c);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Reloj de la barra de estado.
  useEffect(() => {
    const id = setInterval(() => setTime(nowTime()), 10000);
    return () => clearInterval(id);
  }, []);

  // Medimos el área disponible para dimensionar el dispositivo.
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const availW = Math.max(120, size.w - 40);
  const availH = Math.max(120, size.h - 40);
  const longPx = landscape
    ? Math.min(availW, availH / ASPECT)
    : Math.min(availH, availW / ASPECT);
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

  // Zoom por transform sobre el iframe (sin inyectar nada en la página).
  const zf = zoom / 100;
  // Desfase superior para que el contenido arranque justo debajo de la isla
  // dinámica (solo en vertical; en horizontal la isla queda al costado).
  const topInset = landscape ? 0 : 7;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-3 text-xs text-zinc-400">
        <HugeiconsIcon icon={SmartPhone01Icon} size={14} />
        <span className="font-medium">Vista móvil</span>

        {/* Rotar */}
        <button
          type="button"
          onClick={() => setLandscape((l) => !l)}
          title={landscape ? "Vertical" : "Horizontal"}
          className="ml-1 flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <HugeiconsIcon icon={landscape ? SmartPhoneLandscapeIcon : SmartPhone01Icon} size={14} />
        </button>

        {/* Zoom */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(25, z - 10))}
            title="Alejar"
            className="flex size-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={ZoomOutIcon} size={12} />
          </button>
          <button
            type="button"
            onClick={() => setZoom(100)}
            title="Restablecer zoom"
            className="w-10 text-center tabular-nums hover:text-zinc-200"
          >
            {zoom}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(300, z + 10))}
            title="Acercar"
            className="flex size-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={ZoomInIcon} size={12} />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-zinc-500">
          <span>localhost:</span>
          <input
            type="number"
            value={port}
            onChange={(e) => onPortChange(Number(e.target.value) || port)}
            className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-200 outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={12} /> Recargar
          </button>
          <button
            type="button"
            onClick={onExit}
            title="Salir del modo teléfono"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
          </button>
        </div>
      </div>

      <div
        ref={paneRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#0a0a0a]"
      >
        <div className="relative shrink-0 drop-shadow-2xl" style={{ width: boxW, height: boxH }}>
          {/* Pantalla (recorta con esquinas redondeadas). El fondo toma el color
              real de la página para que la franja de la barra de estado combine. */}
          <div
            className="absolute overflow-hidden"
            style={{ ...screenStyle, background: pageBg }}
          >
            <div
              className="absolute inset-x-0 bottom-0 overflow-hidden"
              style={{
                top: `${topInset}%`,
                borderTopLeftRadius: Math.round(radius * 0.7),
                borderTopRightRadius: Math.round(radius * 0.7),
              }}
            >
              <iframe
                ref={iframeRef}
                key={reloadKey}
                src={url}
                title="Vista móvil"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: `calc(${100 / zf}% + 16px)`,
                  height: `${100 / zf}%`,
                  transform: `scale(${zf})`,
                  transformOrigin: "top left",
                  border: 0,
                  background: "white",
                }}
              />
            </div>
            {/* Barra de estado (hora + batería) sobre la franja de la isla */}
            {!landscape && <StatusBar bg={pageBg} time={time} heightPct={topInset} />}
          </div>

          {/* Sonda viva (oculta): corre el JS real de la página vía proxy y
              reporta el color de fondo por postMessage. */}
          {probeSrc && (
            <iframe
              key={probeSrc}
              src={probeSrc}
              title="probe"
              aria-hidden
              tabIndex={-1}
              sandbox="allow-scripts allow-same-origin allow-forms"
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                left: -9999,
                top: 0,
                opacity: 0,
                pointerEvents: "none",
                border: 0,
              }}
            />
          )}
          {/* Marco del dispositivo */}
          <img
            src={DEVICE_SVG}
            alt=""
            draggable={false}
            className="pointer-events-none select-none"
            style={imgStyle}
          />
        </div>
      </div>
    </div>
  );
}
