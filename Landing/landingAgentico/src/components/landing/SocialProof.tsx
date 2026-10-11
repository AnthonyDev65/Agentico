import { Container, Reveal } from './ui';

const logos = ['Vercel', 'Linear', 'Supabase', 'Raycast', 'Resend', 'Clerk'];

export function SocialProof() {
  return (
    <section className="border-y border-zinc-900 bg-zinc-950/30 py-12">
      <Container>
        <Reveal>
          <p className="text-center text-sm font-medium text-zinc-500">
            Hecho para developers que envían rápido
          </p>
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {logos.map((logo) => (
              <li
                key={logo}
                className="text-lg font-semibold tracking-tight text-zinc-600 grayscale transition-colors hover:text-zinc-400"
              >
                {logo}
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
