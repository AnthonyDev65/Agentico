// Formato `.design` (Visual System) de Agentico: Markdown con listas de tokens.
//
//   # Nombre — Visual System
//   > Frase guía / subtítulo
//   Texto libre (Markdown) …
//   ## Colores
//   - primary #6366F1 — Botones y enlaces
//   ## Tipografía
//   - display "Space Grotesk" 700 56px/1.05 -0.02em — Títulos
//   ## Espaciado        - space-4 16px
//   ## Radios           - md 10px
//   ## Sombras          - card 0 4px 12px rgba(0,0,0,0.12)
//   ## Cualquier otra sección → se muestra como Markdown
//
// Línea de token: `- nombre valor… — descripción` (descripción opcional).

export type SectionKind = "colors" | "type" | "spacing" | "radius" | "shadow" | "md";

export type Token = { line: number; name: string; value: string; desc: string };

export type TypeToken = Token & {
  family: string;
  weight: string;
  size: string;
  lineHeight: string;
  tracking: string;
};

export type Section = {
  title: string;
  kind: SectionKind;
  tokens: Token[];
  md: string; // líneas que no son tokens (notas) o la sección entera si kind = md
};

// Sincronización con el proyecto: línea `<!-- agentico:tokens <ruta> <tailwind|css> -->`
// dentro del .design. La ruta es relativa a la raíz del proyecto.
export type TokenSync = { path: string; format: "tailwind" | "css" };
const SYNC_RE = /<!--\s*agentico:tokens\s+(\S+)(?:\s+(tailwind|css))?\s*-->/;

export function getSync(text: string): TokenSync | null {
  const m = SYNC_RE.exec(text);
  return m ? { path: m[1], format: (m[2] as TokenSync["format"]) ?? "css" } : null;
}

// Añade/actualiza/quita la línea de sincronización (va justo después del título).
export function setSync(text: string, sync: TokenSync | null): string {
  const line = sync ? `<!-- agentico:tokens ${sync.path} ${sync.format} -->` : "";
  if (SYNC_RE.test(text)) {
    return sync ? text.replace(SYNC_RE, line) : text.replace(new RegExp(SYNC_RE.source + "\\r?\\n?"), "");
  }
  if (!sync) return text;
  const lines = text.split("\n");
  const h1 = lines.findIndex((l) => /^#\s/.test(l));
  lines.splice(h1 >= 0 ? h1 + 1 : 0, 0, line);
  return lines.join("\n");
}

export type VisualSystem = {
  title: string;
  subtitle: string;
  intro: string;
  sections: Section[];
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function kindOf(title: string): SectionKind {
  const t = norm(title);
  if (/colou?r|paleta|palette/.test(t)) return "colors";
  if (/tipograf|typograph|fuente|font|texto/.test(t)) return "type";
  if (/espaci|spacing|space/.test(t)) return "spacing";
  if (/radio|radius|borde|corner/.test(t)) return "radius";
  if (/sombra|shadow|elevac/.test(t)) return "shadow";
  return "md";
}

const TOKEN_RE = /^\s*[-*]\s+(\S+)\s+(.+?)(?:\s+[—–]\s+(.*))?\s*$/;

export function parseTypeValue(t: Token): TypeToken {
  let rest = t.value.trim();
  let family = "";
  const q = /^"([^"]+)"|^'([^']+)'/.exec(rest);
  if (q) {
    family = q[1] ?? q[2];
    rest = rest.slice(q[0].length).trim();
  } else {
    family = rest.split(/\s+/)[0] ?? "";
    rest = rest.slice(family.length).trim();
  }
  const parts = rest.split(/\s+/).filter(Boolean);
  let weight = "400";
  let size = "16px";
  let lineHeight = "";
  let tracking = "";
  for (const p of parts) {
    if (/^\d{3}$/.test(p)) weight = p;
    else if (/^[\d.]+(px|rem|em)(\/[\d.]+(px|rem|em|%)?)?$/.test(p)) {
      const [s, lh] = p.split("/");
      size = s;
      lineHeight = lh ?? "";
    } else if (/^-?[\d.]+(em|px)$/.test(p)) tracking = p;
  }
  return { ...t, family, weight, size, lineHeight, tracking };
}

export function parseVisualSystem(text: string): VisualSystem {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const vs: VisualSystem = { title: "", subtitle: "", intro: "", sections: [] };
  const intro: string[] = [];
  let cur: (Section & { mdLines: string[] }) | null = null;
  let inFence = false;

  const flush = () => {
    if (cur) {
      cur.md = cur.mdLines.join("\n").trim();
      vs.sections.push({ title: cur.title, kind: cur.kind, tokens: cur.tokens, md: cur.md });
    }
  };

  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence) {
      const h1 = /^#\s+(.*)$/.exec(line);
      if (h1 && !vs.title && !cur) {
        vs.title = h1[1].trim();
        return;
      }
      const bq = /^>\s?(.*)$/.exec(line);
      if (bq && !cur && !vs.subtitle && !intro.some((l) => l.trim())) {
        vs.subtitle = bq[1].trim();
        return;
      }
      const h2 = /^##\s+(.*)$/.exec(line);
      if (h2) {
        flush();
        cur = { title: h2[1].trim(), kind: kindOf(h2[1]), tokens: [], md: "", mdLines: [] };
        return;
      }
      if (cur && cur.kind !== "md") {
        const m = TOKEN_RE.exec(line);
        if (m) {
          cur.tokens.push({ line: i, name: m[1], value: m[2].trim(), desc: (m[3] ?? "").trim() });
          return;
        }
      }
    }
    if (SYNC_RE.test(line)) return; // configuración, no contenido
    if (cur) cur.mdLines.push(line);
    else intro.push(line);
  });
  flush();
  vs.intro = intro.join("\n").trim();
  return vs;
}

// Primer «trozo» del valor (color, medida); en sombras es el valor completo.
export function mainValue(t: Token, kind: SectionKind) {
  return kind === "shadow" ? t.value : t.value.split(/\s+/)[0];
}

// Reemplaza el valor principal de un token en el texto (edición desde la vista visual).
export function replaceTokenValue(text: string, t: Token, kind: SectionKind, next: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const old = mainValue(t, kind);
  const l = lines[t.line];
  if (l == null) return text;
  const i = l.indexOf(old);
  if (i < 0) return text;
  lines[t.line] = l.slice(0, i) + next + l.slice(i + old.length);
  return lines.join("\n");
}

// ── Exportación ──

const slug = (s: string) =>
  norm(s)
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "");

function familyStack(f: string) {
  const mono = /mono|code|courier/i.test(f);
  return `"${f}", ${mono ? "ui-monospace, monospace" : "system-ui, sans-serif"}`;
}

export function toCssVars(vs: VisualSystem, tailwind = false) {
  const out: string[] = [];
  for (const s of vs.sections) {
    for (const t of s.tokens) {
      const n = slug(t.name);
      if (s.kind === "colors") out.push(`  --color-${n}: ${mainValue(t, s.kind)};`);
      else if (s.kind === "type") {
        const tt = parseTypeValue(t);
        out.push(`  --font-${n}: ${familyStack(tt.family)};`);
        out.push(`  --text-${n}: ${tt.size};`);
        if (tt.lineHeight) out.push(`  --text-${n}--line-height: ${tt.lineHeight};`);
        if (tt.tracking) out.push(`  --text-${n}--letter-spacing: ${tt.tracking};`);
        out.push(`  --text-${n}--font-weight: ${tt.weight};`);
      } else if (s.kind === "spacing") out.push(`  --${n.startsWith("space") ? n : `space-${n}`}: ${mainValue(t, s.kind)};`);
      else if (s.kind === "radius") out.push(`  --radius-${n}: ${mainValue(t, s.kind)};`);
      else if (s.kind === "shadow") out.push(`  --shadow-${n}: ${t.value};`);
    }
  }
  return `${tailwind ? "@theme" : ":root"} {\n${out.join("\n")}\n}\n`;
}

// Fuentes de Google a cargar para la vista (las que no estén instaladas fallan en silencio).
export function googleFontsUrl(vs: VisualSystem) {
  const fams = new Map<string, Set<string>>();
  for (const s of vs.sections)
    if (s.kind === "type")
      for (const t of s.tokens) {
        const tt = parseTypeValue(t);
        if (!tt.family) continue;
        if (!fams.has(tt.family)) fams.set(tt.family, new Set(["400"]));
        fams.get(tt.family)!.add(tt.weight);
      }
  if (!fams.size) return null;
  const q = [...fams]
    .map(([f, w]) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@${[...w].sort().join(";")}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

export function designTemplate(projectName: string) {
  return `# ${projectName} — Visual System
> Una frase que resume la personalidad visual del producto.

Describe aquí el tono visual: qué transmite la interfaz, qué evita y cómo se usan los elementos.

## Colores
- ink #0A0A0A — Texto principal y bloques fuertes
- paper #FAFAF9 — Fondo
- mist #E7E5E4 — Superficies y bordes suaves
- slate #6B6B6B — Texto secundario
- accent #C2412D — Acento: CTA, estados activos
- primary #4F46E5 — Enlaces y elementos interactivos

## Tipografía
- display "Space Grotesk" 700 56px/1.05 -0.03em — Titulares
- heading "Space Grotesk" 600 24px/1.25 — Títulos de sección
- body "Inter" 400 16px/1.6 — Texto corrido
- mono "JetBrains Mono" 400 13px/1.5 — Código y datos

## Espaciado
- space-1 4px
- space-2 8px
- space-4 16px
- space-6 24px
- space-8 32px
- space-12 48px

## Radios
- sm 6px — Inputs, chips
- md 10px — Botones
- lg 16px — Tarjetas
- full 999px — Avatares, píldoras

## Sombras
- sm 0 1px 2px rgba(0,0,0,0.08) — Elementos en reposo
- card 0 6px 20px rgba(0,0,0,0.10) — Tarjetas
- pop 0 18px 40px rgba(0,0,0,0.18) — Menús y modales

## Principios
- **Claridad antes que decoración.** Cada elemento debe tener una función.
- Contraste mínimo AA (4.5:1) para texto.
`;
}

// Contenido del archivo de tokens generado (CSS variables o @theme de Tailwind v4).
export function tokensFile(vs: VisualSystem, sync: TokenSync, sourceRel: string) {
  return (
    `/* Generado por Agentico desde ${sourceRel} — NO editar a mano:\n` +
    `   cambia los valores en el Visual System y este archivo se regenera solo. */\n\n` +
    toCssVars(vs, sync.format === "tailwind")
  );
}

// Rutas típicas del CSS principal (en orden de preferencia).
export const ENTRY_CSS_CANDIDATES = [
  "src/index.css",
  "src/app/globals.css",
  "app/globals.css",
  "src/styles/global.css",
  "src/styles/globals.css",
  "src/styles.css",
  "src/app.css",
  "src/main.css",
  "src/style.css",
  "src/assets/main.css",
  "styles/globals.css",
];

// Ruta relativa de `from` (archivo) a `to` (archivo), con "/".
export function relativePath(from: string, to: string) {
  const a = from.split("/").slice(0, -1);
  const b = to.split("/");
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const up = a.length - i;
  const rel = [...Array(up).fill(".."), ...b.slice(i)].join("/");
  return up === 0 ? `./${rel}` : rel;
}
