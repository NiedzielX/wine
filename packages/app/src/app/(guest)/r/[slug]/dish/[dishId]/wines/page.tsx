import { DEFAULT_PREFS, prefsSummary } from '@wine-match/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BestCard, Button, Chip, EmptyState, Notice, RecoFooter, TopBar, WineRow } from '../../../../../_components/guest-ui';
import { PrefChips } from '../../../../../_components/pref-chips';
import { guestContext, hrefWith, notFound, type SearchParams } from '@/server/guest-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Wines for your dish' };

type Props = { params: Promise<{ slug: string; dishId: string }>; searchParams: SearchParams };

/** G3 + G4 — wine recommendations for a dish; `?sheet=filters` opens the filters sheet. */
export default async function WinesPage({ params, searchParams }: Props) {
  const { slug, dishId } = await params;
  const { q, prefs, services } = await guestContext(searchParams);
  const data = await services.recommendationService.forDish(slug, dishId, prefs);
  if (!data) notFound();
  const { restaurant, dish, result } = data;
  const showScores = restaurant.settings?.showScores ?? true;
  const path = `/r/${slug}/dish/${dish.id}/wines`;
  const active = prefsSummary(prefs);
  const [best, ...rest] = result.items;
  const wineHref = (id: string) => `/r/${slug}/wine/${id}${hrefWith('', prefs, { dish: dish.id })}`;
  const sheetOpen = q.sheet === 'filters';

  return (
    <>
      <TopBar
        back={`/r/${slug}/dish/${dish.id}${hrefWith('', prefs)}`}
        title={restaurant.name}
        right={
          <Link href={hrefWith(path, prefs, { sheet: 'filters' })} scroll={false} aria-label="Refine" className="grid size-11 place-items-center rounded-full hover:bg-ink/5">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M3 5h14M6 10h8M8.5 15h3" /></svg>
          </Link>
        }
      />
      <main className="flex-1 px-5 pt-5 pb-10">
        <h1 className="font-serif text-[28px] leading-tight">For your {dish.name.toLowerCase()}</h1>
        <p className="mt-1 text-[14.5px] text-ink-2">{result.items.length} {result.items.length === 1 ? 'wine' : 'wines'} from our list</p>

        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {active.map((a) => <span key={a} aria-current="true" className="inline-flex min-h-[30px] items-center rounded-full border border-ink bg-ink px-2.5 text-[13px] font-medium text-paper">{a}</span>)}
          <Chip href={hrefWith(path, prefs, { sheet: 'filters' })}>{active.length ? 'Edit' : 'Refine'}</Chip>
        </div>

        {result.notice && <Notice>{result.notice}</Notice>}

        {!best ? (
          <EmptyState
            title="No wine fits all your choices"
            text={active.length ? 'Try fewer filters, or a different budget.' : 'Our sommelier is still preparing pairings for this dish. Your waiter can help.'}
            action={active.length ? <Button href={path} variant="secondary">Clear filters</Button> : undefined}
          />
        ) : (
          <>
            <BestCard item={best} href={wineHref(best.wine.id)} serving={prefs.serving} showScores={showScores} />
            {rest.length > 0 && (
              <section className="mt-7">
                <h2 className="mb-1 text-[15px] font-semibold">Also good with this dish</h2>
                {rest.map((i) => <WineRow key={i.wine.id} item={i} href={wineHref(i.wine.id)} serving={prefs.serving} showScores={showScores} />)}
              </section>
            )}
            <RecoFooter director={restaurant.wineDirector} restaurant={restaurant.name} />
          </>
        )}
      </main>

      {sheetOpen && (
        <>
          <Link href={hrefWith(path, prefs)} scroll={false} aria-label="Close filters" className="fixed inset-0 z-40 bg-ink/40" />
          <section role="dialog" aria-modal="true" aria-labelledby="sheet-title" className="fixed bottom-0 left-1/2 z-50 max-h-[88dvh] w-full max-w-[480px] -translate-x-1/2 overflow-auto rounded-t-[22px] bg-surface px-5 pt-3 pb-[calc(18px+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(34,24,29,0.16)]">
            <div className="mx-auto mb-3.5 h-1 w-9 rounded bg-[#d4ccd0]" />
            <header className="flex items-center justify-between">
              <h2 id="sheet-title" className="font-serif text-2xl">Refine</h2>
              <Link href={hrefWith(path, prefs)} scroll={false} aria-label="Close" className="grid size-11 place-items-center rounded-full hover:bg-ink/5">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
              </Link>
            </header>
            <PrefChips prefs={prefs} hrefFor={(p) => hrefWith(path, p, { sheet: 'filters' })} full />
            <footer className="sticky bottom-0 mt-5 grid grid-cols-[auto_1fr] gap-2.5 bg-surface pt-4">
              <Button href={hrefWith(path, DEFAULT_PREFS, { sheet: 'filters' })} variant="secondary">Reset</Button>
              <Button href={hrefWith(path, prefs)}>Show {result.items.length} {result.items.length === 1 ? 'wine' : 'wines'}</Button>
            </footer>
          </section>
        </>
      )}
    </>
  );
}
