import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './guest.css';

export const metadata: Metadata = {
  title: { default: 'Wine Match', template: '%s | Wine Match' },
  description: 'Find the wine for what you are eating tonight, from the restaurant’s own list.'
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#3b0f1c' };

/** Root layout of the guest app (mobile-first, Tailwind only). */
export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col lg:max-w-[1200px] bg-paper sm:shadow-[0_0_0_1px_var(--color-line)]">{children}</div>
      </body>
    </html>
  );
}
