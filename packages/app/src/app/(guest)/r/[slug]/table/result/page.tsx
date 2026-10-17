import { parseDishIds, type TableItem } from '@wine-match/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, EmptyState, LanguageSwitch, Notice, Price, Score, Seal, TopBar } from '../../../../_components/guest-ui';
import { isDomainError } from '@/server/domain-errors';
import { guestContext, notFound, type SearchParams } from '@/server/guest-page';
import { formatPrice, getI18n } from '@/server/i18n';
import { trackUsage } from '@/server/usage-events';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.guest.meta.tableResult };
}

type Props = { params: Promise<{ slug: string }>; searchParams: SearchParams };

/** The one-line reason under a wine. A module-level component: one defined inside the page would be a new component type on every render. */
const Why = ({ i }: { i: TableItem }) => <p className="mt-1.5 text-sm text-ink-2">{i.why}</p>;

/** G6 — best wine for the table. */
export default async function TableResultPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { q, prefs, services, t, locale, session, href, langHrefs } = await guestContext(searchParams);
  const ids = parseDishIds(q);
  const tablePath = href(`/r/${slug}/table`, prefs, { dishes: ids.join(',') });
  const langSwitch = <LanguageSwitch locale={locale} hrefs={langHrefs(`/r/${slug}/table/result`)} t={t} />;
  const l = t.guest.tableResult;
  let out;
  try {
    out = await services.recommendationService.forTable(slug, ids, prefs, locale);
  } catch (e) {
    if (!isDomainError(e, 'table_needs_two_dishes')) throw e;
    const menu = await services.catalogService.publishedMenu(slug, locale);
    if (!menu) notFound();
    await trackUsage(services, menu.restaurant, session, []);
    return (
      <>
        <TopBar back={href(`/r/${slug}/table`)} title={menu.restaurant.name} t={t} langSwitch={langSwitch} />
        <main className="flex-1 px-5 lg:mx-auto lg:w-full lg:max-w-[720px]"><EmptyState title={l.needTwoTitle} text={l.needTwoText} action={<Button href={tablePath}>{l.chooseDishes}</Button>} /></main>
      </>
    );
  }
  if (!out) notFound();
  const { restaurant, result } = out;
  const showScores = restaurant.settings?.showScores ?? true;
  const menu = await services.catalogService.publishedMenu(slug, locale);
  const chosen = ids.map((id) => menu?.dishes.find((d) => d.id === id)).filter((d) => !!d);
  const tableParam = ids.join(',');
  const wineHref = (id: string) => href(`/r/${slug}/wine/${id}`, prefs, { table: tableParam });
  const [best, ...alts] = result.items;

  // the table result event (`table_recommendation_viewed`) comes with phase 2 of the usage events; here only a new session
  await trackUsage(services, restaurant, session, []);
  return (
    <>
      <TopBar back={tablePath} title={restaurant.name} t={t} langSwitch={langSwitch} />
      <main className="flex-1 px-5 pt-5 pb-10 lg:mx-auto lg:w-full lg:max-w-[720px]">
        <h1 className="font-serif text-[28px] leading-tight">{l.title}</h1>
        <p className="mt-1 text-[14.5px] text-ink-2">{l.dishes(chosen.length, chosen.map((d) => d.name).join(', '))}</p>
        {result.setAside.length > 0 && <Notice>{l.dessertsApart(result.setAside.map((d) => d.name).join(l.or))}</Notice>}

        {!best ? (
          <EmptyState title={l.noneTitle} text={l.noneText} action={<Button href={tablePath} variant="secondary">{l.changePrefs}</Button>} />
        ) : (
          <>
            <Link href={wineHref(best.wine.id)} className="mt-6 block rounded-[18px] border border-line bg-surface p-5 focus-visible:outline-2 focus-visible:outline-wine">
              <p className="flex items-center gap-2 text-sm font-semibold text-wine"><Seal />{l.recommended}</p>
              <div className="mt-3 grid grid-cols-[1fr_auto] items-start gap-3.5">
                <div>
                  <h2 className="font-serif text-[25px] leading-[1.15]">{best.wine.name}</h2>
                  <p className="text-[14.5px] text-ink-2">{best.wine.producer}, {best.wine.region}</p>
                  <Why i={best} />
                </div>
                <Score score={best.overall} colour={best.wine.colour} showScores={showScores} size={48} t={t} />
              </div>
              <div className="mt-4 grid gap-2.5 border-t border-line pt-4">
                {best.perDish.map((x) => (
                  <div key={x.dish.id} className="grid grid-cols-[1fr_120px_36px] items-center gap-2.5 text-[14.5px]">
                    <span>{x.dish.name}{x.sommelierPick && <span title={l.sommelierPairing} className="ml-1.5 inline-block align-[-3px] text-brass"><Seal className="size-4" /></span>}</span>
                    <span className="h-1.5 overflow-hidden rounded bg-line" aria-hidden="true"><i className="block h-full rounded bg-wine" style={{ width: `${x.score}%` }} /></span>
                    <b className="text-right font-semibold tabular-nums">{x.score}%</b>
                  </div>
                ))}
                <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-3"><span>{l.overall}</span><b className="font-serif text-[22px]">{best.overall}%</b></div>
              </div>
              <div className="mt-3"><Price wine={best.wine} serving="bottle" t={t} locale={locale} /></div>
            </Link>

            {alts.length > 0 && (
              <section className="mt-7">
                <h2 className="mb-1 text-[15px] font-semibold">{l.others}</h2>
                {alts.map((a) => (
                  <Link key={a.wine.id} href={wineHref(a.wine.id)} className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-line py-4 last:border-b-0">
                    <div>
                      <h3 className="font-serif text-[19px] leading-tight">{a.wine.name}</h3>
                      <p className="text-sm text-ink-2">{a.wine.producer}, {a.wine.region}</p>
                      <Why i={a} />
                      <div className="mt-2.5"><Price wine={a.wine} serving="bottle" t={t} locale={locale} /></div>
                    </div>
                    <Score score={a.overall} colour={a.wine.colour} showScores={showScores} size={36} t={t} />
                  </Link>
                ))}
              </section>
            )}

            {result.splitSuggested && result.split.length > 0 && (
              <section className="mt-6 rounded-[18px] bg-[#ece8ea] p-4">
                <h2 className="text-[15px] font-semibold">{l.splitTitle}</h2>
                <p className="mt-1 mb-1.5 text-sm text-ink-2">{l.splitText}</p>
                {result.split.map((s) => (
                  <Link key={s.dish.id} href={href(`/r/${slug}/wine/${s.wine.id}`, prefs, { dish: s.dish.id })} className="grid grid-cols-[1fr_auto] gap-2 border-b border-[#d4ccd0] py-2.5 text-[14.5px] last:border-b-0">
                    <span><b>{s.dish.name}</b><br /><span className="text-ink-2">{s.wine.producer} {s.wine.name}</span></span>
                    <span className="tabular-nums">{formatPrice(s.wine.glassPrice ?? s.wine.bottlePrice, locale)}</span>
                  </Link>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
