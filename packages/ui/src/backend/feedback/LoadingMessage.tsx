import { Skeleton } from '../../components/skeleton';

/** The one loading state: a skeleton of a page (a title, a few cards, a table), not a spinner. Announced politely. */
export function LoadingMessage({ cards = 4, label = 'Loading' }: { cards?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      {cards > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: cards }, (_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      )}
      <Skeleton className="mt-6 h-72" />
    </div>
  );
}
