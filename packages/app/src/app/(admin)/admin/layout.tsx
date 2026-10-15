import '@fontsource-variable/bodoni-moda';
import '@fontsource-variable/hanken-grotesk';
import '@wine-match/ui/styles.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: { default: 'Dashboard', template: '%s | Wine Match dashboard' } };

/** Root layout of the restaurant / sommelier dashboard (desktop-first, shadcn/ui from @wine-match/ui). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
