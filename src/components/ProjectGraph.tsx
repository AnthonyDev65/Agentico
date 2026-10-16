import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { HugeiconsIcon } from "@hugeicons/react";
import { Refresh01Icon, Search01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { onFsChange } from "@/lib/fsEvents";

// Grafo del proyecto (estilo Obsidian) para el estado vacío del editor: un nodo por
// archivo y una arista por cada referencia (import, @import, enlace Markdown, src/href).

type GraphFile = { path: string; rel: string; refs: string[] };
type GNode = SimulationNodeDatum & { id: string; path: string; label: string; deg: number; ext: string };
type GLink = SimulationLinkDatum<GNode> & { source: GNode | string; target: GNode | string };

const RESOLVE_EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".astro", ".css", ".scss", ".md", ".mdx", ".json"];

function normalize(parts: string[]) {
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

// Resuelve una referencia cruda a un archivo del proyecto (o null si es externo).
function resolveRef(spec: string, from: string, files: Set<string>, byStem: Map<string, string>): string | null {
  if (spec.startsWith("[[")) {
    const name = spec.slice(2).trim().toLowerCase();
    return byStem.get(name) ?? byStem.get(name.replace(/\.md$/, "")) ?? null;
  }
  let s = spec.split(/[?#]/)[0];
  try {
    s = decodeURI(s);
  } catch {
    /* tal cual */
  }
  const fromDir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
  let base: string;
  if (s.startsWith("@/") || s.startsWith("~/")) base = normalize(["src", ...s.slice(2).split("/")]);
  else if (s.startsWith("/")) base = normalize(s.slice(1).split("/"));
  else if (s.startsWith(".")) base = normalize([...fromDir.split("/"), ...s.split("/")]);
  else if (/\.(md|mdx|png|jpe?g|svg|css|html?)$/i.test(s) || !/^[@\w]/.test(s)) base = normalize([...fromDir.split("/"), ...s.split("/")]);
  else return null; // paquete npm
  for (const e of RESOLVE_EXTS) if (files.has(base + e)) return base + e;
  for (const e of [".ts", ".tsx", ".js", ".jsx"]) if (files.has(`${base}/index${e}`)) return `${base}/index${e}`;
  // Desde public/ (rutas absolutas de la web)
  if (s.startsWith("/") && files.has(`public/${base}`)) return `public/${base}`;
  return null;
}

function buildGraph(data: GraphFile[]) {
  const files = new Set(data.map((f) => f.rel));
  const byStem = new Map<string, string>();
  for (const f of data) {
    const name = f.rel.split("/").pop()!.toLowerCase();
    byStem.set(name, f.rel);
    byStem.set(name.replace(/\.[^.]+$/, ""), f.rel);
  }
  const nodes = new Map<string, GNode>();
  for (const f of data) {
    const name = f.rel.split("/").pop()!;
    nodes.set(f.rel, {
      id: f.rel,
      path: f.path,
      label: name.replace(/\.(tsx?|jsx?|md|mdx|tasks|design|mmd)$/i, ""),
      deg: 0,
      ext: (name.split(".").pop() ?? "").toLowerCase(),
    });
  }
  const seen = new Set<string>();
  const links: GLink[] = [];
  for (const f of data) {
    for (const r of f.refs) {
      const t = resolveRef(r, f.rel, files, byStem);
      if (!t || t === f.rel) continue;
      const key = f.rel < t ? `${f.rel}|${t}` : `${t}|${f.rel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ source: f.rel, target: t });
      nodes.get(f.rel)!.deg++;
      nodes.get(t)!.deg++;
    }
  }
  return { nodes: [...nodes.values()], links };
}

const radius = (n: GNode) => 3 + Math.sqrt(n.deg) * 1.7;

export default function ProjectGraph({
  projectPath,
  onOpenFile,
}: {
  projectPath: string;
  onOpenFile: (path: string, name: string) => void;
}) {
  const [data, setData] = useState<GraphFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hideOrphans, setHideOrphans] = useState(false);
  const [version, setVersion] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    positions.current = new Map();
  }, [projectPath]);
  useEffect(() => {
    let alive = true;
    invoke<GraphFile[]>("project_graph", { path: projectPath })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [projectPath, version]);

  // Re-analiza al crear/borrar/renombrar archivos o al editar código/docs (agrupado).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const relevant = /\.(tsx?|jsx?|mjs|cjs|vue|svelte|astro|css|scss|sass|less|mdx?|html?|tasks|design)$/i;
    const off = onFsChange(projectPath, (c) => {
      if (!c.structural && !c.files.some((f) => relevant.test(f))) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => setVersion((v) => v + 1), 1000);
    });
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, [projectPath]);

  const graph = useMemo(() => {
    if (!data) return null;
    const g = buildGraph(data);
    if (!hideOrphans) return g;
    return { nodes: g.nodes.filter((n) => n.deg > 0), links: g.links };
  }, [data, hideOrphans]);

  // Estado mutable de la vista (fuera de React para animar a 60 fps)
  const view = useRef({ k: 1, x: 0, y: 0 });
  const hover = useRef<GNode | null>(null);
  const queryRef = useRef("");
  queryRef.current = query.trim().toLowerCase();
  const draw = useRef<() => void>(() => {});
  const positions = useRef(new Map<string, { x: number; y: number }>());

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!graph || !canvas || !wrap) return;
    const ctx = canvas.getContext("2d")!;
    const prev = positions.current;
    const nodes = graph.nodes.map((n) => {
      const p = prev.get(n.id);
      return p ? { ...n, x: p.x, y: p.y } : { ...n };
    });
    const isUpdate = nodes.some((n) => prev.has(n.id));
    const links: GLink[] = graph.links.map((l) => ({ ...l }));
    const neighbors = new Map<string, Set<string>>();
    for (const l of links) {
      const a = l.source as string;
      const b = l.target as string;
      (neighbors.get(a) ?? neighbors.set(a, new Set()).get(a)!).add(b);
      (neighbors.get(b) ?? neighbors.set(b, new Set()).get(b)!).add(a);
    }

    let W = 0;
    let H = 0;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      W = wrap.clientWidth;
      H = wrap.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      draw.current();
    };
    if (!isUpdate) view.current = { k: 1, x: 0, y: 0 };

    const sim: Simulation<GNode, GLink> = forceSimulation(nodes)
      .force("link", forceLink<GNode, GLink>(links).id((d) => d.id).distance(75).strength(0.3))
      .force("charge", forceManyBody().strength(-320).distanceMax(700))
      .force("center", forceCenter(0, 0))
      .force("collide", forceCollide<GNode>((d) => radius(d) + 16))
      // Mantiene a los huérfanos cerca (como el anillo de Obsidian)
      .force("x", forceX(0).strength(0.03))
      .force("y", forceY(0).strength(0.03))
      .alphaDecay(0.03);

    // Al asentarse, encuadra todo el grafo (si el usuario no ha movido la vista).
    let userMoved = isUpdate; // en una actualización se respeta la vista actual
    const fit = () => {
      if (userMoved || !nodes.length || !W) return;
      const xs = nodes.map((n) => n.x!);
      const ys = nodes.map((n) => n.y!);
      const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const k = Math.min(1.6, Math.max(0.2, Math.min((W - 120) / (maxX - minX || 1), (H - 120) / (maxY - minY || 1))));
      view.current = { k, x: -((minX + maxX) / 2) * k, y: -((minY + maxY) / 2) * k };
      draw.current();
    };
    sim.on("end", fit);

    const toScreen = (x: number, y: number) => [W / 2 + view.current.x + x * view.current.k, H / 2 + view.current.y + y * view.current.k];
    const toWorld = (sx: number, sy: number) => [(sx - W / 2 - view.current.x) / view.current.k, (sy - H / 2 - view.current.y) / view.current.k];

    draw.current = () => {
      const { k } = view.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const h = hover.current;
      const hn = h ? neighbors.get(h.id) : null;
      const q = queryRef.current;
      const focused = (n: GNode) => !h || n.id === h.id || !!hn?.has(n.id);

      // Aristas
      ctx.lineWidth = 1;
      for (const l of links) {
        const s = l.source as GNode;
        const t = l.target as GNode;
        const hot = h && (s.id === h.id || t.id === h.id);
        ctx.strokeStyle = hot ? "rgba(129,140,248,0.75)" : h ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.13)";
        const [x1, y1] = toScreen(s.x!, s.y!);
        const [x2, y2] = toScreen(t.x!, t.y!);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      // Nodos + etiquetas
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = `${Math.max(10, Math.min(13, 11 * Math.sqrt(k)))}px "Plus Jakarta Sans Variable", system-ui, sans-serif`;
      for (const n of nodes) {
        const [x, y] = toScreen(n.x!, n.y!);
        if (x < -60 || y < -40 || x > W + 60 || y > H + 40) continue;
        const r = radius(n) * Math.max(0.7, Math.sqrt(k));
        const match = q && (n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
        const dim = (h && !focused(n)) || (q && !match);
        ctx.globalAlpha = dim ? 0.18 : 1;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = h?.id === n.id ? "#818cf8" : hn?.has(n.id) ? "#c7d2fe" : n.deg === 0 ? "#71717a" : "#c4c4cc";
        ctx.fill();
        if (match) {
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        // Etiquetas: todas al acercar; de lejos solo los archivos más conectados.
        const showLabel = k > 1.1 || n.deg >= 6 || (k > 0.75 && n.deg >= 3) || h?.id === n.id || hn?.has(n.id) || match;
        if (showLabel) {
          ctx.fillStyle = h?.id === n.id ? "#e0e7ff" : "#a1a1aa";
          ctx.fillText(n.label, x, y + r + 4);
        }
      }
      ctx.globalAlpha = 1;
    };

    if (isUpdate) sim.alpha(0.25); // ajuste suave, no una re-disposición completa
    sim.on("tick", () => {
      for (const n of nodes) positions.current.set(n.id, { x: n.x!, y: n.y! });
      draw.current();
    });
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    // ── Interacción: hover, arrastrar nodo, pan, zoom, clic = abrir ──
    const pick = (sx: number, sy: number) => {
      const [wx, wy] = toWorld(sx, sy);
      let best: GNode | null = null;
      let bestD = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(n.x! - wx, n.y! - wy);
        const hit = (radius(n) + 6) / Math.max(0.5, Math.sqrt(view.current.k));
        if (d < hit && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    };
    let drag: { node: GNode | null; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null = null;
    const pos = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const onDown = (e: PointerEvent) => {
      const [sx, sy] = pos(e);
      const node = pick(sx, sy);
      drag = { node, sx, sy, vx: view.current.x, vy: view.current.y, moved: false };
      canvas.setPointerCapture(e.pointerId);
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
        sim.alphaTarget(0.2).restart();
      }
    };
    const onMove = (e: PointerEvent) => {
      const [sx, sy] = pos(e);
      if (drag) {
        if (Math.hypot(sx - drag.sx, sy - drag.sy) > 3) drag.moved = true;
        if (drag.node) {
          const [wx, wy] = toWorld(sx, sy);
          drag.node.fx = wx;
          drag.node.fy = wy;
        } else {
          userMoved = true;
          view.current.x = drag.vx + (sx - drag.sx);
          view.current.y = drag.vy + (sy - drag.sy);
          draw.current();
        }
        return;
      }
      const n = pick(sx, sy);
      if (n !== hover.current) {
        hover.current = n;
        canvas.style.cursor = n ? "pointer" : "grab";
        draw.current();
      }
    };
    const onUp = () => {
      if (drag?.node) {
        drag.node.fx = null;
        drag.node.fy = null;
        sim.alphaTarget(0);
        if (!drag.moved) onOpenFile(drag.node.path, drag.node.path.split(/[\\/]/).pop() ?? drag.node.label);
      }
      drag = null;
    };
    const onLeave = () => {
      if (hover.current) {
        hover.current = null;
        draw.current();
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userMoved = true;
      const [sx, sy] = pos(e);
      const v = view.current;
      const k = Math.min(4, Math.max(0.2, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      // Zoom hacia el puntero
      const px = sx - W / 2;
      const py = sy - H / 2;
      v.x = px - ((px - v.x) * k) / v.k;
      v.y = py - ((py - v.y) * k) / v.k;
      v.k = k;
      draw.current();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      sim.stop();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // Redibuja al buscar
  useEffect(() => draw.current(), [query]);

  const nLinks = graph?.links.length ?? 0;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-[#161616]">
      <canvas ref={canvasRef} className="absolute inset-0 cursor-grab" />

      {/* Controles */}
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-[#1c1c1e]/90 px-2 backdrop-blur">
          <HugeiconsIcon icon={Search01Icon} size={12} className="text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar archivo…"
            className="h-7 w-40 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 bg-[#1c1c1e]/90 px-2 py-1 text-[11px] text-zinc-400 backdrop-blur">
          <input type="checkbox" checked={hideOrphans} onChange={(e) => setHideOrphans(e.target.checked)} className="accent-indigo-500" />
          Solo conectados
        </label>
        <button
          type="button"
          onClick={() => setVersion((v) => v + 1)}
          title="Volver a analizar el proyecto"
          className="flex size-7 items-center justify-center rounded-lg border border-zinc-800 bg-[#1c1c1e]/90 text-zinc-400 hover:text-zinc-100"
        >
          <HugeiconsIcon icon={Refresh01Icon} size={13} />
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-zinc-600">
        {graph ? `${graph.nodes.length} archivos · ${nLinks} conexiones` : ""}
        <span className="ml-2 text-zinc-700">Clic en un nodo para abrirlo · arrastra para mover · rueda para zoom</span>
      </div>

      {(!data || error) && (
        <div className={cn("absolute inset-0 flex items-center justify-center text-sm", error ? "text-red-400" : "text-zinc-600")}>
          {error ? (
            `No se pudo analizar el proyecto: ${error}`
          ) : (
            <span className="flex items-center gap-2">
              <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin" /> Analizando el proyecto…
            </span>
          )}
        </div>
      )}
      {data && graph && graph.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-600">Selecciona un archivo del árbol</div>
      )}
    </div>
  );
}
