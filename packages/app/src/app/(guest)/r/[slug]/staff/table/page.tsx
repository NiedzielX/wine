import { ENGINE_FACTS, MAX_TABLE_DISHES, budgetOptions, parseDishIds, parsePeople, pickTableItem, prefsToQuery, type GuestPreferences, type TableResult } from '@wine-match/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BudgetChoice, DishScores, EmptyState, Explain, LanguageSwitch, ModeSwitch, Notice, PeopleChoice, PeopleLinks, StyleChoice, TableDishPicker, TableFitLine, TableQuantityLine, TopBar } from '../../../../_components/guest-ui';
import { DishSearch } from '../../../../_components/dish-search';
import { CodeForWaiter } from '../../../../_components/recommendation-code';
import { SelectionCount } from '../../../../_components/selection-count';
import { isDomainError } from '@/server/domain-errors';
import { guestContext, inMenuOrder, notFound, type SearchParams } from '@/server/guest-page';
import { formatPrice, getI18n } from '@/server/i18n';
import { issueCodeForPage } from '@/server/recommendation-code';
import { trackUsage } from '@/server/usage-events';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.guest.meta.staffTable };
}

type Props = { params: Promise<{ slug: string }>; searchParams: SearchParams };

/**
 * G11 — the waiter's whole table (spec 2026-10-16-whole-table-waiter-path, phase 2: R5–R7, R11, R13). Public like G9
 * (D03), no JavaScript needed: a GET form of dish tiles (the picker shared with G5), a budget per bottle and the colour.
 * With two or more published dishes the answer stands above the form: "This bottle: No. 109 …", the "works with n of m"
 * line the waiter reads out, each dish's raw engine score, up to two alternatives ("Choose this one" makes one the
 * bottle, `pickTableItem` in core), the glass-per-dish split and the desserts set aside. Always a bottle (`serving` from
 * the URL is ignored) and a budget no bottle meets is relaxed with a notice. One recommendation code per answer, for the
 * bottle shown first (E09 Q19, `source: 'staff'`); an alternative gets its code only once chosen — its link never
 * prefetches, so a prefetch cannot issue a code for a bottle nobody chose. The waiter's own session (`source: 'staff'`)
 * records `staff_table_lookup`, never a guest session. Phase 4 (R16): "How many people are drinking wine?" in the form
 * and as links 2–8 under the bottle; the quantity line ("For 6 people: 3 bottles · 960 zł") only after a choice — there
 * is no default (Q4). The links never prefetch either: the page they open issues a code.
 */
export default async function StaffTablePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { q, prefs: urlPrefs, services, t, locale, lang, session, href, langHrefs } = await guestContext(searchParams, { source: 'staff' });
  const menu = await services.catalogService.publishedMenu(slug, locale);
  if (!menu) notFound();
  const path = `/r/${slug}/staff/table`;
  const l = t.guest.staffTable;
  const prefs: GuestPreferences = { ...urlPrefs, serving: 'bottle' };
  const people = parsePeople(q);
  const peopleParam = people === null ? undefined : String(people);
  const dishes = inMenuOrder(menu.dishes);
  const asked = new Set(parseDishIds(q));
  // the published dishes asked for, in menu order (the order the form submits); the first MAX_TABLE_DISHES are paired
  const chosen = dishes.filter((d) => asked.has(d.id));
  const used = chosen.slice(0, MAX_TABLE_DISHES);
  let result: TableResult | null = null;
  let needTwo = asked.size > 0 && chosen.length < 2;
  if (!needTwo && chosen.length >= 2) {
    try {
      result = (await services.recommendationService.forTable(slug, used.map((d) => d.id), prefs, locale, { relaxBudget: true, people }))?.result ?? null;
    } catch (e) {
      if (!isDomainError(e, 'table_needs_two_dishes')) throw e;
      needTwo = true;
    }
  }
  const wine = typeof q.wine === 'string' ? q.wine : undefined;
  const items = result ? pickTableItem(result.items, wine) : [];
  const [best, ...alts] = items;
  const pickedWineId = wine && items.some((i) => i.wine.id === wine) ? wine : undefined;
  const dishesParam = chosen.map((d) => d.id).join(',');
  const listNo = (n: number | undefined) => (n === undefined ? '' : `${l.listNo(n)} `);
  // the counter is a client component: it gets plain strings, one per count, so each language keeps its plurals
  const counts = Array.from({ length: dishes.length + 1 }, (_, n) => n);

  // one code for the bottle shown first: the engine's, or the one the waiter chose (E09 Q19)
  const issued = best
    ? await issueCodeForPage(services, menu.restaurant, { session, source: 'staff', wineId: best.wine.id, serving: best.serving, dishIds: used.map((d) => d.id) })
    : null;

  await trackUsage(services, menu.restaurant, session, result ? [{
    name: 'staff_table_lookup', ...(best ? { wineId: best.wine.id } : {}),
    props: {
      source: 'staff', dishIds: used.map((d) => d.id), wineIds: items.map((i) => i.wine.id), ...(pickedWineId ? { pickedWineId } : {}),
      // the serving is always a bottle here: only what the waiter chose is recorded
      prefs: prefsToQuery({ ...prefs, serving: 'any' }), splitSuggested: result.splitSuggested, budgetRelaxed: result.notice !== null,
      ...(result.people !== null ? { people: result.people } : {})
    }
  }] : []);
  return (
    <>
      <TopBar back={href(`/r/${slug}`)} title={l.title} t={t} langSwitch={<LanguageSwitch locale={locale} hrefs={langHrefs(path)} t={t} />} />
      <form id="staff-table-form" action={path} method="get" className="flex flex-1 flex-col">
        <main className="flex-1 px-5 pt-4 pb-6 lg:mx-auto lg:w-full lg:max-w-[720px]">
          {/* preferences the form does not ask for stay as they came; `serving` is not one of them (always a bottle) */}
          {prefs.weight !== 'any' && <input type="hidden" name="weight" value={prefs.weight} />}
          {prefs.mood !== 'any' && <input type="hidden" name="mood" value={prefs.mood} />}
          {lang && <input type="hidden" name="lang" value={lang} />}
          <input type="hidden" name="sid" value={session.id} />
          <ModeSwitch dishHref={href(`/r/${slug}/staff`, urlPrefs)} tableHref={href(path, urlPrefs)} mode="table" t={t} />

          {result && (
            <section aria-labelledby="staff-table-bottle" data-staff-table-result="" className="rounded-[18px] border border-line bg-surface p-4">
              {chosen.length > MAX_TABLE_DISHES && <Notice>{l.truncated(MAX_TABLE_DISHES)}</Notice>}
              {result.notice && <Notice>{result.notice}</Notice>}
              {!best ? (
                <EmptyState title={l.nothingTitle} text={l.nothingText} />
              ) : (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <h2 id="staff-table-bottle" className="font-serif text-[24px] leading-tight">{l.thisBottle(best.wine.listNumber, `${best.wine.producer} ${best.wine.name}`)}</h2>
                      <p className="mt-1 text-[14.5px] text-ink-2 tabular-nums">{t.guest.wines.bottlePrice(formatPrice(best.wine.bottlePrice, locale))}</p>
                    </div>
                    <CodeForWaiter code={issued?.code ?? null} t={t} labels={l.code} compact />
                  </div>
                  <TableFitLine fit={best.fit} t={t} className="mt-3 text-[17px] leading-snug font-semibold" />
                  <div className="mt-3 border-t border-line pt-3">
                    <DishScores perDish={best.perDish} showScores t={t} />
                  </div>
                  <div data-table-people="" className="mt-3 border-t border-line pt-3">
                    {best.quantity && <TableQuantityLine quantity={best.quantity} t={t} locale={locale} className="text-[16px] font-semibold tabular-nums" />}
                    {/* never prefetched: the page issues a code for the bottle (E09 Q19) */}
                    <PeopleLinks people={result.people} hrefFor={(n) => href(path, urlPrefs, { dishes: dishesParam, wine: pickedWineId, people: String(n) })} prefetch={false} t={t} />
                  </div>
                  {alts.length > 0 && (
                    <div className="mt-4 border-t border-line pt-3">
                      <h3 className="text-[14px] font-semibold text-ink-2">{l.others}</h3>
                      <ul>
                        {alts.map((a) => (
                          <li key={a.wine.id} data-alternative={a.wine.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line py-2 text-[14.5px] last:border-b-0">
                            <span className="min-w-0">
                              <b className="font-semibold">{listNo(a.wine.listNumber)}{a.wine.producer} {a.wine.name}</b>
                              <span className="text-ink-2 tabular-nums"> · {l.fitsOf(a.fit.fits, a.fit.of)} · {formatPrice(a.wine.bottlePrice, locale)}</span>
                            </span>
                            {/* never prefetched: opening it issues a code (E09 Q19, R6) */}
                            <Link href={href(path, urlPrefs, { dishes: dishesParam, wine: a.wine.id, people: peopleParam })} prefetch={false} data-choose={a.wine.id}
                              className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-[#d4ccd0] bg-paper px-3.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-wine">{l.choose}</Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.splitSuggested && result.split.length > 0 && (
                    <div className="mt-4 rounded-[14px] bg-[#ece8ea] p-3.5">
                      <h3 className="text-[15px] font-semibold">{t.guest.tableResult.splitTitle}</h3>
                      <ul className="mt-1.5 grid gap-1.5 text-[14.5px]">
                        {result.split.map((s) => (
                          <li key={s.dish.id}><b>{s.dish.name}</b>: {listNo(s.wine.listNumber)}{s.wine.producer} {s.wine.name} · <span className="tabular-nums">{formatPrice(s.wine.glassPrice ?? s.wine.bottlePrice, locale)}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.setAside.length > 0 && <p className="mt-3 text-sm text-ink-2">{l.dessertsNote(result.setAside.map((d) => d.name).join(', '))}</p>}
                </>
              )}
            </section>
          )}
          {needTwo && <Notice>{l.needTwo}</Notice>}

          {result ? (
            <div className="mt-6 flex items-center justify-between gap-3">
              <h2 className="font-serif text-[22px]">{l.changeTable}</h2>
              <Link href={href(path, urlPrefs)} className="inline-flex min-h-11 items-center text-[14.5px] font-semibold text-wine underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-wine">{l.newTable}</Link>
            </div>
          ) : (
            <p className="text-ink-2">{l.lead}</p>
          )}
          <Explain id="staffTable" className="mt-1" summary={t.guest.explain.staffTable.summary} points={t.guest.explain.staffTable.points(ENGINE_FACTS)} />

          {dishes.length === 0 ? (
            <EmptyState title={t.guest.staff.noDishesTitle} text={t.guest.staff.noDishesText} />
          ) : (
            <>
              <DishSearch containerId="staff-table-dishes" label={l.search} />
              <div id="staff-table-dishes">
                <TableDishPicker dishes={dishes} selected={new Set(chosen.map((d) => d.id))} variant="tiles" dessertsNote={l.dessertsApart} t={t} locale={locale} />
              </div>
              <PeopleChoice people={people} t={t} />
              <BudgetChoice prefs={prefs} budgets={budgetOptions('bottle')} legend={t.guest.table.budgetPerBottle} className="mt-6" t={t} locale={locale} />
              <details className="mt-5" open={prefs.styles.length > 0}>
                <summary className="min-h-11 cursor-pointer content-center font-semibold">{l.colour}</summary>
                <StyleChoice prefs={prefs} legend={t.guest.prefs.colour} className="mt-2" locale={locale} />
              </details>
            </>
          )}
        </main>
        {dishes.length > 0 && (
          <div className="pointer-events-none sticky bottom-0 z-10 grid gap-2 bg-gradient-to-t from-paper from-70% to-transparent px-5 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))] *:pointer-events-auto lg:pointer-events-auto lg:static lg:mx-auto lg:w-full lg:max-w-[720px] lg:bg-none lg:pb-8">
            <SelectionCount formId="staff-table-form" name="dish" labels={{ initial: t.guest.table.countInitial(2), none: t.guest.table.countNone, below: counts.map((n) => t.guest.table.countOne(n)), selected: counts.map((n) => t.guest.table.countMany(n)) }} />
            <button type="submit" className="inline-flex min-h-12 items-center justify-center rounded-full border border-wine bg-wine px-5 text-[16px] font-semibold text-on-wine hover:bg-wine-deep disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine">{l.submit}</button>
          </div>
        )}
      </form>
    </>
  );
}
