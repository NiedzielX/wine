import type { ReactNode } from 'react';

/** The one way a screen says that something went wrong. Announced to assistive technology (role="alert"). */
export function ErrorMessage({ title = 'Something went wrong', message, action }: { title?: string; message?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="grid justify-items-center gap-3 py-24 text-center">
      <h1 className="font-serif text-3xl">{title}</h1>
      {message && <p className="max-w-md text-muted-foreground">{message}</p>}
      {action}
    </div>
  );
}
