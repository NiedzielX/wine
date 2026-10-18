import { ENGINE_FACTS, budgetOptions, parseDishIds, parsePeople } from '@wine-match/core';
import type { Metadata } from 'next';
import { BudgetChoice, Explain, LanguageSwitch, ModeSwitch, PeopleChoice, StyleChoice, TableDishPicker, TopBar } from '../../../_components/guest-ui';
import { SelectionCount } from '../../../_components/selection-count';
import { guestContext, notFound, type SearchParams } from '@/server/guest-page';
import { getI18n } from '@/server/i18n';
import { trackUsage } from '@/server/usage-events';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.guest.meta.table };
}

type Props = { params: Promise<{ slug: string }>; searchParams: SearchParams };

/**
 * G5 — whole table selection. A plain GET form: works without JavaScript. "How do we pick one bottle for the table?"
 * sits under the lead (spec 2026-10-16-how-it-works-explanations, phase 2); inside the form, but a `<details>` is no
 * form control, so nothing is submitted with it. "How many people are drinking wine?" (`people`, spec
 * whole-table-waiter-path F4, R16) follows the dishes: "Skip" by default, as there is no default number (Q4).
 */
export default async function TablePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { q, prefs, services, t, locale, lang, session, href, langHrefs } = await guestContext(searchParams);
  const menu = await services.catalogService.publishedMenu(slug, locale);
  if (!menu) notFound();
  const selected = new Set(parseDishIds(q));
  const l = t.guest.table;
  // the counter is a client component: it gets plain strings, one per count, so each language keeps its plurals
  const counts = Array.from({ length: menu.dishes.length + 1 }, (_, n) => n);

  // G5 records no event of its own, but a guest who arrives here by a link starts a session
  await trackUsage(services, menu.restaurant, session, []);
  return (
    <>
      <TopBar back={href(`/r/${slug}`, prefs)} title={menu.restaurant.name} t={t} langSwitch={<LanguageSwitch locale={locale} hrefs={langHrefs(`/r/${slug}/table`)} t={t} />} />
      <form id="table-form" action={`/r/${slug}/table/result`} method="get" className="flex flex-1 flex-col">
        <main className="flex-1 px-5 pt-5 pb-6 lg:mx-auto lg:w-full lg:max-w-[720px]">
          {/* preferences the form does not ask for travel on to the result (spec: guest-short-path-and-desktop R6) */}
          {prefs.serving !== 'any' && <input type="hidden" name="serving" value={prefs.serving} />}
          {prefs.weight !== 'any' && <input type="hidden" name="weight" value={prefs.weight} />}
          {prefs.mood !== 'any' && <input type="hidden" name="mood" value={prefs.mood} />}
          {lang && <input type="hidden" name="lang" value={lang} />}
          <input type="hidden" name="sid" value={session.id} />
          <ModeSwitch dishHref={href(`/r/${slug}/menu`, prefs)} tableHref={href(`/r/${slug}/table`, prefs)} mode="table" t={t} />
          <p className="text-ink-2">{l.lead}</p>
          <Explain id="table" className="mt-1" summary={t.guest.explain.table.summary} points={t.guest.explain.table.points(ENGINE_FACTS)} />
          <TableDishPicker dishes={menu.dishes} selected={selected} variant="rows" t={t} locale={locale} />
          <PeopleChoice people={parsePeople(q)} t={t} />
          <details className="mt-6" open={prefs.styles.length > 0 || prefs.maxPrice !== null}>
            <summary className="cursor-pointer font-semibold">{l.colourAndBudget}</summary>
            <StyleChoice prefs={prefs} legend={t.guest.prefs.colour} locale={locale} />
            <BudgetChoice prefs={prefs} budgets={budgetOptions('bottle')} legend={l.budgetPerBottle} t={t} locale={locale} />
          </details>
        </main>
        <div className="pointer-events-none sticky bottom-0 z-10 grid gap-2 bg-gradient-to-t from-paper from-70% to-transparent px-5 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))] *:pointer-events-auto lg:pointer-events-auto lg:static lg:mx-auto lg:w-full lg:max-w-[720px] lg:bg-none lg:pb-8">
          <SelectionCount formId="table-form" name="dish" labels={{ initial: l.countInitial(2), none: l.countNone, below: counts.map((n) => l.countOne(n)), selected: counts.map((n) => l.countMany(n)) }} />
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-full border border-wine bg-wine px-5 text-[15px] font-semibold text-on-wine hover:bg-wine-deep disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine">{l.submit}</button>
        </div>
      </form>
    </>
  );
}
