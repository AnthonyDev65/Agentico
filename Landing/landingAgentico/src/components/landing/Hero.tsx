import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import { Container, Badge } from './ui';
import { HeroMockup } from './Mockups';

/** Build a staggered reveal style from a delay in seconds. */
const delay = (s: number): CSSProperties =>
  ({ '--reveal-delay': `${s}s` }) as CSSProperties;

export function Hero() {
  return (
    <section id="inicio" className="relative isolate overflow-hidden pt-24 sm:pt-28">
      {/* Radial glow (neutro) */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-10%] z-0 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-white/10 blur-[120px]"
      />
      {/* Interactive dot field — dots illuminate near the cursor */}
      <DotField />

      <Container className="relative z-10">
        <div className="mx-auto max-w-3xl text-center">
          <div className="reveal flex justify-center">
            <Badge>
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px] shadow-emerald-500/50"
              />
              Impulsado por Claude
            </Badge>
          </div>

          <h1
            className="reveal mt-5 text-4xl font-extrabold leading-[1.1] text-zinc-100 sm:text-5xl"
            style={delay(0.08)}
          >
            Tu IDE con IA — construye
            <br />
            a la{' '}
            <span className="bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
              velocidad del pensamiento
            </span>
          </h1>

          <p
            className="reveal mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-zinc-400"
            style={delay(0.16)}
          >
            AurCode embebe a Claude en tu editor de escritorio. Usa tu propia suscripción
            para construir, previsualizar y desplegar sin cambiar de ventana.
          </p>
        </div>
      </Container>

      {/* Hero mockup (más ancho que el contenido, para que destaque) */}
      <div className="relative z-10 mx-auto mt-10 w-full max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="reveal relative" style={delay(0.4)}>
          <BorderBeam />
          <div className="relative rounded-xl">
            <HeroMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * A grid of dots painted on a canvas. Each dot brightens and grows as the
 * cursor approaches, producing a soft "light-up" field behind the hero.
 * Falls back to a static, dim grid when the user prefers reduced motion.
 */
function DotField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    const GAP = 28; // px between dots
    const RADIUS = 190; // cursor influence radius
    const BASE = 1.1; // base dot radius
    const MAX = 3.4; // max dot radius under the cursor

    let width = 0;
    let height = 0;
    let dpr = 1;
    // Target (raw) and smoothed cursor position. Starts off-screen.
    const pointer = { x: -9999, y: -9999, sx: -9999, sy: -9999 };
    let raf = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      // Ease the smoothed pointer toward its target for fluid motion.
      pointer.sx += (pointer.x - pointer.sx) * 0.15;
      pointer.sy += (pointer.y - pointer.sy) * 0.15;

      ctx.clearRect(0, 0, width, height);

      for (let y = GAP / 2; y < height; y += GAP) {
        for (let x = GAP / 2; x < width; x += GAP) {
          const dx = x - pointer.sx;
          const dy = y - pointer.sy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // 0 far away → 1 directly under the cursor.
          const t = Math.max(0, 1 - dist / RADIUS);
          const ease = t * t;

          const r = BASE + (MAX - BASE) * ease;
          // Visible slate when idle, bright white glow when lit.
          const opacity = 0.3 + 0.7 * ease;

          if (ease > 0.02) {
            ctx.shadowColor = 'rgba(255, 255, 255, 0.95)';
            ctx.shadowBlur = 16 * ease;
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
          } else {
            ctx.shadowBlur = 0;
            ctx.fillStyle = `rgba(180, 180, 190, ${opacity})`;
          }

          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.shadowBlur = 0;

      if (!reduced) raf = window.requestAnimationFrame(draw);
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };

    resize();
    window.addEventListener('resize', resize);

    if (reduced) {
      draw(); // single static frame
    } else {
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerleave', onLeave);
      raf = window.requestAnimationFrame(draw);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  const mask = 'radial-gradient(ellipse 120% 100% at 50% 28%, #000 78%, transparent 100%)';
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    />
  );
}

/** Rotating conic gradient "border beam" framing the hero card (pure CSS). */
function BorderBeam() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -inset-px overflow-hidden rounded-xl"
    >
      <div
        className="border-beam absolute left-1/2 top-1/2 aspect-square w-[140%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0deg, transparent 300deg, #ffffff 340deg, #a1a1aa 360deg)',
          animation: 'beam-spin 6s linear infinite',
          opacity: 0.6,
        }}
      />
    </div>
  );
}
