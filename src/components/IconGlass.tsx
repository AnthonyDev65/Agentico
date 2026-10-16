import { useId } from "react";
import { squirclePath } from "@/lib/squircle";

// Canto de cristal de los iconos (iOS 26): un trazo fino con la MISMA forma squircle del
// icono, con luz arriba-izquierda y abajo-derecha, más un halo interior suave. Se coloca
// encima del icono (que ya va recortado con clip-path, así que solo se ve la mitad interior
// del trazo). Requiere que el contenedor tenga position: relative.
export default function IconGlass({ size, radius }: { size: number; radius: number }) {
  const id = "ig" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const d = squirclePath(size, size, radius, 0.6);
  const w = Math.max(1, size / 34); // grosor del canto, proporcional al icono
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      <defs>
        <linearGradient id={`${id}e`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".85" />
          <stop offset=".28" stopColor="#fff" stopOpacity=".22" />
          <stop offset=".55" stopColor="#fff" stopOpacity=".06" />
          <stop offset=".8" stopColor="#fff" stopOpacity=".2" />
          <stop offset="1" stopColor="#fff" stopOpacity=".7" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".18" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}b`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={w * 1.2} />
        </filter>
      </defs>
      {/* Reflejo suave en la mitad superior */}
      <path d={d} fill={`url(#${id}s)`} />
      {/* Halo interior difuso junto al borde */}
      <path d={d} fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth={w * 5} filter={`url(#${id}b)`} />
      {/* Canto especular */}
      <path d={d} fill="none" stroke={`url(#${id}e)`} strokeWidth={w * 2} />
    </svg>
  );
}
