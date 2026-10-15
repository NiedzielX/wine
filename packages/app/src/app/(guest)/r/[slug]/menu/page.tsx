import type { Metadata } from 'next';
import Link from 'next/link';
import { ModeSwitch, Seal, TopBar } from '../../../_components/guest-ui';
import { CATEGORIES, notFound } from '@/server/guest-page';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Menu' };

type Props = { params: Promise<{ slug: string }> };

/** G1 — dish list. */
export default async function MenuPage({ params }: Props) {
  const { slug } = await params;
  const { catalogService } = (await getRequestScope()).cradle;
  const menu = await catalogService.publishedMenu(slug);
  if (!menu) notFound();
  const coverage = await catalogService.pairingCoverage(menu.restaurant.id);

  return (
    <>
      <TopBar back={`/r/${slug}`} title={menu.restaurant.name} />
      <main className="flex-1 px-5 pt-5 pb-8">
        <ModeSwitch slug={slug} mode="dish" />
        {menu.dishes.length === 0 ? (
          <div className="py-12 text-center">
            <h2 className="font-serif text-2xl">Tonight’s menu is being updated</h2>
            <p className="mt-2 text-ink-2">Your waiter can suggest a wine in the meantime.</p>
          </div>
        ) : (
          <>
            <p className="text-ink-2">Pick the dish you’re ordering.</p>
            <nav aria-label="Menu sections" className="sticky top-[57px] z-10 -mx-5 mt-2 flex gap-1.5 overflow-x-auto bg-paper px-5 py-2.5">
              {CATEGORIES.filter((c) => menu.dishes.some((d) => d.category === c)).map((c) => (
                <a key={c} href={`#cat-${c.toLowerCase()}`} className="inline-flex min-h-9 items-center rounded-full border border-[#d4ccd0] bg-surface px-3.5 text-sm font-medium">{c}</a>
              ))}
            </nav>
            {CATEGORIES.map((c) => {
              const list = menu.dishes.filter((d) => d.category === c);
              if (!list.length) return null;
              return (
                <section key={c} id={`cat-${c.toLowerCase()}`} className="scroll-mt-28">
                  <h2 className="mt-7 mb-1 font-serif text-[26px]">{c}</h2>
                  {list.map((d) => (
                    <Link key={d.id} href={`/r/${slug}/dish/${d.id}`} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 border-b border-line py-4 last:border-b-0 focus-visible:outline-2 focus-visible:outline-wine">
                      <span className="font-serif text-xl leading-tight">{d.name}</span>
                      <span className="text-[15px] text-ink-2 tabular-nums">{d.price} zł</span>
                      <span className="col-span-2 text-[14.5px] leading-snug text-ink-2">{d.description}</span>
                      {coverage.get(d.id)?.hasPrimary && <span className="col-span-2 mt-1 flex items-center gap-1.5 text-[13.5px] text-brass"><Seal className="size-3.5" />Sommelier pairing available</span>}
                    </Link>
                  ))}
                </section>
              );
            })}
          </>
        )}
      </main>
    </>
  );
}
