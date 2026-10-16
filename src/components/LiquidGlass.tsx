import { useEffect, useId, useMemo, useRef, useState } from "react";

// «Liquid glass» al estilo iOS 26: el fondo se desenfoca y, en una franja junto al borde,
// se REFRACTA (se curva hacia dentro como a través del canto de un cristal). La refracción
// es un filtro SVG feDisplacementMap aplicado con backdrop-filter (Chromium / WebView2),
// con un mapa de desplazamiento generado para el tamaño y radio exactos del elemento.
// Encima, un brillo especular en el borde (más intenso arriba-izquierda y abajo-derecha).

type Props = {
  radius: number;
  /** Ancho de la franja que refracta, en px. */
  bezel?: number;
  /** Intensidad del desplazamiento, en px. */
  refraction?: number;
  blur?: number;
  className?: string;
  /** Clases del contenedor del contenido (p. ej. flex para el dock). */
  contentClassName?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  innerRef?: React.Ref<HTMLDivElement>;
};

// Distancia con signo a un rectángulo redondeado centrado (negativa dentro).
function sdRoundRect(px: number, py: number, hw: number, hh: number, r: number) {
  const qx = Math.abs(px) - (hw - r);
  const qy = Math.abs(py) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

// Mapa de desplazamiento: R = x, G = y (128 = sin desplazamiento). Junto al borde los
// píxeles toman el fondo de más adentro, con una caída suave (como una lente convexa).
function displacementMap(w: number, h: number, r: number, bezel: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return "";
  const img = g.createImageData(w, h);
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.min(r, hw, hh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hw;
      const py = y + 0.5 - hh;
      const d = -sdRoundRect(px, py, hw, hh, rr); // distancia al borde, hacia dentro
      let dx = 0;
      let dy = 0;
      if (d >= 0 && d < bezel) {
        // Normal hacia fuera (gradiente de la SDF) → desplazamos hacia dentro.
        const e = 0.5;
        const nx = sdRoundRect(px + e, py, hw, hh, rr) - sdRoundRect(px - e, py, hw, hh, rr);
        const ny = sdRoundRect(px, py + e, hw, hh, rr) - sdRoundRect(px, py - e, hw, hh, rr);
        const len = Math.hypot(nx, ny) || 1;
        const t = 1 - d / bezel;
        const k = t * t * (3 - 2 * t); // smoothstep: fuerte en el canto, nulo hacia dentro
        dx = (-nx / len) * k;
        dy = (-ny / len) * k;
      }
      const i = (y * w + x) * 4;
      img.data[i] = Math.round(128 + dx * 127);
      img.data[i + 1] = Math.round(128 + dy * 127);
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

export default function LiquidGlass({
  radius,
  bezel = 14,
  refraction = 26,
  blur = 6,
  className,
  contentClassName,
  style,
  children,
  innerRef,
}: Props) {
  const id = "lg" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const map = useMemo(
    () => (size.w > 0 && size.h > 0 ? displacementMap(size.w, size.h, radius, bezel) : ""),
    [size.w, size.h, radius, bezel],
  );

  const setRefs = (el: HTMLDivElement | null) => {
    boxRef.current = el;
    if (typeof innerRef === "function") innerRef(el);
    else if (innerRef) (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  return (
    <div
      ref={setRefs}
      className={className}
      style={{
        position: "relative",
        borderRadius: radius,
        isolation: "isolate",
        background: "rgba(255,255,255,0.06)",
        // Refracción en el borde + desenfoque + algo más de saturación, todo en el filtro SVG.
        backdropFilter: map ? `url(#${id})` : `blur(${blur}px) saturate(1.6)`,
        WebkitBackdropFilter: `blur(${blur}px) saturate(1.6)`,
        boxShadow: "0 10px 30px rgba(0,0,0,.28), inset 0 0 0 0.5px rgba(255,255,255,.18)",
        ...style,
      }}
    >
      {map && (
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
          <filter id={id} x="0" y="0" width={size.w} height={size.h} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feImage href={map} x="0" y="0" width={size.w} height={size.h} result="map" preserveAspectRatio="none" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={refraction} xChannelSelector="R" yChannelSelector="G" result="bent" />
            <feGaussianBlur in="bent" stdDeviation={blur} result="soft" />
            <feColorMatrix in="soft" type="saturate" values="1.6" />
          </filter>
        </svg>
      )}
      {/* Brillo especular del canto: borde fino con degradado (más luz arriba-izq. y abajo-der.). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: radius,
          padding: 1.2,
          background:
            "linear-gradient(135deg, rgba(255,255,255,.75) 0%, rgba(255,255,255,.18) 22%, rgba(255,255,255,.04) 50%, rgba(255,255,255,.16) 78%, rgba(255,255,255,.6) 100%)",
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          maskComposite: "exclude",
        }}
      />
      {/* Reflejo interior suave en la mitad superior. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: radius,
          background: "linear-gradient(180deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,0) 45%)",
        }}
      />
      <div className={contentClassName} style={{ position: "relative", height: "100%" }}>
        {children}
      </div>
    </div>
  );
}
