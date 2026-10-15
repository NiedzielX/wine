import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Page, PageHeader } from '../../_components/admin-shell';
import { getI18n } from '@/server/i18n';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.pairings };
}

type Props = { params: Promise<{ slug: string }> };

/** The pairings section opens on the first dish that still has suggestions to review, or the first dish. */
export default async function PairingsIndex({ params }: Props) {
  const { slug } = await params;
  const menu = await (await getRequestScope()).cradle.adminService.menu(slug, {}, (await getI18n()).locale);
  if (!menu) notFound();
  const target = menu.rows.find((r) => r.suggested > 0 && r.dish.status !== 'hidden') ?? menu.rows[0];
  if (target) redirect(`/admin/${slug}/pairings/${target.dish.id}`);
  const { t } = await getI18n();
  return <Page><PageHeader title={t.admin.meta.pairings} description={t.admin.pairings.noDishes} /></Page>;
}
