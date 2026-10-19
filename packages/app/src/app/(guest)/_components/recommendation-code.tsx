import type { Dictionary } from '@/i18n/en';

/** The texts around a code: the guest's on G8 (default), the waiter's on G11. */
export interface CodeLabels {
  title: string;
  hint: string;
  /** what a screen reader says: the characters one by one */
  spoken: (code: string) => string;
  unavailable: string;
}

/**
 * The recommendation code on G8 (spec 2026-10-16-recommendation-code, UI/UX) and, `compact`, next to the bottle on the
 * waiter's whole-table screen G11 (spec 2026-10-16-whole-table-waiter-path, R6, Q10) with the waiter's own `labels`.
 * Server component, no logic: the page issues the code. The characters are shown large and hidden from screen readers,
 * which read them one by one from an `sr-only` text instead (`aria-label` on a plain element is not read reliably).
 * Without a code — the session reached its limit, the write failed, the request was not a guest's — one quiet line says
 * so, and the rest of the screen is unchanged.
 */
export function CodeForWaiter({ code, t, labels = t.guest.selected.code, compact = false }: { code: string | null; t: Dictionary; labels?: CodeLabels; compact?: boolean }) {
  const l = labels;
  if (!code) return <p data-recommendation-code="none" className={compact ? 'text-small text-ink-2' : 'text-body text-ink-2'}>{l.unavailable}</p>;
  if (compact) {
    return (
      <section data-recommendation-code={code} aria-labelledby="recommendation-code-title" className="grid justify-items-center gap-0.5 rounded-xl border border-dashed border-[#d4ccd0] px-3 py-2">
        <h2 id="recommendation-code-title" className="text-small font-semibold text-ink-2">{l.title}</h2>
        <p className="m-0">
          <span aria-hidden="true" className="font-serif text-h1 leading-none tracking-[0.14em] tabular-nums">{code}</span>
          <span className="sr-only">{l.spoken(code)}</span>
        </p>
      </section>
    );
  }
  return (
    <section data-recommendation-code={code} aria-labelledby="recommendation-code-title" className="grid w-full justify-items-center gap-1.5 rounded-2xl border border-dashed border-[#d4ccd0] px-5 py-4">
      <h2 id="recommendation-code-title" className="text-small font-semibold text-ink-2">{l.title}</h2>
      <p className="m-0">
        <span aria-hidden="true" className="font-serif text-display leading-none tracking-[0.18em] tabular-nums">{code}</span>
        <span className="sr-only">{l.spoken(code)}</span>
      </p>
      <p className="text-body text-ink-2">{l.hint}</p>
    </section>
  );
}
