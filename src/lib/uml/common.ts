// Utilidades compartidas por los modelos UML (Mermaid ⇄ modelo visual).

export class Unsupported extends Error {}

export const IND = "    ";

let seq = 0;
export const uid = () => `u${Date.now().toString(36)}${(seq++).toString(36)}`;

// Separa las líneas previas a la cabecera (frontmatter `---`, `%%{init}%%`, comentarios)
// de las del cuerpo. `header` = regex de la línea de tipo (p.ej. /^sequenceDiagram\b/).
export function splitHeader(code: string, header: RegExp) {
  const lines = code.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  // Frontmatter YAML
  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((l, k) => k > 0 && l.trim() === "---");
    if (close > 0) i = close + 1;
  }
  while (i < lines.length && !header.test(lines[i].trim())) i++;
  if (i >= lines.length) throw new Unsupported("No se encontró la cabecera del diagrama");
  return {
    preamble: lines.slice(0, i).join("\n"),
    headerLine: lines[i].trim(),
    body: lines.slice(i + 1),
  };
}

export function joinPreamble(preamble: string, rest: string) {
  return preamble.trim() ? `${preamble.replace(/\s+$/, "")}\n${rest}` : rest;
}

// Identificador válido a partir de un nombre libre (sin espacios ni símbolos).
export function toId(label: string, taken: Set<string>, fallback = "N") {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w]+/g, "_")
      .replace(/^_+|_+$/g, "") || fallback;
  const safe = /^\d/.test(base) ? `${fallback}${base}` : base;
  let id = safe;
  for (let n = 2; taken.has(id); n++) id = `${safe}${n}`;
  return id;
}

export function move<T>(arr: T[], from: number, to: number) {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
