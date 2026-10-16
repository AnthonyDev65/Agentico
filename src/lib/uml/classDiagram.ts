import { IND, Unsupported, joinPreamble, splitHeader, toId, uid } from "./common";

// ── Modelo de diagrama de clases ──

export type Visibility = "" | "+" | "-" | "#" | "~";

export const VISIBILITIES: { value: Visibility; label: string }[] = [
  { value: "+", label: "+ público" },
  { value: "-", label: "− privado" },
  { value: "#", label: "# protegido" },
  { value: "~", label: "~ paquete" },
  { value: "", label: "· ninguna" },
];

export type ClassMember = {
  uid: string;
  vis: Visibility;
  kind: "attr" | "method";
  name: string;
  type: string;
  params: string;
  classifier: "" | "$" | "*"; // $ estático, * abstracto
};

export type UmlClass = { uid: string; name: string; annotation: string; members: ClassMember[] };

export type RelArrow = "<|--" | "*--" | "o--" | "-->" | "--" | "..>" | "..|>" | "..";

export const REL_ARROWS: { value: RelArrow; label: string; describe: (a: string, b: string) => string }[] = [
  { value: "<|--", label: "◁— Herencia", describe: (a, b) => `${b} hereda de ${a}` },
  { value: "..|>", label: "‥▷ Implementa", describe: (a, b) => `${a} implementa ${b}` },
  { value: "*--", label: "◆— Composición", describe: (a, b) => `${a} se compone de ${b}` },
  { value: "o--", label: "◇— Agregación", describe: (a, b) => `${a} agrega ${b}` },
  { value: "-->", label: "—> Asociación", describe: (a, b) => `${a} se asocia con ${b}` },
  { value: "..>", label: "‥> Dependencia", describe: (a, b) => `${a} depende de ${b}` },
  { value: "--", label: "—— Enlace", describe: (a, b) => `${a} — ${b}` },
  { value: "..", label: "‥‥ Enlace punteado", describe: (a, b) => `${a} ‥ ${b}` },
];

export const ANNOTATIONS = ["", "interface", "abstract", "enumeration", "service"];

export type UmlRelation = {
  uid: string;
  from: string;
  to: string;
  arrow: RelArrow;
  fromCard: string;
  toCard: string;
  label: string;
};

export type ClassModel = {
  preamble: string;
  direction: string;
  classes: UmlClass[];
  relations: UmlRelation[];
  raw: string[];
};

const NAME = "[\\w~,]+";
// Flechas invertidas → se normalizan intercambiando los extremos.
const REVERSED: Record<string, RelArrow> = {
  "--|>": "<|--",
  "--*": "*--",
  "--o": "o--",
  "<--": "-->",
  "<..": "..>",
  "<|..": "..|>",
};
const REL = new RegExp(
  `^(${NAME})\\s*(?:"([^"]*)")?\\s*(<\\|--|--\\|>|\\*--|--\\*|o--|--o|<--|-->|<\\.\\.|\\.\\.>|\\.\\.\\|>|<\\|\\.\\.|--|\\.\\.)\\s*(?:"([^"]*)")?\\s*(${NAME})\\s*(?::\\s*(.*))?$`,
);

export function parseMember(text: string): ClassMember {
  let s = text.trim();
  const base: ClassMember = { uid: uid(), vis: "", kind: "attr", name: "", type: "", params: "", classifier: "" };
  const v = s.match(/^([+\-#~])\s*/);
  if (v) {
    base.vis = v[1] as Visibility;
    s = s.slice(v[0].length);
  }
  const meth = s.match(/^([\w~]+)\((.*)\)([$*]?)\s*(.*)$/);
  if (meth) {
    return { ...base, kind: "method", name: meth[1], params: meth[2], classifier: meth[3] as any, type: meth[4].trim() };
  }
  let classifier: "" | "$" | "*" = "";
  if (/[$*]$/.test(s)) {
    classifier = s.slice(-1) as "$" | "*";
    s = s.slice(0, -1).trim();
  }
  const colon = s.match(/^([\w~]+)\s*:\s*(.+)$/);
  if (colon) return { ...base, name: colon[1], type: colon[2].trim(), classifier };
  const parts = s.split(/\s+/);
  if (parts.length >= 2) return { ...base, name: parts.pop()!, type: parts.join(" "), classifier };
  return { ...base, name: s, classifier };
}

export function memberText(m: ClassMember) {
  if (m.kind === "method") return `${m.vis}${m.name}(${m.params})${m.classifier}${m.type ? ` ${m.type}` : ""}`;
  return `${m.vis}${m.type ? `${m.type} ` : ""}${m.name}${m.classifier}`;
}

export function parseClass(code: string): ClassModel {
  const { preamble, body } = splitHeader(code, /^classDiagram(-v2)?\b/);
  const m: ClassModel = { preamble, direction: "", classes: [], relations: [], raw: [] };
  const byName = new Map<string, UmlClass>();
  const ensure = (name: string) => {
    let c = byName.get(name);
    if (!c) {
      c = { uid: uid(), name, annotation: "", members: [] };
      byName.set(name, c);
      m.classes.push(c);
    }
    return c;
  };

  let open: UmlClass | null = null;
  for (const rawLine of body) {
    const line = rawLine.trim();
    if (!line) continue;
    if (open) {
      if (line === "}") {
        open = null;
        continue;
      }
      const ann = line.match(/^<<(.+)>>$/);
      if (ann) open.annotation = ann[1].trim();
      else open.members.push(parseMember(line));
      continue;
    }
    if (/^namespace\b/.test(line)) throw new Unsupported("El editor visual aún no soporta «namespace»");
    let r: RegExpMatchArray | null;
    if ((r = line.match(/^direction\s+(\w+)$/))) {
      m.direction = r[1];
      continue;
    }
    if ((r = line.match(new RegExp(`^class\\s+(${NAME})\\s*(\\{)?\\s*(\\})?$`)))) {
      const c = ensure(r[1]);
      if (r[2] && !r[3]) open = c;
      continue;
    }
    if ((r = line.match(new RegExp(`^<<(.+)>>\\s*(${NAME})$`)))) {
      ensure(r[2]).annotation = r[1].trim();
      continue;
    }
    if ((r = line.match(REL))) {
      let [from, fromCard, arrow, toCard, to] = [r[1], r[2] ?? "", r[3], r[4] ?? "", r[5]];
      if (REVERSED[arrow]) {
        arrow = REVERSED[arrow];
        [from, to] = [to, from];
        [fromCard, toCard] = [toCard, fromCard];
      }
      ensure(from);
      ensure(to);
      m.relations.push({ uid: uid(), from, to, arrow: arrow as RelArrow, fromCard, toCard, label: r[6]?.trim() ?? "" });
      continue;
    }
    if ((r = line.match(new RegExp(`^(${NAME})\\s*:\\s*(.+)$`)))) {
      ensure(r[1]).members.push(parseMember(r[2]));
      continue;
    }
    m.raw.push(line);
  }
  return m;
}

export function generateClass(m: ClassModel): string {
  const out = ["classDiagram"];
  if (m.direction) out.push(`${IND}direction ${m.direction}`);
  for (const c of m.classes) {
    if (!c.members.length && !c.annotation) {
      out.push(`${IND}class ${c.name}`);
      continue;
    }
    out.push(`${IND}class ${c.name} {`);
    if (c.annotation) out.push(`${IND}${IND}<<${c.annotation}>>`);
    for (const mem of c.members) if (mem.name.trim()) out.push(`${IND}${IND}${memberText(mem)}`);
    out.push(`${IND}}`);
  }
  for (const r of m.relations) {
    if (!r.from || !r.to) continue;
    out.push(
      `${IND}${r.from}${r.fromCard ? ` "${r.fromCard}"` : ""} ${r.arrow} ${r.toCard ? `"${r.toCard}" ` : ""}${r.to}${
        r.label ? ` : ${r.label}` : ""
      }`,
    );
  }
  for (const l of m.raw) out.push(`${IND}${l}`);
  return joinPreamble(m.preamble, out.join("\n") + "\n");
}

export function newClassName(label: string, m: ClassModel, self?: string) {
  const taken = new Set(m.classes.map((c) => c.name).filter((n) => n !== self));
  // PascalCase sin acentos ni espacios
  const pascal = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^\w]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
  return toId(pascal || "Clase", taken, "Clase");
}

export function renameClass(m: ClassModel, oldName: string, newName: string): ClassModel {
  const fix = (x: string) => (x === oldName ? newName : x);
  return {
    ...m,
    classes: m.classes.map((c) => (c.name === oldName ? { ...c, name: newName } : c)),
    relations: m.relations.map((r) => ({ ...r, from: fix(r.from), to: fix(r.to) })),
  };
}

export const CLASS_STARTER = `classDiagram
    class Usuario {
        +String nombre
        +String email
        +login() bool
    }
`;
