import { STYLE_LABELS, withServing, withStyleToggled, type Dish, type GuestPreferences, type RecommendationItem, type Wine, type WineStyle } from '@wine-match/core';
import { MatchGlass } from '@wine-match/ui/brand/match-glass';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Presentation building blocks of the guest app. Server components, Tailwind only, no logic. */

export function Seal({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.2 8.2 7.2 10l3.6-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TopBar({ back, title, right }: { back?: string; title: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 grid grid-cols-[44px_1fr_44px] items-center border-b border-line bg-paper/95 px-2 pt-[calc(6px+env(safe-area-inset-top))] pb-1.5 backdrop-blur">
      {back ? (
        <Link href={back} aria-label="Back" className="grid size-11 place-items-center rounded-full hover:bg-ink/5">
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" /></svg>
        </Link>
      ) : <span />}
      <div className="text-center font-serif text-[19px]">{title}</div>
      {right ?? <span />}
    </header>
  );
}

const chipBase = 'inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#d4ccd0] bg-surface px-3.5 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-wine';
const chipOn = 'aria-[current=true]:border-ink aria-[current=true]:bg-ink aria-[current=true]:text-paper';

/** A toggle chip that is a plain link: the state is in the URL. */
export function Chip({ href, active, children }: { href: string; active?: boolean; children: ReactNode }) {
  return <Link href={href} scroll={false} aria-current={active ? 'true' : undefined} className={`${chipBase} ${chipOn}`}>{children}</Link>;
}

const BUTTON_STYLES = {
  primary: 'border-wine bg-wine text-on-wine hover:bg-wine-deep',
  secondary: 'border-[#d4ccd0] bg-surface text-ink',
  quiet: 'border-transparent bg-transparent text-ink hover:bg-ink/5',
  /** on the dark restaurant hero */
  light: 'border-on-wine bg-on-wine text-wine-deep',
  ghost: 'border-on-wine/40 bg-transparent text-on-wine hover:border-on-wine'
} as const;

export function Button({ href, children, variant = 'primary', className = '' }: { href: string; children: ReactNode; variant?: keyof typeof BUTTON_STYLES; className?: string }) {
  const style = BUTTON_STYLES[variant];
  return <Link href={href} className={`inline-flex min-h-11 items-center justify-center rounded-full border px-5 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine ${style} ${className}`}>{children}</Link>;
}

/** Sticky bottom bar for the main action (thumb reach). */
export function BottomBar({ children }: { children: ReactNode }) {
  // the bar itself lets taps through to the content behind its gradient; only the controls catch them
  // on desktop it is a plain block under the content: no thumb reach to optimise for
  return <div className="pointer-events-none sticky bottom-0 z-10 grid gap-2 bg-gradient-to-t from-paper from-70% to-transparent px-5 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))] *:pointer-events-auto lg:pointer-events-auto lg:static lg:mx-auto lg:w-full lg:max-w-[720px] lg:bg-none lg:pb-8">{children}</div>;
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3.5 px-3 py-12 text-center">
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="max-w-[30ch] text-ink-2">{text}</p>
      {action}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p role="status" className="my-4 rounded-[10px] bg-brass-soft px-3.5 py-3 text-[14.5px] text-[#5d4720]">{children}</p>;
}

export function Price({ wine, serving }: { wine: Wine; serving: GuestPreferences['serving'] }) {
  return (
    <p className="flex gap-3 text-[14.5px] tabular-nums">
      {wine.glassPrice !== null && serving !== 'bottle' && <span>Glass {wine.glassPrice} zł</span>}
      {serving !== 'glass' && <span>Bottle {wine.bottlePrice} zł</span>}
    </p>
  );
}

export function Score({ score, colour, showScores, size }: { score: number; colour: string; showScores: boolean; size: number }) {
  return (
    <div className="grid justify-items-center gap-0.5 text-ink-2">
      <MatchGlass score={score} colour={colour} size={size} />
      {showScores && <b className="text-[15px] font-semibold text-ink tabular-nums">{score}%</b>}
      {showScores && <small className="text-[11.5px] text-ink-3">match</small>}
    </div>
  );
}

export function Badges({ item }: { item: RecommendationItem }) {
  if (!item.sommelier && !item.bestValue) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {item.sommelier && <span className="inline-flex items-center gap-1 rounded-full bg-brass-soft px-2.5 text-[12.5px] leading-5 font-semibold text-brass"><Seal className="size-3.5" />Sommelier recommendation</span>}
      {item.bestValue && <span className="rounded-full bg-sage-soft px-2.5 text-[12.5px] leading-5 font-semibold text-sage">Best value</span>}
    </div>
  );
}

export function BestCard({ item, href, serving, showScores, kicker = 'Perfect with your dish' }: { item: RecommendationItem; href: string; serving: GuestPreferences['serving']; showScores: boolean; kicker?: string }) {
  const w = item.wine;
  return (
    <Link href={href} className="mt-6 block rounded-[18px] border border-line bg-surface p-5 focus-visible:outline-2 focus-visible:outline-wine">
      <p className="flex items-center gap-2 text-sm font-semibold text-wine">{item.sommelier && <Seal />}{item.sommelier ? 'Sommelier recommendation' : kicker}</p>
      <div className="mt-3 grid grid-cols-[1fr_auto] items-start gap-4">
        <div>
          <h2 className="font-serif text-[25px] leading-tight">{w.name}</h2>
          <p className="mt-1 text-[15px] text-ink-2">{w.producer}<br />{w.region}, {w.vintage === 'NV' ? 'non-vintage' : w.vintage}</p>
        </div>
        <Score score={item.matchScore} colour={w.colour} showScores={showScores} size={48} />
      </div>
      <p className="mt-4 border-t border-line pt-4 text-[15.5px] leading-normal">{item.why}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Price wine={w} serving={serving} />
        {item.bestValue && <span className="rounded-full bg-sage-soft px-2.5 text-[12.5px] leading-5 font-semibold text-sage">Best value</span>}
      </div>
    </Link>
  );
}

export function WineRow({ item, href, serving, showScores }: { item: RecommendationItem; href: string; serving: GuestPreferences['serving']; showScores: boolean }) {
  const w = item.wine;
  return (
    <Link href={href} className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-line py-4 last:border-b-0 focus-visible:outline-2 focus-visible:outline-wine">
      <div>
        <h3 className="font-serif text-[19px] leading-tight">{w.name}</h3>
        <p className="text-sm text-ink-2">{w.producer}, {w.region} {w.vintage === 'NV' ? '' : w.vintage}</p>
        <p className="mt-1.5 text-sm leading-snug text-ink-2">{item.why}</p>
        <Badges item={item} />
        <div className="mt-2.5"><Price wine={w} serving={serving} /></div>
      </div>
      <Score score={item.matchScore} colour={w.colour} showScores={showScores} size={36} />
    </Link>
  );
}

export function RecoFooter({ director, restaurant }: { director: string; restaurant: string }) {
  return (
    <p className="mt-7 flex items-start gap-2 text-[13.5px] text-ink-3">
      <Seal className="mt-0.5 size-4 shrink-0" />
      <span>Pairings are chosen from {restaurant}’s list and reviewed by {director}, our Wine Director.</span>
    </p>
  );
}

/** One dish / whole table switch above the menu and the table selection. Links carry the guest's preferences. */
export function ModeSwitch({ dishHref, tableHref, mode }: { dishHref: string; tableHref: string; mode: 'dish' | 'table' }) {
  const base = 'rounded-full py-2.5 text-center text-[14.5px] font-semibold text-ink-2 aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:shadow-sm';
  return (
    <nav aria-label="Pairing mode" className="mb-5 grid grid-cols-2 rounded-full bg-[#ebe7e9] p-1">
      <Link href={dishHref} aria-current={mode === 'dish' ? 'page' : undefined} className={base}>One dish</Link>
      <Link href={tableHref} aria-current={mode === 'table' ? 'page' : undefined} className={base}>Whole table</Link>
    </nav>
  );
}

const MENU_CATEGORIES = ['Starters', 'Mains', 'Desserts'] as const;

/**
 * The published dishes grouped by category. Every row links straight to the dish's wines (`hrefFor`),
 * so the guest is one tap from a recommendation; `currentId` marks the dish on screen.
 */
export function DishList({ dishes, coverage, hrefFor, currentId, stickyTop = 'top-[57px]', compact = false }: {
  dishes: Dish[];
  coverage: Map<string, { hasPrimary: boolean }>;
  hrefFor: (dish: Dish) => string;
  currentId?: string;
  /** offset of the sticky category chips: under the top bar, or 0 where there is none */
  stickyTop?: string;
  /** smaller rows for the desktop side column */
  compact?: boolean;
}) {
  const present = MENU_CATEGORIES.filter((c) => dishes.some((d) => d.category === c));
  return (
    <div>
      <nav aria-label="Menu sections" className={`sticky ${stickyTop} z-10 -mx-5 flex gap-1.5 overflow-x-auto bg-paper px-5 py-2.5`}>
        {present.map((c) => <a key={c} href={`#cat-${c.toLowerCase()}`} className="inline-flex min-h-9 items-center rounded-full border border-[#d4ccd0] bg-surface px-3.5 text-sm font-medium">{c}</a>)}
      </nav>
      {present.map((c) => (
        <section key={c} id={`cat-${c.toLowerCase()}`} className="scroll-mt-28">
          <h2 className={`mb-1 font-serif ${compact ? 'mt-5 text-[22px]' : 'mt-7 text-[26px]'}`}>{c}</h2>
          {dishes.filter((d) => d.category === c).map((d) => {
            const current = d.id === currentId;
            return (
              <Link key={d.id} href={hrefFor(d)} aria-current={current ? 'page' : undefined}
                className="-mx-3 grid scroll-mt-28 grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 rounded-xl border-b border-line px-3 py-4 last:border-b-0 hover:bg-ink/[0.03] focus-visible:outline-2 focus-visible:outline-wine aria-[current=page]:bg-surface aria-[current=page]:shadow-[inset_3px_0_0_var(--color-wine)]">
                <span className={`font-serif leading-tight ${compact ? 'text-lg' : 'text-xl'}`}>{d.name}</span>
                <span className="text-[15px] text-ink-2 tabular-nums">{d.price} zł</span>
                {!compact && <span className="col-span-2 text-[14.5px] leading-snug text-ink-2">{d.description}</span>}
                {coverage.get(d.id)?.hasPrimary && <span className="col-span-2 mt-1 flex items-center gap-1.5 text-[13.5px] text-brass"><Seal className="size-3.5" />Sommelier pairing available</span>}
              </Link>
            );
          })}
        </section>
      ))}
    </div>
  );
}

const QUICK_STYLES: WineStyle[] = ['red', 'white', 'sparkling'];

/** How many active preferences the quick row does not show (they live in "More"). */
export function hiddenPrefCount(p: GuestPreferences): number {
  return p.styles.filter((s) => !QUICK_STYLES.includes(s)).length + (p.maxPrice !== null ? 1 : 0) + (p.weight !== 'any' ? 1 : 0) + (p.mood !== 'any' ? 1 : 0);
}

/**
 * One scrollable row of the most used preferences. Each chip is a link that toggles its value,
 * so a second tap clears it; "More" opens the full filters sheet and counts what the row hides.
 */
export function QuickPrefs({ prefs, hrefFor, moreHref }: { prefs: GuestPreferences; hrefFor: (p: GuestPreferences) => string; moreHref: string }) {
  const hidden = hiddenPrefCount(prefs);
  const serving = (s: 'glass' | 'bottle') => hrefFor(withServing(prefs, prefs.serving === s ? 'any' : s));
  return (
    <nav aria-label="Quick preferences" className="-mx-5 flex gap-1.5 overflow-x-auto px-5 py-1 [scrollbar-width:none]">
      <Chip href={moreHref} active={hidden > 0}>More{hidden > 0 ? ` · ${hidden}` : '…'}</Chip>
      <Chip href={serving('glass')} active={prefs.serving === 'glass'}>By the glass</Chip>
      <Chip href={serving('bottle')} active={prefs.serving === 'bottle'}>By the bottle</Chip>
      {QUICK_STYLES.map((s) => <Chip key={s} href={hrefFor(withStyleToggled(prefs, s))} active={prefs.styles.includes(s)}>{STYLE_LABELS[s]}</Chip>)}
    </nav>
  );
}

/**
 * Desktop two-column layout (from `lg`): the side column on the left, the main content on the right.
 * The main content comes first in the DOM so keyboard and screen-reader users start with it.
 * Below `lg` the side column is not shown: the page is the main content alone.
 */
export function GuestColumns({ main, aside, asideLabel, underTopBar = true }: { main: ReactNode; aside: ReactNode; asideLabel: string; /** false on pages without the sticky top bar (the landing page) */ underTopBar?: boolean }) {
  const stick = underTopBar ? 'lg:top-[57px] lg:max-h-[calc(100dvh-57px)]' : 'lg:top-0 lg:max-h-dvh';
  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col">{main}</div>
      <aside aria-label={asideLabel} className={`hidden min-w-0 lg:sticky lg:order-first lg:block lg:self-start ${stick} lg:overflow-y-auto lg:border-r lg:border-line`}>{aside}</aside>
    </div>
  );
}
