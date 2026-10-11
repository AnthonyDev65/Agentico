import * as esbuild from "esbuild-wasm";
import esbuildWasmUrl from "esbuild-wasm/esbuild.wasm?url";
import twBrowserScript from "@tailwindcss/browser?raw";
import { invoke } from "@tauri-apps/api/core";

let initPromise: Promise<void> | null = null;
function ensureInit() {
  if (!initPromise) initPromise = esbuild.initialize({ wasmURL: esbuildWasmUrl, worker: true });
  return initPromise;
}

function toFwd(p: string) {
  return p.replace(/\\/g, "/");
}
function dirname(p: string) {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i) : p;
}
function normalize(p: string) {
  const abs = /^[A-Za-z]:\//.test(p) || p.startsWith("/");
  const parts = p.split("/");
  const out: string[] = [];
  for (const seg of parts) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  const joined = out.join("/");
  return abs && p.startsWith("/") ? "/" + joined : joined;
}

const EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".json"];

async function readReactVersion(projectPath: string): Promise<string> {
  try {
    const pkg = await invoke<string>("fs_read", {
      path: `${projectPath}/node_modules/react/package.json`,
    });
    const v = JSON.parse(pkg).version;
    return typeof v === "string" ? v : "18";
  } catch {
    return "18";
  }
}

async function tryRead(path: string): Promise<string | null> {
  try {
    return await invoke<string>("fs_read", { path });
  } catch {
    return null;
  }
}

async function resolveLocal(
  spec: string,
  importer: string,
  projectPath: string,
): Promise<string | null> {
  let base: string;
  if (/^[A-Za-z]:\//.test(spec) || spec.startsWith("/")) base = spec;
  else if (spec.startsWith("@/")) base = `${projectPath}/src/${spec.slice(2)}`;
  else base = `${dirname(importer)}/${spec}`;
  base = normalize(base);

  const candidates = [
    base,
    ...EXTS.map((e) => base + e),
    ...EXTS.map((e) => `${base}/index${e}`),
  ];
  for (const c of candidates) {
    if ((await tryRead(c)) !== null) return c;
  }
  return null;
}

export type BundleResult = { html?: string; error?: string };

/**
 * Compila un componente TSX/JSX (y sus imports) a un módulo ESM y devuelve
 * un HTML listo para un iframe que lo renderiza. Best-effort: imports npm se
 * resuelven desde esm.sh (requiere internet); CSS y assets se omiten.
 */
export async function bundleComponent(opts: {
  projectPath: string;
  filePath: string;
  content: string;
}): Promise<BundleResult> {
  const projectPath = toFwd(opts.projectPath);
  const filePath = toFwd(opts.filePath);
  const reactVer = await readReactVersion(projectPath);

  try {
    await ensureInit();

    const entryCode = `
import * as Mod from ${JSON.stringify(filePath)};
import React from "react";
import { createRoot } from "react-dom/client";
class __EB extends React.Component {
  constructor(p){ super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err){ return { err: err }; }
  render(){
    if (this.state.err) {
      return React.createElement("pre", { style: { margin:0, padding:16, color:"#d44", whiteSpace:"pre-wrap", font:"12px/1.5 system-ui,sans-serif" } },
        "El componente lanzo un error al renderizar (puede requerir props o contexto):\\n\\n" + (this.state.err && this.state.err.message ? this.state.err.message : String(this.state.err)));
    }
    return this.props.children;
  }
}
const __Comp = Mod.default ?? Object.values(Mod).find((v) => typeof v === "function");
const __el = document.getElementById("root");
if (!__Comp) {
  __el.innerHTML = '<div style="padding:16px;color:#e9a0a0;font-family:system-ui">Este archivo no exporta un componente (export default o una funcion).</div>';
} else {
  createRoot(__el).render(React.createElement(__EB, null, React.createElement(__Comp)));
}
`;

    const plugin: esbuild.Plugin = {
      name: "agentico",
      setup(build) {
        build.onResolve({ filter: /^entry:/ }, (args) => ({
          path: args.path,
          namespace: "entry",
        }));
        build.onLoad({ filter: /.*/, namespace: "entry" }, () => ({
          contents: entryCode,
          loader: "tsx",
          resolveDir: projectPath,
        }));

        build.onResolve({ filter: /.*/ }, async (args) => {
          const p = args.path;
          const isBare =
            !p.startsWith(".") &&
            !p.startsWith("/") &&
            !p.startsWith("@/") &&
            !/^[A-Za-z]:\//.test(toFwd(p));
          if (isBare) {
            let url: string;
            if (p === "react" || p.startsWith("react/"))
              url = `https://esm.sh/react@${reactVer}${p.slice("react".length)}`;
            else if (p === "react-dom" || p.startsWith("react-dom/"))
              url = `https://esm.sh/react-dom@${reactVer}${p.slice("react-dom".length)}?deps=react@${reactVer}`;
            else url = `https://esm.sh/${p}?deps=react@${reactVer}`;
            return { path: url, external: true };
          }
          const importer = args.importer ? toFwd(args.importer) : filePath;
          const resolved = await resolveLocal(toFwd(p), importer, projectPath);
          if (!resolved) return { path: p, external: true };
          return { path: resolved, namespace: "local" };
        });

        build.onLoad({ filter: /.*/, namespace: "local" }, async (args) => {
          const ext = args.path.split(".").pop()?.toLowerCase();
          if (ext === "css" || ext === "scss" || ext === "sass" || ext === "less") {
            return { contents: "", loader: "js" }; // CSS omitido en el preview
          }
          if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext || "")) {
            return { contents: 'export default ""', loader: "js" }; // assets omitidos
          }
          const content = args.path === filePath ? opts.content : await invoke<string>("fs_read", { path: args.path });
          const loader =
            ext === "ts" ? "ts" : ext === "tsx" ? "tsx" : ext === "jsx" ? "jsx" : ext === "json" ? "json" : "js";
          return { contents: content, loader, resolveDir: dirname(args.path) };
        });
      },
    };

    const result = await esbuild.build({
      entryPoints: ["entry:main"],
      bundle: true,
      write: false,
      format: "esm",
      jsx: "automatic",
      target: "es2020",
      plugins: [plugin],
      define: { "process.env.NODE_ENV": '"development"' },
      logLevel: "silent",
    });

    const js = (result.outputFiles?.[0]?.text ?? "").replace(/<\/script>/g, "<\\/script>");

    // Estilos del proyecto (Tailwind compilado en el navegador, o CSS crudo).
    let styles: { uses_tailwind: boolean; css: string } = { uses_tailwind: false, css: "" };
    try {
      styles = await invoke("preview_styles", { projectPath });
    } catch {
      /* sin estilos */
    }

    const baseCss = `*{box-sizing:border-box} html,body{margin:0} #root{min-height:100vh}`;
    // El build de Tailwind en el navegador no soporta @import de node_modules/archivos
    // (solo "tailwindcss"); los quitamos para que no falle la compilación.
    const cleanCss = styles.css.replace(/@import\s+[^;]+;/g, (m) => (/tailwindcss/.test(m) ? m : ""));
    const projectStyle = styles.uses_tailwind
      ? `<style type="text/tailwindcss">${cleanCss}</style>`
      : `<style>${cleanCss}</style>`;
    const twCompiler = styles.uses_tailwind ? `<script>${twBrowserScript}</script>` : "";

    // Captura errores dentro del iframe y los muestra (si no, queda en blanco).
    const errScript = `<script>(function(){
      function show(m){var r=document.getElementById('root');if(r&&!r.childNodes.length){r.innerHTML='<pre style="margin:0;padding:16px;color:#d44;white-space:pre-wrap;font:12px/1.5 system-ui,sans-serif">'+String(m)+'</pre>';}}
      window.addEventListener('error',function(e){show((e.message||e.error||e)+(e.filename?('\\n'+e.filename+(e.lineno?(':'+e.lineno):'')):''));},true);
      window.addEventListener('unhandledrejection',function(e){show('Promise rejection: '+((e.reason&&e.reason.message)||e.reason));});
      setTimeout(function(){show('El componente no renderizo nada (6s).\\nPosibles causas: necesita props, usa contexto/router, o un import no resolvio.');},6000);
    })();</script>`;

    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss}</style>${projectStyle}</head><body><div id="root"></div>${errScript}${twCompiler}<script type="module">${js}</script></body></html>`;
    return { html };
  } catch (e: any) {
    const msg = e?.errors
      ? e.errors.map((x: any) => x.text).join("\n")
      : e?.message ?? String(e);
    return { error: msg };
  }
}
