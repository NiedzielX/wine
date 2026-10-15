'use client';

import { cn } from '@wine-match/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

/** Ready-made texts from the dictionary (a client component gets texts, not dictionary functions). */
export interface NavLabels {
  label: string; dashboard: string; menu: string; wines: string; pairings: string; review: string; publish: string;
  restaurant: string; importMenu: string; importWines: string; setup: string; qr: string;
}
interface Props { slug: string; reviewCount: number; publishCount: number; labels: NavLabels }

/** Sidebar navigation of the dashboard. Client component only for the active-link state. */
export function AdminNav({ slug, reviewCount, publishCount, labels: l }: Props) {
  const pathname = usePathname();
  const base = `/admin/${slug}`;
  const items: Array<{ href: string; label: string; exact?: boolean; count?: number; group?: string }> = [
    { href: base, label: l.dashboard, exact: true },
    { href: `${base}/menu`, label: l.menu },
    { href: `${base}/wines`, label: l.wines },
    { href: `${base}/pairings`, label: l.pairings },
    { href: `${base}/review`, label: l.review, count: reviewCount },
    { href: `${base}/publish`, label: l.publish, count: publishCount },
    { href: `${base}/import/menu`, label: l.importMenu, group: l.restaurant },
    { href: `${base}/import/wines`, label: l.importWines },
    { href: `${base}/setup`, label: l.setup },
    { href: `${base}/qr`, label: l.qr }
  ];
  return (
    <nav aria-label={l.label} className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {items.map((i) => {
        const active = i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`);
        return (
          <Fragment key={i.href}>
          {i.group && <span className="hidden px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:block">{i.group}</span>}
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              active && 'bg-card text-foreground shadow-xs ring-1 ring-border'
            )}
          >
            {i.label}
            {i.count ? <span className="ml-auto rounded-full bg-primary px-2 text-xs leading-5 font-semibold text-primary-foreground tabular-nums">{i.count}</span> : null}
          </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
