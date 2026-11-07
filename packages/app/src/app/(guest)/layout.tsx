import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { DemoRibbon } from './_components/demo-ribbon';
import { env } from '@/server/env';
import { getDictionary, getI18n, getLocale } from '@/server/i18n';
import './guest.css';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  // the demo instance is for people who got a link, on all its pages, not only under /demo (E22 R11); read per request, never at build time
  return {
    title: { default: 'Wine Match', template: '%s | Wine Match' }, description: t.guest.meta.description,
    ...(env().showcaseMode === 'demo' ? { robots: { index: false, follow: false } } : {})
  };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#3b0f1c' };

/** Root layout of the guest app (mobile-first, Tailwind only). `lang` follows the request's language. */
export default async function GuestLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-paper sm:shadow-[0_0_0_1px_var(--color-line)] md:max-w-none md:shadow-none">
          {env().showcaseMode === 'demo' && <DemoRibbon locale={locale} t={getDictionary(locale)} />}
          {children}
        </div>
      </body>
    </html>
  );
}
