import { IND, Unsupported, joinPreamble, splitHeader, uid } from "./common";

// ── Modelo de grafo: diagramas de flujo (flowchart) y de estados (stateDiagram) ──

export type GraphKind = "flow" | "state";

export type NodeShape =
  | "rect"
  | "round"
  | "stadium"
  | "subroutine"
  | "database"
  | "circle"
  | "diamond"
  | "hexagon"
  | "parallelogram"
  | "flag";

export const SHAPES: { value: NodeShape; label: string; open: string; close: string }[] = [
  { value: "rect", label: "▭ Proceso", open: "[", close: "]" },
  { value: "round", label: "▢ Redondeado", open: "(", close: ")" },
  { value: "stadium", label: "⬭ Inicio / fin", open: "([", close: "])" },
  { value: "diamond", label: "◇ Decisión", open: "{", close: "}" },
  { value: "circle", label: "○ Círculo", open: "((", close: "))" },
  { value: "database", label: "⛁ Base de datos", open: "[(", close: ")]" },
  { value: "subroutine", label: "⧈ Subproceso", open: "[[", close: "]]" },
  { value: "hexagon", label: "⬡ Preparación", open: "{{", close: "}}" },
  { value: "parallelogram", label: "▱ Entrada / salida", open: "[/", close: "/]" },
  { value: "flag", label: "⚑ Bandera", open: ">", close: "]" },
];

export type EdgeStyle = "-->" | "---" | "-.->" | "==>";

export const EDGE_STYLES: { value: EdgeStyle; label: string }[] = [
  { value: "-->", label: "→ Flecha" },
  { value: "-.->", label: "⇢ Punteada" },
  { value: "==>", label: "⇒ Gruesa" },
  { value: "---", label: "— Línea" },
];

export const DIRECTIONS = [
  { value: "TD", label: "↓ Arriba → abajo" },
  { value: "LR", label: "→ Izquierda → derecha" },
  { value: "BT", label: "↑ Abajo → arriba" },
  { value: "RL", label: "← Derecha → izquierda" },
];

// En estados, START/END representan el pseudo-estado [*].
export const START = "[*]";

export type GNode = { uid: string; id: string; label: string; shape: NodeShape };
export type GEdge = { uid: string; from: string; to: string; style: EdgeStyle; label: string };

export type GraphModel = {
  kind: GraphKind;
  preamble: string;
  headerWord: string; // flowchart | graph | stateDiagram-v2 | stateDiagram
  direction: string;
  nodes: GNode[];
  edges: GEdge[];
  raw: string[];
};

// ── Flowchart ──

const SHAPE_BY_OPEN = [...SHAPES].sort((a, b) => b.open.length - a.open.length);
const ID = /^[A-Za-z0-9_]\w*/;

function stripQuotes(s: string) {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/#quot;/g, '"') : t;
}

// Lee `id` + forma opcional desde el inicio de `s`. Devuelve el resto sin consumir.
function readNode(s: string): { id: string; shape?: NodeShape; label?: string; rest: string } | null {
  const idm = s.match(ID);
  if (!idm) return null;
  const id = idm[0];
  const rest = s.slice(id.length);
  for (const sh of SHAPE_BY_OPEN) {
    if (rest.startsWith(sh.open)) {
      const end = rest.indexOf(sh.close, sh.open.length);
      if (end < 0) continue;
      const label = stripQuotes(rest.slice(sh.open.length, end));
      return { id, shape: sh.value, label, rest: rest.slice(end + sh.close.length) };
    }
  }
  return { id, rest };
}

const EDGE_PATTERNS: { re: RegExp; style: EdgeStyle }[] = [
  { re: /^\s*-->\s*\|([^|]*)\|\s*/, style: "-->" },
  { re: /^\s*---\s*\|([^|]*)\|\s*/, style: "---" },
  { re: /^\s*-\.->\s*\|([^|]*)\|\s*/, style: "-.->" },
  { re: /^\s*==>\s*\|([^|]*)\|\s*/, style: "==>" },
  { re: /^\s*--\s+(.+?)\s+-->\s*/, style: "-->" },
  { re: /^\s*-\.\s+(.+?)\s+\.->\s*/, style: "-.->" },
  { re: /^\s*==\s+(.+?)\s+==>\s*/, style: "==>" },
  { re: /^\s*-->\s*/, style: "-->" },
  { re: /^\s*-\.->\s*/, style: "-.->" },
  { re: /^\s*==>\s*/, style: "==>" },
  { re: /^\s*---\s*/, style: "---" },
];

function readEdge(s: string) {
  for (const p of EDGE_PATTERNS) {
    const m = s.match(p.re);
    if (m) return { style: p.style, label: stripQuotes(m[1] ?? ""), rest: s.slice(m[0].length) };
  }
  return null;
}

const FLOW_RAW = /^(style|classDef|class|click|linkStyle|%%)\b/;

function parseFlow(code: string): GraphModel {
  const { preamble, headerLine, body } = splitHeader(code, /^(flowchart|graph)\b/);
  const [headerWord, dir] = headerLine.split(/\s+/);
  const m: GraphModel = {
    kind: "flow",
    preamble,
    headerWord,
    direction: dir === "TB" ? "TD" : dir || "TD",
    nodes: [],
    edges: [],
    raw: [],
  };
  const byId = new Map<string, GNode>();
  const touch = (n: { id: string; shape?: NodeShape; label?: string }) => {
    let node = byId.get(n.id);
    if (!node) {
      node = { uid: uid(), id: n.id, label: n.label ?? n.id, shape: n.shape ?? "rect" };
      byId.set(n.id, node);
      m.nodes.push(node);
    } else if (n.shape) {
      node.shape = n.shape;
      node.label = n.label ?? node.label;
    }
  };

  for (const rawLine of body) {
    const line = rawLine.trim().replace(/;$/, "");
    if (!line) continue;
    if (/^(subgraph|end)\b/.test(line)) throw new Unsupported("El editor visual aún no soporta «subgraph»");
    if (FLOW_RAW.test(line)) {
      m.raw.push(line);
      continue;
    }
    // nodo (edge nodo)*
    const first = readNode(line);
    if (!first) {
      m.raw.push(line);
      continue;
    }
    const parsedNodes = [first];
    const parsedEdges: { style: EdgeStyle; label: string }[] = [];
    let rest = first.rest;
    let ok = true;
    while (rest.trim()) {
      const e = readEdge(rest);
      const n = e && readNode(e.rest.trimStart());
      if (!e || !n) {
        ok = false;
        break;
      }
      parsedEdges.push({ style: e.style, label: e.label });
      parsedNodes.push(n);
      rest = n.rest;
    }
    if (!ok) {
      m.raw.push(line);
      continue;
    }
    parsedNodes.forEach(touch);
    parsedEdges.forEach((e, i) =>
      m.edges.push({ uid: uid(), from: parsedNodes[i].id, to: parsedNodes[i + 1].id, ...e }),
    );
  }
  return m;
}

function q(label: string) {
  return `"${label.replace(/"/g, "#quot;")}"`;
}

function generateFlow(m: GraphModel): string {
  const out = [`${m.headerWord || "flowchart"} ${m.direction || "TD"}`];
  for (const n of m.nodes) {
    const sh = SHAPES.find((s) => s.value === n.shape) ?? SHAPES[0];
    out.push(`${IND}${n.id}${sh.open}${q(n.label || n.id)}${sh.close}`);
  }
  for (const e of m.edges) {
    if (!e.from || !e.to) continue;
    out.push(`${IND}${e.from} ${e.style}${e.label ? `|${q(e.label)}|` : ""} ${e.to}`);
  }
  for (const l of m.raw) out.push(`${IND}${l}`);
  return joinPreamble(m.preamble, out.join("\n") + "\n");
}

// ── State ──

const STATE_ID = "(\\[\\*\\]|[\\w-]+)";
const TRANS = new RegExp(`^${STATE_ID}\\s*-->\\s*${STATE_ID}\\s*(?::\\s*(.*))?$`);

function parseState(code: string): GraphModel {
  const { preamble, headerLine, body } = splitHeader(code, /^stateDiagram(-v2)?\b/);
  const m: GraphModel = {
    kind: "state",
    preamble,
    headerWord: headerLine.split(/\s+/)[0],
    direction: "",
    nodes: [],
    edges: [],
    raw: [],
  };
  const byId = new Map<string, GNode>();
  const ensure = (id: string) => {
    if (id === START) return;
    if (!byId.has(id)) {
      const n: GNode = { uid: uid(), id, label: id, shape: "round" };
      byId.set(id, n);
      m.nodes.push(n);
    }
  };

  for (const rawLine of body) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/[{}]/.test(line) || /^(--|note|end note)\b/.test(line)) {
      throw new Unsupported("El editor visual aún no soporta estados compuestos ni notas");
    }
    let r: RegExpMatchArray | null;
    if ((r = line.match(/^direction\s+(\w+)$/))) {
      m.direction = r[1];
      continue;
    }
    if ((r = line.match(TRANS))) {
      ensure(r[1]);
      ensure(r[2]);
      m.edges.push({ uid: uid(), from: r[1], to: r[2], style: "-->", label: r[3]?.trim() ?? "" });
      continue;
    }
    if ((r = line.match(/^state\s+"([^"]*)"\s+as\s+([\w-]+)$/))) {
      ensure(r[2]);
      byId.get(r[2])!.label = r[1];
      continue;
    }
    if ((r = line.match(/^([\w-]+)\s*:\s*(.+)$/))) {
      ensure(r[1]);
      byId.get(r[1])!.label = r[2].trim();
      continue;
    }
    if ((r = line.match(/^state\s+([\w-]+)$/)) || (r = line.match(/^([\w-]+)$/))) {
      ensure(r[1]);
      continue;
    }
    m.raw.push(line);
  }
  return m;
}

function generateState(m: GraphModel): string {
  const out = [m.headerWord || "stateDiagram-v2"];
  if (m.direction) out.push(`${IND}direction ${m.direction}`);
  for (const n of m.nodes) {
    if (n.label && n.label !== n.id) out.push(`${IND}state ${q(n.label)} as ${n.id}`);
    else out.push(`${IND}${n.id}`);
  }
  for (const e of m.edges) {
    if (!e.from || !e.to) continue;
    out.push(`${IND}${e.from} --> ${e.to}${e.label ? ` : ${e.label}` : ""}`);
  }
  for (const l of m.raw) out.push(`${IND}${l}`);
  return joinPreamble(m.preamble, out.join("\n") + "\n");
}

export function parseGraph(code: string, kind: GraphKind) {
  return kind === "flow" ? parseFlow(code) : parseState(code);
}

export function generateGraph(m: GraphModel) {
  return m.kind === "flow" ? generateFlow(m) : generateState(m);
}

// Ids de nodo: A, B, … Z, A1, B1…
export function nextNodeId(m: GraphModel) {
  const taken = new Set(m.nodes.map((n) => n.id));
  for (let i = 0; ; i++) {
    const id = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "");
    if (!taken.has(id)) return id;
  }
}

export const FLOW_STARTER = `flowchart TD
    A(["Inicio"])
    B{"¿Condición?"}
    C["Acción"]
    D(["Fin"])
    A --> B
    B -->|"Sí"| C
    B -->|"No"| D
    C --> D
`;

export const STATE_STARTER = `stateDiagram-v2
    Pendiente
    Completado
    [*] --> Pendiente
    Pendiente --> Completado : completar
    Completado --> [*]
`;
