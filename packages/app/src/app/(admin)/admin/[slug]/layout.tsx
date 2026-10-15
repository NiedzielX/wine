import { roleLabel } from '@wine-match/core';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminShell } from '../_components/admin-shell';
import { requireAccess } from '@/server/auth';
import { getRequestScope } from '@/server/request-scope';

type Props = { children: ReactNode; params: Promise<{ slug: string }> };

/**
 * Frame of the restaurant dashboard and its front door: nobody gets past here without a session and a
 * membership in this restaurant (server actions and API routes check again on their own).
 */
export default async function RestaurantAdminLayout({ children, params }: Props) {
  const { slug } = await params;
  const access = await requireAccess(slug);
  const overview = await (await getRequestScope()).cradle.adminService.overview(slug);
  if (!overview) notFound();
  return (
    <AdminShell
      restaurant={overview.restaurant}
      reviewCount={overview.review.suggestions}
      publishCount={overview.unpublishedChanges}
      user={{ name: access.principal.user.name, role: roleLabel(access.membership.role) }}
    >
      {children}
    </AdminShell>
  );
}
