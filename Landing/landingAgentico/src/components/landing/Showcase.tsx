import { Check } from 'lucide-react';
import { Container, Reveal, cx } from './ui';
import { showcases } from './data';
import { ShowcaseMockup } from './Mockups';

export function Showcase() {
  return (
    <section className="py-24 sm:py-32">
      <Container>
        <div className="space-y-24 sm:space-y-32">
          {showcases.map((item, i) => {
            const flipped = i % 2 === 1;
            return (
              <div
                key={item.title}
                className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
              >
                {/* Copy */}
                <Reveal
                  className={cx(flipped && 'lg:order-2')}
                  y={20}
                >
                  <span className="text-sm font-semibold uppercase tracking-[0.15em] text-zinc-400">
                    {item.eyebrow}
                  </span>
                  <h3 className="mt-3 text-2xl font-bold text-zinc-100 sm:text-3xl">
                    {item.title}
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-zinc-400">
                    {item.description}
                  </p>
                  <ul className="mt-6 space-y-3">
                    {item.points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-sm text-zinc-300">
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-zinc-100">
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </Reveal>

                {/* Mockup */}
                <Reveal
                  className={cx('relative', flipped && 'lg:order-1')}
                  delay={0.1}
                  y={20}
                >
                  <div
                    aria-hidden
                    className={cx(
                      'pointer-events-none absolute -z-10 h-64 w-64 rounded-full bg-white/10 blur-[100px]',
                      flipped ? '-left-10 top-1/4' : '-right-10 top-1/4',
                    )}
                  />
                  <ShowcaseMockup variant={item.variant} />
                </Reveal>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
