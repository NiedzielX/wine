import type { ReactNode } from 'react';

/**
 * The one way a screen says that something went wrong. Announced to assistive technology (role="alert").
 * `compact`: for one section of a page that still renders the rest — an `h2` heading and less padding.
 */
export function ErrorMessage({ title = 'Something went wrong', message, action, compact = false }: { title?: string; message?: ReactNode; action?: ReactNode; compact?: boolean }) {
  const Heading = compact ? 'h2' : 'h1';
  return (
    <div role="alert" className={`grid justify-items-center gap-3 text-center ${compact ? 'py-8' : 'py-24'}`}>
      <Heading className={`font-serif ${compact ? 'text-xl' : 'text-3xl'}`}>{title}</Heading>
      {message && <p className="max-w-md text-muted-foreground">{message}</p>}
      {action}
    </div>
  );
}
