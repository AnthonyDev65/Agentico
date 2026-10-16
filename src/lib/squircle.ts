// Esquinas suavizadas como el «corner smoothing» de Figma (squircle tipo iOS): la curva
// empieza antes en cada lado ((1 + smoothing) · radio) y entra en el arco con dos Bézier.
// Devuelve un trazado SVG para `clip-path: path(...)`. Con el mismo número de comandos
// sea cual sea el radio, así CSS puede animar entre dos formas (p. ej. radio → 0).

function cornerParams(radius: number, smoothing: number, budget: number) {
  const r = Math.min(radius, budget);
  let s = smoothing;
  let p = (1 + s) * r;
  if (p > budget && r > 0) {
    // No cabe todo el suavizado: se reduce (como Figma sin «preserve smoothing»).
    s = Math.max(0, Math.min(s, budget / r - 1));
    p = Math.min(p, budget);
  }
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const arcMeasure = 90 * (1 - s);
  const arc = Math.sin(rad(arcMeasure / 2)) * r * Math.SQRT2;
  const alpha = (90 - arcMeasure) / 2;
  const p3p4 = r * Math.tan(rad(alpha / 2));
  const beta = 45 * s;
  const c = p3p4 * Math.cos(rad(beta));
  const d = c * Math.tan(rad(beta));
  const b = (p - arc - c - d) / 3;
  const a = 2 * b;
  return { a, b, c, d, p, arc, r };
}

const n = (v: number) => Number(v.toFixed(3));

export function squirclePath(width: number, height: number, radius: number, smoothing = 0.6) {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const { a, b, c, d, p, arc, r } = cornerParams(Math.max(0, radius), smoothing, Math.min(w, h) / 2);
  const abc = a + b + c;
  return [
    `M ${n(w - p)} 0`,
    `c ${n(a)} 0 ${n(a + b)} 0 ${n(abc)} ${n(d)}`,
    `a ${n(r)} ${n(r)} 0 0 1 ${n(arc)} ${n(arc)}`,
    `c ${n(d)} ${n(c)} ${n(d)} ${n(b + c)} ${n(d)} ${n(abc)}`,
    `L ${n(w)} ${n(h - p)}`,
    `c 0 ${n(a)} 0 ${n(a + b)} ${n(-d)} ${n(abc)}`,
    `a ${n(r)} ${n(r)} 0 0 1 ${n(-arc)} ${n(arc)}`,
    `c ${n(-c)} ${n(d)} ${n(-(b + c))} ${n(d)} ${n(-abc)} ${n(d)}`,
    `L ${n(p)} ${n(h)}`,
    `c ${n(-a)} 0 ${n(-(a + b))} 0 ${n(-abc)} ${n(-d)}`,
    `a ${n(r)} ${n(r)} 0 0 1 ${n(-arc)} ${n(-arc)}`,
    `c ${n(-d)} ${n(-c)} ${n(-d)} ${n(-(b + c))} ${n(-d)} ${n(-abc)}`,
    `L 0 ${n(p)}`,
    `c 0 ${n(-a)} 0 ${n(-(a + b))} ${n(d)} ${n(-abc)}`,
    `a ${n(r)} ${n(r)} 0 0 1 ${n(arc)} ${n(-arc)}`,
    `c ${n(c)} ${n(-d)} ${n(b + c)} ${n(-d)} ${n(abc)} ${n(-d)}`,
    "Z",
  ].join(" ");
}

/** `clip-path` listo para usar. */
export const squircleClip = (width: number, height: number, radius: number, smoothing = 0.6) =>
  `path('${squirclePath(width, height, radius, smoothing)}')`;
