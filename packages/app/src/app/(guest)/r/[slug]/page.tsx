import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '../../_components/guest-ui';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const menu = await (await getRequestScope()).cradle.catalogService.publishedMenu(slug);
  return { title: menu?.restaurant.name ?? 'Menu' };
}

/** G0 — restaurant landing: what the QR code opens. */
export default async function LandingPage({ params }: Props) {
  const { slug } = await params;
  const menu = await (await getRequestScope()).cradle.catalogService.publishedMenu(slug);
  if (!menu) notFound();
  const r = menu.restaurant;
  const initials = r.wineDirector.split(' ').map((x) => x[0]).join('');
  const hasMenu = menu.dishes.length > 0;

  return (
    <main className="flex flex-1 flex-col">
      <section className="flex min-h-[78dvh] flex-col justify-between bg-wine-deep px-6 pt-[calc(28px+env(safe-area-inset-top))] pb-7 text-on-wine">
        <div>
          <p className="text-sm opacity-80">{r.address}, {r.city}</p>
          <h1 className="mt-4 mb-3.5 font-serif text-[clamp(64px,22vw,104px)] leading-[0.9] font-normal tracking-tight">{r.name}</h1>
          <p className="max-w-[30ch] text-lg leading-snug opacity-90">Find the wine for what you’re eating tonight, from our own list.</p>
        </div>
        {hasMenu ? (
          <div className="mt-8 grid gap-2.5">
            <Button href={`/r/${r.slug}/menu`} variant="light">Choose your dish</Button>
            <Button href={`/r/${r.slug}/table`} variant="ghost">Pair a bottle for the table</Button>
          </div>
        ) : (
          <p className="mt-8 rounded-xl bg-white/10 px-4 py-3 text-[15px]">Tonight’s menu is being updated. Your waiter can suggest a wine in the meantime.</p>
        )}
      </section>
      <div className="grid gap-4 px-6 pt-5 pb-8">
        <div className="flex items-center gap-3">
          <span className="grid size-[42px] place-items-center rounded-full bg-brass-soft font-serif text-[17px] text-brass" aria-hidden="true">{initials}</span>
          <p><b>Wine list by {r.wineDirector}</b><br /><small className="text-[13px] text-ink-3">Wine Director. Every recommendation follows her pairings.</small></p>
        </div>
        <Link className="text-sm text-ink-2 underline" href={`/r/${r.slug}/staff`}>For staff: quick pairing lookup</Link>
      </div>
    </main>
  );
}
