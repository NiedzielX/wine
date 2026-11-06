import '@fontsource-variable/bodoni-moda';
import '@fontsource-variable/hanken-grotesk';
import '@wine-match/ui/styles.css';
import './showcase.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { getI18n } from '@/server/i18n';

/** Showcase pages are for people who got a link, never for search engines (R11); the same is said in `X-Robots-Tag` (next.config.ts). */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { default: 'Wine Match', template: '%s | Wine Match' }, description: t.showcase.meta.description, robots: { index: false, follow: false } };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

/**
 * Root layout of the public sales showcase under `/demo` (spec 2026-11-04-sales-demo-and-roi-calculator, Q14): its own root layout
 * group next to `(guest)` and `(admin)`, desktop-first with the shadcn theme of the dashboard, and a print layout. Local fonts only;
 * no cookies, no scripts of its own except the print button of the summary.
 */
export default async function ShowcaseLayout({ children }: { children: ReactNode }) {
  const { locale } = await getI18n();
  return (
    <html lang={locale}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
