// Marca tipo "sunburst" de Claude/Anthropic en su naranja característico.
// Placeholder vectorial — sustituible por el asset oficial cuando quieras.
export function ClaudeLogo({ className }: { className?: string }) {
  const cx = 12;
  const cy = 12;
  const inner = 2.6;
  const outer = 9;
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6; // cada 30°
    const c = Math.cos(a);
    const s = Math.sin(a);
    return {
      x1: cx + inner * c,
      y1: cy + inner * s,
      x2: cx + outer * c,
      y2: cy + outer * s,
    };
  });

  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Claude" role="img">
      <g stroke="#D97757" strokeWidth="1.8" strokeLinecap="round">
        {rays.map((r, i) => (
          <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
        ))}
      </g>
    </svg>
  );
}
