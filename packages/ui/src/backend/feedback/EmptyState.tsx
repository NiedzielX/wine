import type { ReactNode } from 'react';

/** The one way a list or a screen says "there is nothing here (yet)". Say what is missing and what to do next. */
export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-6 py-14 text-center">
      <h2 className="font-serif text-2xl">{title}</h2>
      {description && <p className="max-w-prose text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
