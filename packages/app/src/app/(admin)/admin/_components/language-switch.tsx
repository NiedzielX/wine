'use client';

import type { Locale } from '@wine-match/core';
import { cn } from '@wine-match/ui';
import { usePathname, useSearchParams } from 'next/navigation';
import { setLanguage } from '../language-actions';

const ORDER: readonly Locale[] = ['pl', 'en'];

/**
 * "Polski | English" of the dashboard and the sign-in page (spec 2026-10-15-polish-language R4, 2026-10-15-bilingual-content
 * R7): each language named in itself; below 640 px "PL" / "EN" are shown and the full name stays the accessible name. one form with a submit
 * button per language, so it works without JavaScript (the server-rendered `back` is the page that was loaded).
 * A client component only because the dashboard layout survives client-side navigation: the current address
 * comes from the router, not from the layout's first render. The action validates `back`.
 */
export function LanguageSwitch({ locale, back, label, titles, className }: {
  locale: Locale; back: string; label: string; titles: Record<Locale, string>; className?: string;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = pathname ? `${pathname}${search ? `?${search}` : ''}` : back;
  return (
    <form action={setLanguage} aria-label={label} className={cn('inline-flex items-center text-sm', className)}>
      <input type="hidden" name="back" value={here} />
      {ORDER.map((l, i) => (
        <span key={l} className="inline-flex items-center">
          {i > 0 && <span aria-hidden="true" className="text-muted-foreground">|</span>}
          <button
            type="submit"
            name="lang"
            value={l}
            lang={l}
            aria-current={l === locale ? 'true' : undefined}
            aria-label={titles[l]}
            className={cn(
              'min-h-9 min-w-9 rounded-md px-2 font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              l === locale && 'text-foreground underline underline-offset-4'
            )}
          >
            <span aria-hidden="true" className="sm:hidden">{l.toUpperCase()}</span>
            <span aria-hidden="true" className="hidden sm:inline">{titles[l]}</span>
          </button>
        </span>
      ))}
    </form>
  );
}
