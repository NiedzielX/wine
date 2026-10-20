import type { Restaurant } from '@wine-match/core';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Dictionary } from '@/i18n/en';

/**
 * The Wine Director line, the link to "How we pick your wine" (G12) and the staff link, under the menu on the phone
 * landing page. Both links come ready from the page (`howHref` with the guest's `lang` and `sid`, `staffHref` without
 * the guest's session): this component builds no address.
 */
export function WineDirectorNote({ restaurant: r, howHref, staffHref, t }: { restaurant: Restaurant; howHref: string; staffHref: string; t: Dictionary }) {
  const initials = r.wineDirector.split(' ').map((x) => x[0]).join('');
  const link = 'inline-flex min-h-11 items-center text-small text-ink-2 underline focus-visible:outline-2 focus-visible:outline-wine';
  return (
    <div className="grid gap-4 border-t border-line pt-6">
      <div className="flex items-center gap-3">
        <span className="grid size-[42px] shrink-0 place-items-center rounded-full bg-brass-soft font-serif text-lead text-brass-ink" aria-hidden="true">{initials}</span>
        <p><b>{t.guest.hero.wineListBy(r.wineDirector)}</b><br /><small className="text-small text-ink-3">{t.guest.hero.directorLine}</small></p>
      </div>
      <div className="grid justify-items-start">
        <Link className={link} href={howHref}>{t.guest.hero.howLink}</Link>
        <Link className={link} href={staffHref}>{t.guest.hero.staffLink}</Link>
      </div>
    </div>
  );
}

/**
 * The restaurant's header in its wine colour: address, name, one line of promise and the Wine Director.
 * On the landing page it opens the screen; on desktop it fills the left column. `compact` is the
 * smaller variant beside the menu. `langSwitch` sits top right (the landing page has no top bar).
 */
export function RestaurantHero({ restaurant: r, actions, compact = false, short = false, t, staffHref, howHref, langSwitch }: {
  restaurant: Restaurant;
  actions?: ReactNode;
  compact?: boolean;
  /** phone landing: no Wine Director line, so the menu starts higher (it moves under the menu) */
  short?: boolean;
  t: Dictionary;
  /** the staff lookup link; shown on the full hero only */
  staffHref?: string;
  /** the link to "How we pick your wine" (G12), ready from the page; shown on the full hero only, beside the staff link */
  howHref?: string;
  langSwitch?: ReactNode;
}) {
  const initials = r.wineDirector.split(' ').map((x) => x[0]).join('');
  return (
    <section className={`flex flex-col justify-between bg-wine-deep px-6 text-on-wine ${compact ? 'min-h-[calc(100dvh-57px)] py-8' : 'pt-[calc(28px+env(safe-area-inset-top))] pb-7 lg:min-h-dvh lg:py-10'}`}>
      <div>
        <div className={`flex items-start justify-between gap-3 ${langSwitch ? '-mt-3 -mr-3' : ''}`}>
          <p className={`min-w-0 text-small opacity-80 ${langSwitch ? 'pt-3' : ''}`}>{r.address}, {r.city}{r.tagline && <><br /><span>{r.tagline}</span></>}</p>
          {langSwitch}
        </div>
        <h1 className={`mt-4 mb-3.5 font-serif leading-[0.9] font-normal tracking-tight ${compact ? 'text-[clamp(48px,5vw,72px)]' : 'text-[clamp(56px,18vw,104px)]'}`}>{r.name}</h1>
        <p className="max-w-[30ch] text-lead leading-snug opacity-90">{t.guest.hero.promise}</p>
      </div>
      {actions}
      {!short && <div className="mt-8 flex items-center gap-3">
        <span className="grid size-[42px] shrink-0 place-items-center rounded-full bg-on-wine/15 font-serif text-lead" aria-hidden="true">{initials}</span>
        <p><b>{t.guest.hero.wineListBy(r.wineDirector)}</b><br /><small className="text-small opacity-75">{t.guest.hero.directorLine}</small></p>
      </div>}
      {!compact && !short && (howHref || staffHref) && (
        <div className="mt-4 flex flex-wrap gap-x-5">
          {/* full on-wine colour on wine-deep (no opacity): small text needs 4.5:1 (R2) */}
          {howHref && <Link className="inline-flex min-h-11 items-center text-small text-on-wine underline focus-visible:outline-2 focus-visible:outline-on-wine" href={howHref}>{t.guest.hero.howLink}</Link>}
          {staffHref && <Link className="inline-flex min-h-11 items-center text-small underline opacity-80" href={staffHref}>{t.guest.hero.staffLink}</Link>}
        </div>
      )}
    </section>
  );
}
