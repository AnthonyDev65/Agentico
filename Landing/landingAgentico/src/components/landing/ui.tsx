import type { CSSProperties, ReactNode } from 'react';

/** Merge class names without pulling in a dependency. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

/** Centered, max-width wrapper used by every section. */
export function Container({ children, className }: ContainerProps) {
  return (
    <div className={cx('mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8', className)}>
      {children}
    </div>
  );
}

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Delay in seconds for staggered entrances. */
  delay?: number;
  /** Direction the element slides in from. */
  y?: number;
}

/**
 * Subtle fade + slide-in, revealed on scroll.
 *
 * Implemented with CSS (see `.reveal` in global.css) and driven by a small
 * vanilla script in the layout, so visibility never depends on React
 * hydration — if JS fails, the content is simply shown. `delay` and `y` are
 * passed through as CSS custom properties.
 */
export function Reveal({ children, className, delay = 0, y = 16 }: RevealProps) {
  const style = {
    ...(delay ? { '--reveal-delay': `${delay}s` } : {}),
    ...(y !== 16 ? { '--reveal-y': `${y}px` } : {}),
  } as CSSProperties;

  return (
    <div className={cx('reveal', className)} style={style}>
      {children}
    </div>
  );
}

interface SectionHeadingProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}

/** Eyebrow + title + description block, centered. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cx('mx-auto max-w-2xl text-center', className)}>
      {eyebrow && (
        <span className="inline-block text-sm font-semibold uppercase tracking-[0.15em] text-zinc-400">
          {eyebrow}
        </span>
      )}
      <h2 className="mt-3 text-balance text-3xl font-bold text-zinc-100 sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
          {description}
        </p>
      )}
    </div>
  );
}

/** Small pill badge, e.g. "Impulsado por Claude". */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-1 text-xs font-medium text-zinc-300 backdrop-blur">
      {children}
    </span>
  );
}
