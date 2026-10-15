import type { Restaurant } from '@wine-match/core';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** The Wine Director line and the staff link, under the menu on the phone landing page. */
export function WineDirectorNote({ restaurant: r }: { restaurant: Restaurant }) {
  const initials = r.wineDirector.split(' ').map((x) => x[0]).join('');
  return (
    <div className="grid gap-4 border-t border-line pt-6">
      <div className="flex items-center gap-3">
        <span className="grid size-[42px] shrink-0 place-items-center rounded-full bg-brass-soft font-serif text-[17px] text-brass" aria-hidden="true">{initials}</span>
        <p><b>Wine list by {r.wineDirector}</b><br /><small className="text-[13px] text-ink-3">Wine Director. Every recommendation follows her pairings.</small></p>
      </div>
      <Link className="text-sm text-ink-2 underline" href={`/r/${r.slug}/staff`}>For staff: quick pairing lookup</Link>
    </div>
  );
}

/**
 * The restaurant's header in its wine colour: address, name, one line of promise and the Wine Director.
 * On the landing page it opens the screen; on desktop it fills the left column. `compact` is the
 * smaller variant beside the menu.
 */
export function RestaurantHero({ restaurant: r, actions, compact = false, short = false }: { restaurant: Restaurant; actions?: ReactNode; compact?: boolean; /** phone landing: no Wine Director line, so the menu starts higher (it moves under the menu) */ short?: boolean }) {
  const initials = r.wineDirector.split(' ').map((x) => x[0]).join('');
  return (
    <section className={`flex flex-col justify-between bg-wine-deep px-6 text-on-wine ${compact ? 'min-h-[calc(100dvh-57px)] py-8' : 'pt-[calc(28px+env(safe-area-inset-top))] pb-7 lg:min-h-dvh lg:py-10'}`}>
      <div>
        <p className="text-sm opacity-80">{r.address}, {r.city}</p>
        <h1 className={`mt-4 mb-3.5 font-serif leading-[0.9] font-normal tracking-tight ${compact ? 'text-[clamp(48px,5vw,72px)]' : 'text-[clamp(56px,18vw,104px)]'}`}>{r.name}</h1>
        <p className="max-w-[30ch] text-lg leading-snug opacity-90">Find the wine for what you’re eating tonight, from our own list.</p>
      </div>
      {actions}
      {!short && <div className="mt-8 flex items-center gap-3">
        <span className="grid size-[42px] shrink-0 place-items-center rounded-full bg-on-wine/15 font-serif text-[17px]" aria-hidden="true">{initials}</span>
        <p><b>Wine list by {r.wineDirector}</b><br /><small className="text-[13px] opacity-75">Wine Director. Every recommendation follows her pairings.</small></p>
      </div>}
      {!compact && !short && <Link className="mt-4 text-sm underline opacity-80" href={`/r/${r.slug}/staff`}>For staff: quick pairing lookup</Link>}
    </section>
  );
}
