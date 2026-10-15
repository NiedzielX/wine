'use client';

import { Button } from '@wine-match/ui';

/** Opens the browser's print dialog (a client component only for window.print). */
export function PrintButton({ children }: { children: React.ReactNode }) {
  return <Button type="button" onClick={() => window.print()}>{children}</Button>;
}
