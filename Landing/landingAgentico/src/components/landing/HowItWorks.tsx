import { FolderOpen, MessageSquare, Rocket } from 'lucide-react';
import { Container, Reveal, SectionHeading } from './ui';
import { steps } from './data';

const icons = [FolderOpen, MessageSquare, Rocket];

export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className="scroll-mt-20 border-y border-zinc-900 bg-zinc-950/30 py-24 sm:py-32"
    >
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Cómo funciona"
            title="De la idea a producción en tres pasos"
            description="Sin configuraciones interminables. Abre, pide y despliega."
          />
        </Reveal>

        <div className="relative mt-16 grid gap-8 md:grid-cols-3">
          {/* connecting line (desktop) */}
          <div
            aria-hidden
            className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent md:block"
          />

          {steps.map((step, i) => {
            const Icon = icons[i];
            return (
              <Reveal key={step.number} delay={i * 0.12} className="relative">
                <div className="flex flex-col items-center text-center">
                  <span className="relative grid size-14 place-items-center rounded-2xl border border-zinc-800 bg-[#121212] text-zinc-100 shadow-lg shadow-black/40">
                    <Icon className="size-6" />
                    <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-white text-[10px] font-bold text-black">
                      {step.number.replace('0', '')}
                    </span>
                  </span>
                  <h3 className="mt-6 text-lg font-semibold text-zinc-100">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-zinc-400">
                    {step.description}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
