import { redirect } from 'next/navigation';
import { env } from '@/server/env';

/**
 * The QR code opens /r/{slug}; the bare domain goes to the demo restaurant, on every instance. The interactive demo instance used to go
 * to `/start` here (spec 2026-11-16-interactive-demo-entry R8); the owner's review of 2026-11-16 took that back: `/` is the guest view
 * again, and the guest view carries a button to `/start` (`DemoRibbon`).
 */
/** Reads the validated configuration, so it runs per request: `next build` must work with no environment. */
export const dynamic = 'force-dynamic';

export default function Home() {
  redirect(`/r/${env().demoRestaurantSlug}`);
}
