import { tasteWords } from '@wine-match/core';
import type { Metadata } from 'next';
import { BottomBar, Button, EmptyState, TopBar } from '../../../../_components/guest-ui';
import { PrefChips } from '../../../../_components/pref-chips';
import { guestContext, hrefWith, notFound, type SearchParams } from '@/server/guest-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your dish' };

type Props = { params: Promise<{ slug: string; dishId: string }>; searchParams: SearchParams };

/** G2 — dish details with the optional quick preferences. */
export default async function DishPage({ params, searchParams }: Props) {
  const { slug, dishId } = await params;
  const { prefs, services } = await guestContext(searchParams);
  const found = await services.catalogService.publishedDish(slug, dishId);
  if (!found) {
    const menu = await services.catalogService.publishedMenu(slug);
    if (!menu) notFound();
    return (
      <>
        <TopBar back={`/r/${slug}/menu`} title={menu.restaurant.name} />
        <main className="flex-1 px-5">
          <EmptyState title="This dish isn’t on tonight’s menu" text="Choose another dish from the menu." action={<Button href={`/r/${slug}/menu`} variant="secondary">Back to menu</Button>} />
        </main>
      </>
    );
  }
  const { dish } = found;
  const path = `/r/${slug}/dish/${dish.id}`;

  return (
    <>
      <TopBar back={`/r/${slug}/menu`} title={found.restaurant.name} />
      <main className="flex-1 px-5 pt-5 pb-8">
        <h1 className="font-serif text-4xl leading-[1.08] tracking-tight">{dish.name}</h1>
        <p className="mt-2.5 max-w-[34ch] text-ink-2">{dish.description}</p>
        <p className="mt-2.5 tabular-nums">{dish.price} zł</p>
        <ul aria-label="Taste" className="mt-4 flex flex-wrap gap-1.5">
          {tasteWords(dish).map((w) => <li key={w} className="rounded-full bg-[#ebe7e9] px-2.5 py-1 text-[13.5px] text-ink-2">{w}</li>)}
        </ul>
        <div className="mt-7"><PrefChips prefs={prefs} hrefFor={(p) => hrefWith(path, p)} /></div>
        <p className="mt-4 text-[13px] text-ink-3">All optional. Skip straight to the wines if you like.</p>
      </main>
      <BottomBar><Button href={hrefWith(`${path}/wines`, prefs)}>Show matching wines</Button></BottomBar>
    </>
  );
}
