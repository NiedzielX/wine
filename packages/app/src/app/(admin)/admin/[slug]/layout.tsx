import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminShell } from '../_components/admin-shell';
import { ErrorTextsProvider } from '../_components/error-texts';
import { requireAccess, safeNext } from '@/server/auth';
import { getI18n } from '@/server/i18n';
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
  const { locale, t } = await getI18n();
  const back = safeNext((await headers()).get('x-pathname')) ?? `/admin/${slug}`;
  return (
    <AdminShell
      restaurant={overview.restaurant}
      reviewCount={overview.review.suggestions}
      publishCount={overview.unpublishedChanges}
      user={{ name: access.principal.user.name, role: t.admin.roles[access.membership.role] }}
      locale={locale}
      t={t}
      back={back}
    >
      <ErrorTextsProvider value={t.admin.error}>{children}</ErrorTextsProvider>
    </AdminShell>
  );
}
