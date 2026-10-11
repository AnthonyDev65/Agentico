import { Check } from 'lucide-react';
import { Container, Reveal, SectionHeading, cx } from './ui';
import { plans } from './data';

export function Pricing() {
  return (
    <section id="precios" className="scroll-mt-20 py-24 sm:py-32">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Precios"
            title="Empieza gratis, escala cuando quieras"
            description="La IA la pagas con tu propia suscripción de Claude. Nuestros planes solo desbloquean funciones del IDE."
          />
        </Reveal>

        <div className="mt-16 grid items-stretch gap-6 lg:grid-cols-3">
          {plans.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.1} className="h-full">
              <article
                className={cx(
                  'relative flex h-full flex-col rounded-2xl border p-7 transition-all duration-300',
                  plan.highlighted
                    ? 'border-white/40 bg-zinc-900/70 shadow-2xl shadow-black/50'
                    : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
                )}
              >
                {plan.highlighted && (
                  <>
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -inset-px -z-10 rounded-2xl bg-gradient-to-b from-white/20 to-transparent blur-sm"
                    />
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-black shadow-lg shadow-black/40">
                      Más popular
                    </span>
                  </>
                )}

                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  {plan.name}
                </h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-zinc-100">
                    {plan.price}
                  </span>
                  <span className="text-sm text-zinc-500">{plan.period}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  {plan.description}
                </p>

                <ul className="mt-6 space-y-3 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-zinc-300">
                      <span
                        className={cx(
                          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
                          plan.highlighted
                            ? 'bg-white/15 text-white'
                            : 'bg-zinc-800 text-zinc-400',
                        )}
                      >
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <a
                  href="#"
                  className={cx(
                    'mt-8 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]',
                    plan.highlighted
                      ? 'bg-white text-black shadow-lg shadow-black/30 hover:bg-zinc-200 focus-visible:ring-white'
                      : 'border border-zinc-700 bg-zinc-950/40 text-zinc-100 hover:border-zinc-600 hover:bg-zinc-800/60 focus-visible:ring-zinc-500',
                  )}
                >
                  {plan.cta}
                </a>
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
