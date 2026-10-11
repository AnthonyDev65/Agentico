import { useEffect, useState } from 'react';
import { Menu, X, Command } from 'lucide-react';
import { navLinks } from './data';
import { Container, cx } from './ui';

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cx(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled
          ? 'border-b border-zinc-800/80 bg-[#121212]/80 backdrop-blur-xl'
          : 'border-b border-transparent',
      )}
    >
      <Container>
        <nav className="flex h-16 items-center justify-between" aria-label="Principal">
          {/* Logo */}
          <a
            href="#inicio"
            className="group flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-white shadow-lg shadow-black/30">
              <Command className="size-4 text-black" strokeWidth={2.5} />
            </span>
            <span className="text-[15px] font-bold tracking-tight text-zinc-100">
              Agentico
            </span>
          </a>

          {/* Desktop links */}
          <ul className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          {/* Desktop actions */}
          <div className="hidden items-center gap-2 md:flex">
            <a
              href="#"
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
            >
              Iniciar sesión
            </a>
            <a
              href="#precios"
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg shadow-black/30 transition-all hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
            >
              Descargar
            </a>
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid size-10 place-items-center rounded-lg text-zinc-300 transition-colors hover:bg-zinc-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 md:hidden"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </nav>
      </Container>

      {/* Mobile panel */}
      {open && (
        <div className="border-t border-zinc-800/80 bg-[#121212]/95 backdrop-blur-xl md:hidden">
          <Container>
            <ul className="flex flex-col py-3">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800/60 hover:text-zinc-100"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 pb-4">
              <a
                href="#"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-zinc-800 px-4 py-2.5 text-center text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800/60"
              >
                Iniciar sesión
              </a>
              <a
                href="#precios"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-white px-4 py-2.5 text-center text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
              >
                Descargar
              </a>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
