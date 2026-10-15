import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { Flash, ReadOnlyNotice } from '../../../_components/flash';
import { first } from '../../../_components/format';
import { DoneStep, PreviewStep, UploadStep } from '../../../_components/import-screen';
import { requireAccess } from '@/server/auth';
import { getI18n } from '@/server/i18n';
import { isDomainError } from '@/server/domain-errors';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.importMenu };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A8 — import the menu: upload, check and correct, confirm. */
export default async function ImportMenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireAccess(slug);
  const canImport = access.can('import.manage');
  const { importService } = (await getRequestScope()).cradle;
  const jobId = first(sp.job);
  const path = `/admin/${slug}/import/menu`;
  const { locale, t } = await getI18n();
  const m = t.admin.import;

  let body;
  if (jobId) {
    const job = await importService.get(slug, jobId).catch((e: unknown) => {
      if (isDomainError(e, 'not_found')) return null;
      throw e;
    });
    if (!job || job.kind !== 'menu') notFound();
    body = job.status === 'preview_ready' ? <PreviewStep slug={slug} job={job} back={`${path}?job=${job.id}`} locale={locale} t={t} /> : <DoneStep slug={slug} job={job} locale={locale} t={t} />;
  } else {
    body = <UploadStep slug={slug} kind="menu" recent={await importService.recent(slug, 'menu')} back={path} locale={locale} t={t} />;
  }

  return (
    <Page>
      <PageHeader title={m.menuTitle} description={m.menuDescription} />
      {!canImport && <ReadOnlyNotice>{m.readOnly}</ReadOnlyNotice>}
      <Flash saved={first(sp.saved)} error={first(sp.error)} n={first(sp.n)} />
      {canImport ? body : null}
    </Page>
  );
}
