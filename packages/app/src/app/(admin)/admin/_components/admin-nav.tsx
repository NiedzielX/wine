'use client';

import { cn } from '@wine-match/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

interface Props { slug: string; reviewCount: number; publishCount: number }

/** Sidebar navigation of the dashboard. Client component only for the active-link state. */
export function AdminNav({ slug, reviewCount, publishCount }: Props) {
  const pathname = usePathname();
  const base = `/admin/${slug}`;
  const items: Array<{ href: string; label: string; exact?: boolean; count?: number; group?: string }> = [
    { href: base, label: 'Dashboard', exact: true },
    { href: `${base}/menu`, label: 'Menu' },
    { href: `${base}/wines`, label: 'Wine list' },
    { href: `${base}/pairings`, label: 'Pairings' },
    { href: `${base}/review`, label: 'Review queue', count: reviewCount },
    { href: `${base}/publish`, label: 'Publish', count: publishCount },
    { href: `${base}/import/menu`, label: 'Import menu', group: 'Restaurant' },
    { href: `${base}/import/wines`, label: 'Import wines' },
    { href: `${base}/setup`, label: 'Setup' },
    { href: `${base}/qr`, label: 'QR code' }
  ];
  return (
    <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
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
