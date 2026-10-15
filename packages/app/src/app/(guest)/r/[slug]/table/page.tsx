import { STYLE_LABELS, WINE_STYLES, budgetOptions, parseDishIds } from '@wine-match/core';
import type { Metadata } from 'next';
import { ModeSwitch, TopBar } from '../../../_components/guest-ui';
import { SelectionCount } from '../../../_components/selection-count';
import { CATEGORIES, guestContext, hrefWith, notFound, type SearchParams } from '@/server/guest-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pair for the table' };

type Props = { params: Promise<{ slug: string }>; searchParams: SearchParams };

/** G5 — whole table selection. A plain GET form: works without JavaScript. */
export default async function TablePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { q, prefs, services } = await guestContext(searchParams);
  const menu = await services.catalogService.publishedMenu(slug);
  if (!menu) notFound();
  const selected = new Set(parseDishIds(q));
  const budgets = budgetOptions('bottle');
  const pill = 'inline-flex min-h-9 cursor-pointer items-center rounded-full border border-[#d4ccd0] bg-surface px-3.5 text-sm font-medium has-[input:checked]:border-ink has-[input:checked]:bg-ink has-[input:checked]:text-paper has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-wine';

  return (
    <>
      <TopBar back={hrefWith(`/r/${slug}`, prefs)} title={menu.restaurant.name} />
      <form id="table-form" action={`/r/${slug}/table/result`} method="get" className="flex flex-1 flex-col">
        <main className="flex-1 px-5 pt-5 pb-6 lg:mx-auto lg:w-full lg:max-w-[720px]">
          {/* preferences the form does not ask for travel on to the result (spec: guest-short-path-and-desktop R6) */}
          {prefs.serving !== 'any' && <input type="hidden" name="serving" value={prefs.serving} />}
          {prefs.weight !== 'any' && <input type="hidden" name="weight" value={prefs.weight} />}
          {prefs.mood !== 'any' && <input type="hidden" name="mood" value={prefs.mood} />}
          <ModeSwitch dishHref={hrefWith(`/r/${slug}/menu`, prefs)} tableHref={hrefWith(`/r/${slug}/table`, prefs)} mode="table" />
          <p className="text-ink-2">Tick everything your table is ordering. We’ll find one bottle that works across all of it.</p>
          {CATEGORIES.map((c) => {
            const list = menu.dishes.filter((d) => d.category === c);
            if (!list.length) return null;
            return (
              <section key={c}>
                <h2 className="mt-7 mb-1 font-serif text-[26px]">{c}</h2>
                {list.map((d) => (
                  <label key={d.id} className="grid cursor-pointer grid-cols-[28px_1fr_auto] items-start gap-3.5 border-b border-line py-4">
                    <input type="checkbox" name="dish" value={d.id} defaultChecked={selected.has(d.id)} className="mt-0.5 size-6 cursor-pointer rounded-[7px] accent-wine" />
                    <span><span className="font-serif text-[19px]">{d.name}</span><br /><span className="text-sm text-ink-2">{d.description}</span></span>
                    <span className="text-ink-3 tabular-nums">{d.price} zł</span>
                  </label>
                ))}
              </section>
            );
          })}
          <details className="mt-6" open={prefs.styles.length > 0 || prefs.maxPrice !== null}>
            <summary className="cursor-pointer font-semibold">Colour and budget</summary>
            <fieldset className="mt-4 border-0 p-0">
              <legend className="mb-2.5 text-[15px] font-semibold">Colour or style</legend>
              <div className="flex flex-wrap gap-2">
                {WINE_STYLES.map((s) => (
                  <label key={s} className={pill}><input type="checkbox" name="styles" value={s} defaultChecked={prefs.styles.includes(s)} className="sr-only" />{STYLE_LABELS[s]}</label>
                ))}
              </div>
            </fieldset>
            <fieldset className="mt-5 border-0 p-0">
              <legend className="mb-2.5 text-[15px] font-semibold">Budget per bottle</legend>
              <div className="flex flex-wrap gap-2">
                <label className={pill}><input type="radio" name="maxPrice" value="" defaultChecked={prefs.maxPrice === null} className="sr-only" />Any</label>
                {budgets.map((b) => <label key={b} className={pill}><input type="radio" name="maxPrice" value={b} defaultChecked={prefs.maxPrice === b} className="sr-only" />Up to {b} zł</label>)}
              </div>
            </fieldset>
          </details>
        </main>
        <div className="pointer-events-none sticky bottom-0 z-10 grid gap-2 bg-gradient-to-t from-paper from-70% to-transparent px-5 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))] *:pointer-events-auto lg:pointer-events-auto lg:static lg:mx-auto lg:w-full lg:max-w-[720px] lg:bg-none lg:pb-8">
          <SelectionCount formId="table-form" name="dish" />
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-full border border-wine bg-wine px-5 text-[15px] font-semibold text-on-wine hover:bg-wine-deep disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine">Find a bottle for the table</button>
        </div>
      </form>
    </>
  );
}
