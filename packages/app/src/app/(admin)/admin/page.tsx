import { redirect } from 'next/navigation';
import { getPrincipal } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** /admin: sign in, or go to the first restaurant the user can manage. */
export default async function AdminHome() {
  const principal = await getPrincipal();
  if (!principal) redirect('/admin/login');
  const first = principal.memberships.find((m) => m.role !== 'waiter');
  if (!first) redirect('/admin/login?error=no_panel_access');
  redirect(`/admin/${first.restaurantSlug}`);
}
