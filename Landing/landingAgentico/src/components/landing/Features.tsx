import { Container, Reveal, SectionHeading } from './ui';
import { features } from './data';

export function Features() {
  return (
    <section id="caracteristicas" className="scroll-mt-20 py-24 sm:py-32">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Características"
            title="Todo tu flujo de trabajo, en un solo editor"
            description="AurCode reúne la IA, el preview y el despliegue en una experiencia nativa. Menos ventanas, más código enviado."
          />
        </Reveal>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <Reveal key={feature.title} delay={(i % 3) * 0.08}>
                <article className="group relative h-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-900/70">
                  {/* hover glow */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-white/0 blur-2xl transition-colors duration-300 group-hover:bg-white/10"
                  />
                  <span className="inline-flex size-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/60 text-zinc-200 transition-colors group-hover:border-zinc-600 group-hover:text-white">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-base font-semibold text-zinc-100">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {feature.description}
                  </p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
