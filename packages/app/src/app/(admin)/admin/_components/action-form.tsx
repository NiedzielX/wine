import { Button } from '@wine-match/ui';
import type { ComponentProps, ReactNode } from 'react';

type Action = (formData: FormData) => void | Promise<void>;

/** A button that posts a server action with hidden fields. Works without JavaScript. */
export function ActionButton({ action, fields, children, variant = 'outline', size = 'sm', disabled, title }: {
  action: Action;
  fields: Record<string, string | number | undefined | null>;
  children: ReactNode;
  variant?: ComponentProps<typeof Button>['variant'];
  size?: ComponentProps<typeof Button>['size'];
  disabled?: boolean;
  title?: string;
}) {
  return (
    <form action={action} className="inline-flex">
      <Hidden fields={fields} />
      <Button type="submit" variant={variant} size={size} disabled={disabled} title={title}>{children}</Button>
    </form>
  );
}

export function Hidden({ fields }: { fields: Record<string, string | number | undefined | null> }) {
  return <>{Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v ?? ''} />)}</>;
}
