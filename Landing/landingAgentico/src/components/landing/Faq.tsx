import { ChevronDown } from 'lucide-react';
import { Container, Reveal, SectionHeading } from './ui';
import { faqs } from './data';

export function Faq() {
  return (
    <section
      id="faq"
      className="scroll-mt-20 border-t border-zinc-900 bg-zinc-950/30 py-24 sm:py-32"
    >
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="FAQ"
            title="Preguntas frecuentes"
            description="¿Algo más? Escríbenos y te respondemos en menos de 24 horas."
          />
        </Reveal>

        <div className="mx-auto mt-14 max-w-3xl">
          <div className="divide-y divide-zinc-800 border-y border-zinc-800">
            {faqs.map((faq, i) => (
              <details
                key={faq.question}
                className="group"
                open={i === 0}
                name="faq"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 [&::-webkit-details-marker]:hidden">
                  <span className="text-base font-medium text-zinc-100">
                    {faq.question}
                  </span>
                  <ChevronDown className="size-5 shrink-0 text-zinc-500 transition-transform duration-300 group-open:rotate-180 group-open:text-zinc-200" />
                </summary>
                <p className="pb-5 pr-10 text-sm leading-relaxed text-zinc-400">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
