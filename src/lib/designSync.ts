import { invoke } from "@tauri-apps/api/core";
import {
  ENTRY_CSS_CANDIDATES,
  getSync,
  parseVisualSystem,
  relativePath,
  tokensFile,
  type TokenSync,
} from "@/lib/visualSystem";
import { normPath, onFsChange } from "@/lib/fsEvents";

// Sincroniza un Visual System (.design) con el archivo de tokens CSS del proyecto:
// cuando el .design cambia en disco (lo edites tú o el agente) se regenera el CSS y,
// como todo el proyecto usa esas variables, los cambios se ven en toda la app.

const join = (a: string, b: string) => `${a.replace(/[\\/]+$/, "")}/${b.replace(/^[\\/]+/, "")}`;
const read = (path: string) => invoke<string>("fs_read", { path }).catch(() => null);

export function relToProject(projectPath: string, abs: string) {
  const r = normPath(projectPath);
  const a = abs.replace(/[\\/]+/g, "/");
  return normPath(a).startsWith(r + "/") ? a.slice(r.length + 1) : a.split("/").pop()!;
}

/** Regenera el archivo de tokens si el .design tiene la línea de sincronización. */
export async function syncDesign(projectPath: string, designPath: string): Promise<{ target: string; written: boolean } | null> {
  const text = await read(designPath);
  if (text == null) return null;
  const sync = getSync(text);
  if (!sync) return null;
  const out = tokensFile(parseVisualSystem(text), sync, relToProject(projectPath, designPath));
  const target = join(projectPath, sync.path);
  if ((await read(target)) === out) return { target: sync.path, written: false };
  await invoke("fs_write", { path: target, content: out });
  return { target: sync.path, written: true };
}

/** Vigila los .design del proyecto y mantiene sus tokens al día. Devuelve el «unsubscribe». */
export function watchDesignSync(projectPath: string) {
  return onFsChange(projectPath, (c) => {
    for (const f of c.files) if (/\.design$/i.test(f)) syncDesign(projectPath, f).catch(() => {});
  });
}

/** CSS principal del proyecto (para importar los tokens). */
export async function findEntryCss(projectPath: string) {
  for (const rel of ENTRY_CSS_CANDIDATES) {
    const text = await read(join(projectPath, rel));
    if (text != null) return { rel, text };
  }
  return null;
}

/** Sugerencia de ruta y formato para un proyecto. */
export async function suggestSync(projectPath: string): Promise<TokenSync & { entry: string | null }> {
  const entry = await findEntryCss(projectPath);
  const pkg = await read(join(projectPath, "package.json"));
  const tailwind = !!entry?.text.includes("tailwindcss") || !!pkg?.includes('"tailwindcss"');
  const hasSrc = (await invoke<{ name: string; is_dir: boolean }[]>("fs_list", { path: projectPath }).catch(() => [])).some(
    (e) => e.is_dir && e.name === "src",
  );
  return { path: hasSrc ? "src/styles/tokens.css" : "styles/tokens.css", format: tailwind ? "tailwind" : "css", entry: entry?.rel ?? null };
}

/**
 * Importa el archivo de tokens en el CSS principal (si no estaba).
 * Tailwind: justo después de `@import "tailwindcss"`; CSS normal: al principio.
 */
export async function importTokensInEntry(projectPath: string, tokensRel: string): Promise<string | null> {
  const entry = await findEntryCss(projectPath);
  if (!entry) return null;
  const spec = relativePath(entry.rel, tokensRel);
  const name = tokensRel.split("/").pop()!;
  if (entry.text.includes(spec) || new RegExp(`@import\\s+["'][^"']*${name.replace(".", "\\.")}["']`).test(entry.text)) return entry.rel;
  const line = `@import "${spec}";`;
  const lines = entry.text.split("\n");
  const tw = lines.findIndex((l) => /@import\s+["']tailwindcss/.test(l));
  if (tw >= 0) lines.splice(tw + 1, 0, line);
  else {
    const charset = lines[0]?.startsWith("@charset") ? 1 : 0;
    lines.splice(charset, 0, line);
  }
  await invoke("fs_write", { path: join(projectPath, entry.rel), content: lines.join("\n") });
  return entry.rel;
}
