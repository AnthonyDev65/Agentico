import { Download, Sparkles } from 'lucide-react';
import { Container, Reveal } from './ui';

export function CtaFinal() {
  return (
    <section className="py-24 sm:py-32">
      <Container>
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-16 text-center sm:px-16 sm:py-20">
            {/* glows */}
            <div
              aria-hidden
              className="pointer-events-none absolute -left-10 -top-10 size-64 rounded-full bg-white/10 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-16 -right-10 size-72 rounded-full bg-white/5 blur-3xl"
            />
            {/* grid */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff14_1px,transparent_1px),linear-gradient(to_bottom,#ffffff14_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000,transparent)]"
            />

            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                <Sparkles className="size-3.5" />
                Impulsado por Claude
              </span>
              <h2 className="mx-auto mt-6 max-w-2xl text-balance text-3xl font-extrabold text-white sm:text-5xl">
                Empieza a construir a la velocidad del pensamiento
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-zinc-400 sm:text-lg">
                Descarga AurCode gratis y conecta tu suscripción de Claude. Sin tarjeta,
                sin fricción.
              </p>
              <div className="mt-9 flex justify-center">
                <a
                  href="#"
                  className="group inline-flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-4 text-sm font-bold text-black shadow-xl shadow-black/30 transition-all hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                >
                  <Download className="size-4 transition-transform group-hover:-translate-y-0.5" />
                  Descargar gratis
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
