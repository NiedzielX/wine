import '@fontsource-variable/bodoni-moda';
import '@fontsource-variable/hanken-grotesk';
import '@wine-match/ui/styles.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getI18n } from '@/server/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { default: t.admin.meta.dashboard, template: t.admin.meta.titleTemplate } };
}

/**
 * Root layout of the restaurant / sommelier dashboard (desktop-first, shadcn/ui from @wine-match/ui).
 * The language comes from the `wm_lang` cookie, then the browser (spec 2026-10-15-polish-language, R4–R5).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { locale } = await getI18n();
  return (
    <html lang={locale}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
