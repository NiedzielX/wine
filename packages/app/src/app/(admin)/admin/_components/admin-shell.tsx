import type { Restaurant } from '@wine-match/core';
import Link from 'next/link';
import { Button } from '@wine-match/ui';
import { logout } from '../auth-actions';
import type { ReactNode } from 'react';
import { AdminNav } from './admin-nav';

/** Frame of every dashboard page: sidebar (desktop) or top bar (narrow screens) + content. */
export function AdminShell({ restaurant, reviewCount, publishCount, user, children }: { restaurant: Restaurant; reviewCount: number; publishCount: number; user: { name: string; role: string }; children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 border-b bg-sidebar p-4 print:hidden lg:sticky lg:top-0 lg:h-dvh lg:gap-6 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:py-6">
        <div className="flex items-baseline justify-between gap-3 px-1 lg:block">
          <span className="font-serif text-xl">Wine Match</span>
          <div className="text-right lg:mt-4 lg:rounded-lg lg:border lg:bg-card lg:p-3 lg:text-left">
            <b className="block font-serif text-lg leading-tight font-medium">{restaurant.name}</b>
            <small className="hidden text-xs text-muted-foreground lg:block">{restaurant.address}, {restaurant.city}</small>
          </div>
        </div>
        <AdminNav slug={restaurant.slug} reviewCount={reviewCount} publishCount={publishCount} />
        <div className="hidden px-3 text-sm lg:mt-auto lg:block">
          <Link href={`/r/${restaurant.slug}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Open guest app</Link>
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm lg:flex-col lg:items-stretch lg:gap-2">
          <div className="min-w-0"><b className="block truncate font-medium">{user.name}</b><small className="text-xs text-muted-foreground">{user.role}</small></div>
          <form action={logout}><Button type="submit" variant="outline" size="sm" className="lg:w-full">Sign out</Button></form>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Standard content width and padding of dashboard pages. A page is the `main` landmark; a loading skeleton
 * (`as="div"`) must not be, or the streamed page would briefly have two.
 */
export function Page({ children, as: Tag = 'main' }: { children: ReactNode; as?: 'main' | 'div' }) {
  return <Tag className="mx-auto max-w-6xl px-4 py-6 lg:px-10 lg:py-8">{children}</Tag>;
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
