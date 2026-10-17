import type { Locale, Restaurant } from '@wine-match/core';
import Link from 'next/link';
import { Button } from '@wine-match/ui';
import { logout } from '../auth-actions';
import type { ReactNode } from 'react';
import type { Dictionary } from '@/i18n/en';
import { AdminNav } from './admin-nav';
import { LanguageSwitch } from './language-switch';

/** Tooltips of the language switch: each language by its own name ("Polski", "English"). */
export const languageTitles = (t: Dictionary): Record<Locale, string> => t.common.languageNames;

/**
 * Frame of every dashboard page: sidebar (desktop) or top bar (narrow screens) + content. The language switch is at
 * the top (spec 2026-10-15-bilingual-content, R7): in the content's top bar on desktop, in the header row on narrow screens.
 */
export function AdminShell({ restaurant, reviewCount, publishCount, user, locale, t, back, children }: {
  restaurant: Restaurant; reviewCount: number; publishCount: number; user: { name: string; role: string };
  /** interface language and its texts; `back` is the current page, where the language switch returns */
  locale: Locale; t: Dictionary; back: string; children: ReactNode;
}) {
  const { nav } = t.admin;
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 border-b bg-sidebar p-4 print:hidden lg:sticky lg:top-0 lg:h-dvh lg:gap-6 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:py-6">
        <div className="flex items-center justify-between gap-3 px-1 lg:block">
          <span className="font-serif text-xl">Wine Match</span>
          <div className="ml-auto min-w-0 text-right lg:mt-4 lg:ml-0 lg:rounded-lg lg:border lg:bg-card lg:p-3 lg:text-left">
            <b className="block font-serif text-lg leading-tight font-medium">{restaurant.name}</b>
            <small className="hidden text-xs text-muted-foreground lg:block">{restaurant.address}, {restaurant.city}</small>
          </div>
          <LanguageSwitch locale={locale} back={back} label={t.admin.language.label} titles={languageTitles(t)} className="lg:hidden" />
        </div>
        <AdminNav slug={restaurant.slug} reviewCount={reviewCount} publishCount={publishCount} labels={{ label: nav.label, dashboard: nav.dashboard, menu: nav.menu, wines: nav.wines, pairings: nav.pairings, review: nav.review, opportunities: nav.opportunities, publish: nav.publish, restaurant: nav.restaurant, importMenu: nav.importMenu, importWines: nav.importWines, setup: nav.setup, qr: nav.qr }} />
        <div className="hidden px-3 text-sm lg:mt-auto lg:block">
          <Link href={`/r/${restaurant.slug}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t.admin.common.openGuestApp}</Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-2">
          <div className="min-w-0"><b className="block truncate font-medium">{user.name}</b><small className="text-xs text-muted-foreground">{user.role}</small></div>
          <form action={logout}><Button type="submit" variant="outline" size="sm">{nav.signOut}</Button></form>
        </div>
      </aside>
      <div className="min-w-0">
        <div className="hidden items-center justify-between gap-4 border-b px-10 py-2 print:hidden lg:flex">
          <span className="truncate text-sm text-muted-foreground"><b className="font-medium text-foreground">{restaurant.name}</b> · {restaurant.city}</span>
          <LanguageSwitch locale={locale} back={back} label={t.admin.language.label} titles={languageTitles(t)} />
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Standard content width and padding of dashboard pages. A page is the `main` landmark; a loading skeleton
 * (`as="div"`) must not be, or the streamed page would briefly have two.
 */
export function Page({ children, as: Tag = 'main' }: { children: ReactNode; as?: 'main' | 'div' }) {
  return <Tag className="mx-auto w-full px-4 py-6 lg:px-10 lg:py-8">{children}</Tag>;
}

export function PageHeader({ title, description, back, actions }: { title: string; description?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode }) {
  return (
    <header className="mb-6">
      {back && <Link href={back.href} className="mb-2 inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">← {back.label}</Link>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl leading-tight tracking-tight lg:text-4xl">{title}</h1>
          {description && <p className="mt-1.5 max-w-prose text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
