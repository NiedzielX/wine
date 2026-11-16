import type { Locale } from '@wine-match/core';
import type { Dictionary } from '@/i18n/en';

/**
 * The strip on every guest page of a demo instance. Two variants, both with a link that carries `lang` and nothing else (no session id,
 * no preferences: a visit to the guide is not a guest session):
 * - `guide` (spec 2026-11-04-sales-demo-and-roi-calculator, Q3, R6): the public read-only demo, the data are invented, a link back to the guide;
 * - `start` (spec 2026-11-16-interactive-demo-entry, R8; owner's review 2026-11-16): the interactive instance, the data are invented and
 *   changes may disappear, and a solid button "Demo: choose a view" to `/start`. The strip stays in the page flow (never sticky), so it
 *   covers no content, and it wraps at 390 px.
 */
export function DemoRibbon({ locale, t, variant = 'guide' }: { locale: Locale; t: Dictionary; variant?: 'guide' | 'start' }) {
  const start = variant === 'start';
  return (
    <div data-demo-ribbon={variant} role="note" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-ink px-4 py-2 text-small text-paper">
      <span>{start ? t.showcase.ribbon.interactiveText : t.showcase.ribbon.text}</span>
      {start ? (
        <a
          href={`/start?lang=${locale}`}
          data-demo-start-button
          className="inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-4 text-small font-semibold text-ink hover:bg-brass-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface"
        >
          {t.showcase.ribbon.interactiveBack}
        </a>
      ) : (
        <a href={`/demo?lang=${locale}`} className="font-medium underline underline-offset-4">{t.showcase.ribbon.back}</a>
      )}
    </div>
  );
}
