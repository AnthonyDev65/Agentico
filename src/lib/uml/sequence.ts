import { IND, Unsupported, joinPreamble, splitHeader, toId, uid } from "./common";

// ── Modelo de diagrama de secuencia ──

export type SeqParticipant = { id: string; label: string; kind: "participant" | "actor" };

export type SeqArrow = "->>" | "-->>" | "-)" | "--)" | "-x" | "--x" | "->" | "-->";

export const SEQ_ARROWS: { value: SeqArrow; label: string }[] = [
  { value: "->>", label: "→ Mensaje" },
  { value: "-->>", label: "⇢ Respuesta" },
  { value: "-)", label: "→ Asíncrono" },
  { value: "--)", label: "⇢ Asíncrono (punteado)" },
  { value: "-x", label: "✕ Error / cancelado" },
  { value: "--x", label: "✕ Error (punteado)" },
  { value: "->", label: "— Línea" },
  { value: "-->", label: "‥ Línea punteada" },
];

export type SeqBlockType = "alt" | "opt" | "loop" | "par" | "critical" | "break" | "rect";
export type SeqSepType = "else" | "and" | "option";

export const SEQ_BLOCKS: { value: SeqBlockType; label: string; sep?: SeqSepType }[] = [
  { value: "alt", label: "Si / Sino (alt)", sep: "else" },
  { value: "opt", label: "Opcional (opt)" },
  { value: "loop", label: "Bucle (loop)" },
  { value: "par", label: "Paralelo (par)", sep: "and" },
  { value: "critical", label: "Crítico (critical)", sep: "option" },
  { value: "break", label: "Interrupción (break)" },
  { value: "rect", label: "Resaltado (rect)" },
];

export type SeqStep =
  | { uid: string; t: "msg"; from: string; to: string; arrow: SeqArrow; text: string; act: "" | "+" | "-" }
  | { uid: string; t: "note"; pos: "right of" | "left of" | "over"; a: string; b: string; text: string }
  | { uid: string; t: "block"; type: SeqBlockType; label: string }
  | { uid: string; t: "sep"; type: SeqSepType; label: string }
  | { uid: string; t: "end" }
  | { uid: string; t: "raw"; text: string };

export type SeqModel = {
  preamble: string;
  autonumber: boolean;
  participants: SeqParticipant[];
  steps: SeqStep[];
};

const ARROW_RE = "-->>|->>|--x|-x|--\\)|-\\)|-->|->";
const MSG = new RegExp(`^(.+?)\\s*(${ARROW_RE})\\s*([+-]?)\\s*(.+?)\\s*:\\s?(.*)$`);
const PART = /^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i;
const NOTE = /^note\s+(right of|left of|over)\s+([^,:]+?)(?:\s*,\s*([^:]+?))?\s*:\s?(.*)$/i;
const BLOCK = /^(alt|opt|loop|par|critical|break|rect)\b\s*(.*)$/;
const SEP = /^(else|and|option)\b\s*(.*)$/;

export function parseSequence(code: string): SeqModel {
  const { preamble, body } = splitHeader(code, /^sequenceDiagram\b/);
  const m: SeqModel = { preamble, autonumber: false, participants: [], steps: [] };
  const known = new Map<string, SeqParticipant>();
  const ensure = (id: string) => {
    if (!known.has(id)) {
      const p: SeqParticipant = { id, label: id, kind: "participant" };
      known.set(id, p);
      m.participants.push(p);
    }
  };

  for (const raw of body) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(box|create|destroy)\b/i.test(line)) {
      throw new Unsupported(`El editor visual aún no soporta «${line.split(/\s/)[0]}»`);
    }
    if (line === "autonumber" || line.startsWith("autonumber ")) {
      m.autonumber = true;
      continue;
    }
    let r: RegExpMatchArray | null;
    if ((r = line.match(PART))) {
      const id = r[2].trim();
      const existing = known.get(id);
      const p: SeqParticipant = { id, label: (r[3] ?? id).trim(), kind: r[1].toLowerCase() as any };
      if (existing) Object.assign(existing, p);
      else {
        known.set(id, p);
        m.participants.push(p);
      }
      continue;
    }
    if ((r = line.match(NOTE))) {
      ensure(r[2].trim());
      if (r[3]) ensure(r[3].trim());
      m.steps.push({
        uid: uid(),
        t: "note",
        pos: r[1].toLowerCase() as any,
        a: r[2].trim(),
        b: r[3]?.trim() ?? "",
        text: r[4],
      });
      continue;
    }
    if (line === "end") {
      m.steps.push({ uid: uid(), t: "end" });
      continue;
    }
    if ((r = line.match(BLOCK))) {
      m.steps.push({ uid: uid(), t: "block", type: r[1] as SeqBlockType, label: r[2] });
      continue;
    }
    if ((r = line.match(SEP))) {
      m.steps.push({ uid: uid(), t: "sep", type: r[1] as SeqSepType, label: r[2] });
      continue;
    }
    if (!/^(activate|deactivate|%%|title)\b/.test(line) && (r = line.match(MSG))) {
      const from = r[1].trim();
      const to = r[4].trim();
      ensure(from);
      ensure(to);
      m.steps.push({
        uid: uid(),
        t: "msg",
        from,
        to,
        arrow: r[2] as SeqArrow,
        act: (r[3] as "" | "+" | "-") ?? "",
        text: r[5],
      });
      continue;
    }
    m.steps.push({ uid: uid(), t: "raw", text: line });
  }
  return m;
}

export function generateSequence(m: SeqModel): string {
  const out = ["sequenceDiagram"];
  if (m.autonumber) out.push(`${IND}autonumber`);
  for (const p of m.participants) {
    out.push(`${IND}${p.kind} ${p.id}${p.label && p.label !== p.id ? ` as ${p.label}` : ""}`);
  }
  let depth = 1;
  for (const s of m.steps) {
    if (s.t === "end" || s.t === "sep") depth = Math.max(1, depth - 1);
    const ind = IND.repeat(depth);
    switch (s.t) {
      case "msg":
        out.push(`${ind}${s.from}${s.arrow}${s.act}${s.to}: ${s.text}`);
        break;
      case "note":
        out.push(`${ind}Note ${s.pos} ${s.a}${s.pos === "over" && s.b ? `,${s.b}` : ""}: ${s.text}`);
        break;
      case "block":
        out.push(`${ind}${s.type}${s.label ? ` ${s.label}` : ""}`);
        depth++;
        break;
      case "sep":
        out.push(`${ind}${s.type}${s.label ? ` ${s.label}` : ""}`);
        depth++;
        break;
      case "end":
        out.push(`${ind}end`);
        break;
      case "raw":
        out.push(`${ind}${s.text}`);
        break;
    }
  }
  return joinPreamble(m.preamble, out.join("\n") + "\n");
}

// Profundidad de anidamiento de cada paso (para indentar en la UI).
export function stepDepths(steps: SeqStep[]) {
  let d = 0;
  return steps.map((s) => {
    if (s.t === "end") d = Math.max(0, d - 1);
    if (s.t === "sep") return Math.max(0, d - 1);
    const cur = d;
    if (s.t === "block") d++;
    return cur;
  });
}

export function newParticipantId(label: string, m: SeqModel, self?: string) {
  const taken = new Set(m.participants.map((p) => p.id).filter((id) => id !== self));
  return toId(label, taken, "P");
}

// Renombra un participante y actualiza todas sus referencias.
export function renameParticipant(m: SeqModel, oldId: string, newId: string): SeqModel {
  const fix = (x: string) => (x === oldId ? newId : x);
  return {
    ...m,
    participants: m.participants.map((p) => (p.id === oldId ? { ...p, id: newId } : p)),
    steps: m.steps.map((s) =>
      s.t === "msg" ? { ...s, from: fix(s.from), to: fix(s.to) } : s.t === "note" ? { ...s, a: fix(s.a), b: fix(s.b) } : s,
    ),
  };
}

export const SEQ_STARTER = `sequenceDiagram
    actor Usuario
    participant Sistema
    Usuario->>Sistema: Solicitud
    Sistema-->>Usuario: Respuesta
`;
