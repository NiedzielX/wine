import { redirect } from 'next/navigation';
import { demoStartSlug } from '@/server/demo-entry';
import { env } from '@/server/env';

/**
 * The QR code opens /r/{slug}; the bare domain goes to the demo restaurant. On the interactive demo instance it goes to the start page
 * (spec 2026-11-16-interactive-demo-entry, R8); anywhere else nothing changes.
 */
/** Reads the validated configuration, so it runs per request: `next build` must work with no environment. */
export const dynamic = 'force-dynamic';

export default function Home() {
  if (demoStartSlug()) redirect('/start');
  redirect(`/r/${env().demoRestaurantSlug}`);
}
