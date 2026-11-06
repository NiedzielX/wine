'use client';

import { Button } from '@wine-match/ui';
import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/**
 * Opens the browser's print dialog. It exists only when a script runs (server and hydration render nothing), because without
 * JavaScript a button that does nothing would mislead: the page always says "Ctrl/Cmd+P" next to it.
 */
export function PrintButton({ children }: { children: React.ReactNode }) {
  const hasScript = useSyncExternalStore(noop, () => true, () => false);
  if (!hasScript) return null;
  return <Button type="button" data-print-button onClick={() => window.print()}>{children}</Button>;
}
