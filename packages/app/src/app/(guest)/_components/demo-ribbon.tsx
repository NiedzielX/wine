import type { Locale } from '@wine-match/core';
import type { Dictionary } from '@/i18n/en';

/**
 * The strip on every guest page of the public demo instance (spec 2026-11-04-sales-demo-and-roi-calculator, Q3, R6): the data are
 * invented, and a plain link leads back to the guide. Only `SHOWCASE_MODE=demo` renders it. The link carries `lang` and nothing
 * else: no session id, no preferences (a visit to the guide is not a guest session).
 */
export function DemoRibbon({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <div data-demo-ribbon role="note" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-ink px-4 py-2 text-small text-paper">
      <span>{t.showcase.ribbon.text}</span>
      <a href={`/demo?lang=${locale}`} className="font-medium underline underline-offset-4">{t.showcase.ribbon.back}</a>
    </div>
  );
}
