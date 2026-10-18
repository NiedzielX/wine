import { DEFAULT_RESTAURANT_SETTINGS, ENGINE_FACTS, prefsToQuery } from '@wine-match/core';
import type { Metadata } from 'next';
import { Button, EmptyState, Explain, LanguageSwitch, Price, Seal, TopBar } from '../../../_components/guest-ui';
import { PrefChips } from '../../../_components/pref-chips';
import { guestContext, notFound, type SearchParams } from '@/server/guest-page';
import { getI18n } from '@/server/i18n';
import { trackUsage } from '@/server/usage-events';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.guest.meta.staff };
}

type Props = { params: Promise<{ slug: string }>; searchParams: SearchParams };

/**
 * G9 — quick pairing lookup for the floor team. Same engine and order as the guest sees. "Why this order?" sits under
 * the lead (spec 2026-10-16-how-it-works-explanations, phase 2), true to the live "Fill empty places" setting.
 */
export default async function StaffPage({ params, searchParams }: Props) {
  const { slug } = await params;
  // the staff lookup has its own session (never a guest session: no `guest_session_started`); its links and form carry it
  const { q, prefs, services, t, locale, lang, session, href, langHrefs } = await guestContext(searchParams, { source: 'staff' });
  const menu = await services.catalogService.publishedMenu(slug, locale);
  if (!menu) notFound();
  // `staff_lookup` only when the waiter chose a dish (`dish=` of the published menu), not for the first dish shown (Q9)
  const chosen = menu.dishes.find((d) => d.id === q.dish);
  const dish = chosen ?? menu.dishes[0];
  const data = dish ? await services.recommendationService.forDish(slug, dish.id, prefs, undefined, locale) : null;
  const items = data?.result.items ?? [];
  const path = `/r/${slug}/staff`;
  const l = t.guest.staff;
  const { showUnreviewed } = menu.restaurant.settings ?? DEFAULT_RESTAURANT_SETTINGS;

  await trackUsage(services, menu.restaurant, session, chosen ? [{
    name: 'staff_lookup', dishId: chosen.id, props: { source: 'staff', prefs: prefsToQuery(prefs), wineIds: items.map((i) => i.wine.id) }
  }] : []);
  return (
    <>
      <TopBar back={href(`/r/${slug}`)} title={l.title} t={t} langSwitch={<LanguageSwitch locale={locale} hrefs={langHrefs(path)} t={t} />} />
      <main className="flex-1 px-5 pt-5 pb-8 lg:mx-auto lg:w-full lg:max-w-[720px]">
        <p className="text-ink-2">{l.lead}</p>
        <Explain id="staff" className="mt-1 mb-3" summary={t.guest.explain.staff.summary} points={t.guest.explain.staff.points(ENGINE_FACTS, { showUnreviewed })} />
        {dish ? (
          <>
            <form action={path} method="get" className="grid gap-1.5">
              {Object.entries({ serving: prefs.serving !== 'any' ? prefs.serving : '', styles: prefs.styles.join(','), maxPrice: prefs.maxPrice ? String(prefs.maxPrice) : '', weight: prefs.weight !== 'any' ? prefs.weight : '', mood: prefs.mood !== 'any' ? prefs.mood : '', lang: lang ?? '', sid: session.id })
                .filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <label htmlFor="staff-dish" className="text-[13.5px] font-semibold text-ink-2">{l.dish}</label>
              <div className="flex gap-2">
                <select id="staff-dish" name="dish" defaultValue={dish.id} className="min-h-11 w-full rounded-md border border-[#d4ccd0] bg-surface px-3">
                  {menu.dishes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button type="submit" className="min-h-11 shrink-0 rounded-full border border-[#d4ccd0] bg-surface px-4 text-[15px] font-semibold">{l.show}</button>
              </div>
            </form>
            <PrefChips prefs={prefs} hrefFor={(p) => href(path, p, { dish: dish.id })} t={t} locale={locale} />
            <div className="mt-6">
              {items.length === 0 ? (
                <EmptyState title={l.nothingTitle} text={l.nothingText} action={<Button href={href(path, { ...prefs, serving: 'any', styles: [], maxPrice: null, weight: 'any', mood: 'any' }, { dish: dish.id })} variant="secondary">{t.guest.wines.clearFilters}</Button>} />
              ) : items.map((i, k) => (
                <article key={i.wine.id} className="grid gap-1 border-t border-line py-3.5">
                  <div className="flex items-baseline justify-between gap-2.5">
                    <h2 className="font-serif text-lg">{k + 1}. {i.wine.producer} {i.wine.name}</h2>
                    {i.wine.listNumber !== undefined && <span className="shrink-0 text-ink-3 tabular-nums">{l.listNo(i.wine.listNumber)}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {i.sommelier && <span className="inline-flex items-center gap-1 rounded-full bg-brass-soft px-2.5 text-[12.5px] leading-5 font-semibold text-brass"><Seal className="size-3.5" />{i.sommelier.role === 'primary' ? l.firstChoice : l.pick}</span>}
                    {i.bestValue && <span className="rounded-full bg-sage-soft px-2.5 text-[12.5px] leading-5 font-semibold text-sage">{t.guest.wines.bestValue}</span>}
                    <span className="rounded-full bg-[#e8ebf0] px-2.5 text-[12.5px] leading-5 font-semibold text-[#4f5b6e]">{l.matchPct(i.matchScore)}</span>
                  </div>
                  <p className="text-[14.5px] text-ink-2">{l.say(i.why)}</p>
                  <Price wine={i.wine} serving={prefs.serving} t={t} locale={locale} />
                </article>
              ))}
            </div>
          </>
        ) : (
          <EmptyState title={l.noDishesTitle} text={l.noDishesText} />
        )}
      </main>
    </>
  );
}
