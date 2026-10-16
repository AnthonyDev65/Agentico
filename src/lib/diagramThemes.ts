import { useSyncExternalStore } from "react";
import mermaid from "mermaid";

// Temas visuales de los diagramas Mermaid (estilo pizarra tipo Miro) + render serializado.

export type ThemeKey = "vivid" | "board" | "classic";

type Palette = {
  dark: boolean;
  bg: string; // fondo del lienzo
  dot: string; // color de los puntos del patrón
  actor: string;
  actorText: string;
  actorBorder: string;
  line: string; // líneas de vida / conexiones
  signal: string;
  text: string;
  activation: string;
  activationBorder: string;
  note: string;
  noteText: string;
  label: string; // cajas de alt/loop
  labelText: string;
  decision: string; // rombos / hexágonos
  accent: string; // círculos, cilindros
  shadow: string;
};

// Todas las paletas definen las MISMAS variables: mermaid acumula la config entre
// initialize(), así cada render sobrescribe todo y no hereda colores del tema anterior.
const PALETTES: Record<ThemeKey, Palette> = {
  vivid: {
    dark: true,
    bg: "#101014",
    dot: "rgba(255,255,255,0.10)",
    actor: "#F9C74F",
    actorText: "#1b1b1f",
    actorBorder: "#F9C74F",
    line: "#8a8a94",
    signal: "#d4d4d8",
    text: "#e4e4e7",
    activation: "#F07167",
    activationBorder: "#F07167",
    note: "#C4B5FD",
    noteText: "#1b1b1f",
    label: "#60A5FA",
    labelText: "#0b1220",
    decision: "#7DD3FC",
    accent: "#F07167",
    shadow: "rgba(0,0,0,0.45)",
  },
  board: {
    dark: false,
    bg: "#f4f4f5",
    dot: "rgba(0,0,0,0.16)",
    actor: "#FBD25B",
    actorText: "#111111",
    actorBorder: "#FBD25B",
    line: "#111111",
    signal: "#111111",
    text: "#111111",
    activation: "#F2795B",
    activationBorder: "#111111",
    note: "#FFF59D",
    noteText: "#111111",
    label: "#111111",
    labelText: "#ffffff",
    decision: "#8FD3FE",
    accent: "#F2795B",
    shadow: "rgba(0,0,0,0.12)",
  },
  classic: {
    dark: true,
    bg: "#0d0d10",
    dot: "rgba(255,255,255,0.06)",
    actor: "#1f1f23",
    actorText: "#e4e4e7",
    actorBorder: "#71717a",
    line: "#71717a",
    signal: "#d4d4d8",
    text: "#e4e4e7",
    activation: "#3f3f46",
    activationBorder: "#a1a1aa",
    note: "#3f3f46",
    noteText: "#e4e4e7",
    label: "#3f3f46",
    labelText: "#e4e4e7",
    decision: "#27272a",
    accent: "#3f3f46",
    shadow: "rgba(0,0,0,0.35)",
  },
};

export const THEMES: { value: ThemeKey; label: string }[] = [
  { value: "vivid", label: "Vivo" },
  { value: "board", label: "Pizarra" },
  { value: "classic", label: "Clásico" },
];

const FONT = "Plus Jakarta Sans Variable, Inter, system-ui, sans-serif";

export function canvasOf(theme: ThemeKey) {
  const p = PALETTES[theme];
  return { bg: p.bg, dot: p.dot };
}

function themeCss(p: Palette) {
  return `
    rect.actor { rx: 10px; ry: 10px; filter: drop-shadow(0 3px 6px ${p.shadow}); }
    text.actor, text.actor tspan { font-weight: 600; }
    .actor-man text.actor, .actor-man text.actor tspan { fill: ${p.text} !important; }
    .actor-man circle, .actor-man line { stroke-width: 2px; }
    .actor-line { stroke-dasharray: 5 5; stroke-width: 1.3px; }
    .activation0, .activation1, .activation2 { rx: 3px; ry: 3px; }
    rect.note { rx: 6px; ry: 6px; filter: drop-shadow(0 2px 4px ${p.shadow}); }
    .labelBox { rx: 4px; ry: 4px; }
    .loopLine { stroke-width: 1.4px; }
    .messageText { font-weight: 500; }
    .sequenceNumber { font-weight: 700; }
    .node rect, .node circle, .node polygon, .node path, .classGroup rect, .statediagram-state rect, .er.entityBox {
      filter: drop-shadow(0 3px 6px ${p.shadow});
    }
    .node rect, .statediagram-state rect, .classGroup rect { rx: 8px; ry: 8px; }
    .node polygon { fill: ${p.decision} !important; stroke: ${p.decision} !important; }
    .node circle { fill: ${p.accent} !important; stroke: ${p.accent} !important; }
    .nodeLabel, .label { font-weight: 500; }
    .edgeLabel, .edgeLabel p, .edgeLabel rect { background-color: ${p.bg} !important; fill: ${p.bg} !important; color: ${p.text}; }
  `;
}

function configFor(theme: ThemeKey, forExport: boolean) {
  const base: any = {
    startOnLoad: false,
    securityLevel: "loose",
    fontFamily: FONT,
    htmlLabels: !forExport,
    flowchart: { htmlLabels: !forExport, curve: "basis", padding: 14 },
    class: { htmlLabels: !forExport },
    sequence: { actorMargin: 60, boxMargin: 12, messageMargin: 40, mirrorActors: false, noteMargin: 12 },
  };
  const p = PALETTES[theme];
  return {
    ...base,
    theme: "base",
    themeCSS: themeCss(p),
    themeVariables: {
      darkMode: p.dark,
      fontFamily: FONT,
      fontSize: "14px",
      background: p.bg,
      textColor: p.text,
      // secuencia
      actorBkg: p.actor,
      actorBorder: p.actorBorder,
      actorTextColor: p.actorText,
      actorLineColor: p.line,
      signalColor: p.signal,
      signalTextColor: p.text,
      activationBkgColor: p.activation,
      activationBorderColor: p.activationBorder,
      noteBkgColor: p.note,
      noteBorderColor: p.note,
      noteTextColor: p.noteText,
      labelBoxBkgColor: p.label,
      labelBoxBorderColor: p.label,
      labelTextColor: p.labelText,
      loopTextColor: p.text,
      sequenceNumberColor: p.dark ? "#1b1b1f" : "#ffffff",
      // flujo / clases / estados / ER
      primaryColor: p.actor,
      primaryTextColor: p.actorText,
      primaryBorderColor: p.actorBorder,
      secondaryColor: p.accent,
      tertiaryColor: p.decision,
      mainBkg: p.actor,
      nodeBorder: p.actorBorder,
      nodeTextColor: p.actorText,
      lineColor: p.line,
      edgeLabelBackground: p.bg,
      clusterBkg: p.dark ? "#18181b" : "#ffffff",
      clusterBorder: p.dark ? "#3f3f46" : "#d4d4d8",
      titleColor: p.text,
      classText: p.actorText,
      labelColor: p.actorText,
      stateLabelColor: p.actorText,
      transitionColor: p.line,
      transitionLabelColor: p.text,
      specialStateColor: p.text,
      compositeBackground: p.dark ? "#18181b" : "#ffffff",
      altBackground: p.dark ? "#27272a" : "#e4e4e7",
      attributeBackgroundColorOdd: p.dark ? "#2a2a30" : "#ffffff",
      attributeBackgroundColorEven: p.dark ? "#222227" : "#f4f4f5",
    },
  };
}

// mermaid.initialize es global → los renders se serializan para que cada uno use su tema.
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

export function renderMermaid(code: string, theme: ThemeKey, forExport = false) {
  const job = queue.then(async () => {
    mermaid.initialize(configFor(theme, forExport));
    return mermaid.render(`mmd-${forExport ? "x" : ""}${++counter}`, code);
  });
  queue = job.catch(() => {});
  return job;
}

// ── Tema seleccionado (global, persistido) ──

const KEY = "agentico.diagramTheme";
let current: ThemeKey = (() => {
  try {
    const v = localStorage.getItem(KEY) as ThemeKey | null;
    return v && THEMES.some((t) => t.value === v) ? v : "vivid";
  } catch {
    return "vivid";
  }
})();
const listeners = new Set<() => void>();

export function setDiagramTheme(t: ThemeKey) {
  current = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* no-op */
  }
  listeners.forEach((l) => l());
}

export function useDiagramTheme(): ThemeKey {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

// Fondo de puntos (CSS). `size`/`x`/`y` permiten que el patrón siga el zoom/pan.
export function dotBackground(theme: ThemeKey, size = 20, x = 0, y = 0) {
  const c = canvasOf(theme);
  let s = size;
  while (s < 10) s *= 2;
  return {
    backgroundColor: c.bg,
    backgroundImage: `radial-gradient(${c.dot} 1.2px, transparent 1.4px)`,
    backgroundSize: `${s}px ${s}px`,
    backgroundPosition: `${x}px ${y}px`,
  };
}
