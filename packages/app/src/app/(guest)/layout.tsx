import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { getI18n, getLocale } from '@/server/i18n';
import './guest.css';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { default: 'Wine Match', template: '%s | Wine Match' }, description: t.guest.meta.description };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#3b0f1c' };

/** Root layout of the guest app (mobile-first, Tailwind only). `lang` follows the request's language. */
export default async function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={await getLocale()}>
      <body>
        <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col lg:max-w-[1200px] bg-paper sm:shadow-[0_0_0_1px_var(--color-line)]">{children}</div>
      </body>
    </html>
  );
}
