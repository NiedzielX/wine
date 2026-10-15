import { redirect } from 'next/navigation';
import { env } from '@/server/env';

/** The QR code opens /r/{slug}; the bare domain goes to the demo restaurant. */
/** Reads the validated configuration, so it runs per request: `next build` must work with no environment. */
export const dynamic = 'force-dynamic';

export default function Home() {
  redirect(`/r/${env().demoRestaurantSlug}`);
}
