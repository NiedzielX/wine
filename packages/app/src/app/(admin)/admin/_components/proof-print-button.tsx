'use client';

import { Button } from '@wine-match/ui';
import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/**
 * Opens the browser's print dialog (spec 2026-11-18-owner-proof-report, R13). It exists only when a script runs (server and
 * hydration render nothing): without JavaScript a button that does nothing would mislead, and the page always says "Ctrl/Cmd+P".
 */
export function ProofPrintButton({ children }: { children: React.ReactNode }) {
  const hasScript = useSyncExternalStore(noop, () => true, () => false);
  if (!hasScript) return null;
  return <Button type="button" data-print-button onClick={() => window.print()}>{children}</Button>;
}
