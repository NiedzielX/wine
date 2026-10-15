import type { Metadata } from 'next';
import { Button, EmptyState, Price, Seal, TopBar } from '../../../_components/guest-ui';
import { PrefChips } from '../../../_components/pref-chips';
import { guestContext, hrefWith, notFound, type SearchParams } from '@/server/guest-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pairing lookup' };

type Props = { params: Promise<{ slug: string }>; searchParams: SearchParams };

/** G9 — quick pairing lookup for the floor team. Same engine and order as the guest sees. */
export default async function StaffPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { q, prefs, services } = await guestContext(searchParams);
  const menu = await services.catalogService.publishedMenu(slug);
  if (!menu) notFound();
  const dish = menu.dishes.find((d) => d.id === q.dish) ?? menu.dishes[0];
  const data = dish ? await services.recommendationService.forDish(slug, dish.id, prefs) : null;
  const items = data?.result.items ?? [];
  const path = `/r/${slug}/staff`;

  return (
    <>
      <TopBar back={`/r/${slug}`} title="Pairing lookup" />
      <main className="flex-1 px-5 pt-5 pb-8 lg:mx-auto lg:w-full lg:max-w-[720px]">
        <p className="mb-3 text-ink-2">For the floor team. Same pairings the guest sees, ordered by the Wine Director’s picks.</p>
        {dish ? (
          <>
            <form action={path} method="get" className="grid gap-1.5">
              {Object.entries({ serving: prefs.serving !== 'any' ? prefs.serving : '', styles: prefs.styles.join(','), maxPrice: prefs.maxPrice ? String(prefs.maxPrice) : '', weight: prefs.weight !== 'any' ? prefs.weight : '', mood: prefs.mood !== 'any' ? prefs.mood : '' })
                .filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <label htmlFor="staff-dish" className="text-[13.5px] font-semibold text-ink-2">Dish</label>
              <div className="flex gap-2">
                <select id="staff-dish" name="dish" defaultValue={dish.id} className="min-h-11 w-full rounded-md border border-[#d4ccd0] bg-surface px-3">
                  {menu.dishes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button type="submit" className="min-h-11 shrink-0 rounded-full border border-[#d4ccd0] bg-surface px-4 text-[15px] font-semibold">Show</button>
              </div>
            </form>
            <PrefChips prefs={prefs} hrefFor={(p) => hrefWith(path, p, { dish: dish.id })} />
            <div className="mt-6">
              {items.length === 0 ? (
                <EmptyState title="Nothing fits" text="Relax the budget or colour." action={<Button href={hrefWith(path, { ...prefs, serving: 'any', styles: [], maxPrice: null, weight: 'any', mood: 'any' }, { dish: dish.id })} variant="secondary">Clear filters</Button>} />
              ) : items.map((i, k) => (
                <article key={i.wine.id} className="grid gap-1 border-t border-line py-3.5">
                  <div className="flex items-baseline justify-between gap-2.5">
                    <h2 className="font-serif text-lg">{k + 1}. {i.wine.producer} {i.wine.name}</h2>
                    {i.wine.listNumber !== undefined && <span className="shrink-0 text-ink-3 tabular-nums">no. {i.wine.listNumber}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {i.sommelier && <span className="inline-flex items-center gap-1 rounded-full bg-brass-soft px-2.5 text-[12.5px] leading-5 font-semibold text-brass"><Seal className="size-3.5" />{i.sommelier.role === 'primary' ? 'Wine Director’s first choice' : 'Wine Director’s pick'}</span>}
                    {i.bestValue && <span className="rounded-full bg-sage-soft px-2.5 text-[12.5px] leading-5 font-semibold text-sage">Best value</span>}
                    <span className="rounded-full bg-[#e8ebf0] px-2.5 text-[12.5px] leading-5 font-semibold text-[#4f5b6e]">{i.matchScore}% match</span>
                  </div>
                  <p className="text-[14.5px] text-ink-2">Say: “{i.why}”</p>
                  <Price wine={i.wine} serving={prefs.serving} />
                </article>
              ))}
            </div>
          </>
        ) : (
          <EmptyState title="No dishes on the menu" text="The menu is being updated." />
        )}
      </main>
    </>
  );
}
