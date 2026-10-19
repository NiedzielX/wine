import { IMPORT_LIMITS, defaultSalesPeriod, type SalesKpiService } from '@wine-match/core';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { PanelExplain } from '../../../_components/explain';
import { Flash, ReadOnlyNotice } from '../../../_components/flash';
import { first } from '../../../_components/format';
import { DoneStep, PreviewStep, UploadStep } from '../../../_components/import-screen';
import { SalesAttachRate, type AttachRateResult } from '../../../_components/sales-attach-rate';
import { requireAccess } from '@/server/auth';
import { getI18n } from '@/server/i18n';
import { isDomainError } from '@/server/domain-errors';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.importSales };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * A13 — import sales from the POS (spec 2026-10-15-pos-sales-import-attach-rate): upload, check and correct (with one
 * decision per unrecognised category), confirm (phase 1); under the upload step, the Wine Attach Rate of a period chosen
 * with a GET form `from` / `to` (phase 2), by default the 28 days ending on the last day with data.
 */
export default async function ImportSalesPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireAccess(slug);
  const canImport = access.can('import.manage');
  const { importService, salesKpiService, clock } = (await getRequestScope()).cradle;
  const jobId = first(sp.job);
  const path = `/admin/${slug}/import/sales`;
  const { locale, t } = await getI18n();
  const m = t.admin.import.sales;

  let body = null;
  let attach = null;
  if (canImport && jobId) {
    const job = await importService.get(slug, jobId).catch((e: unknown) => {
      if (isDomainError(e, 'not_found')) return null;
      throw e;
    });
    if (!job || job.kind !== 'sales') notFound();
    body = job.status === 'preview_ready'
      ? <PreviewStep slug={slug} job={job} back={`${path}?job=${job.id}`} locale={locale} t={t} sales={await importService.salesPreview(slug, job.id)} />
      : <DoneStep slug={slug} job={job} locale={locale} t={t} />;
  } else if (canImport) {
    body = <UploadStep slug={slug} kind="sales" recent={await importService.recent(slug, 'sales')} back={path} locale={locale} t={t} />;
    const range = await salesKpiService.dataRange(slug);
    const asked = { from: first(sp.from), to: first(sp.to) };
    const period = asked.from || asked.to ? asked : defaultSalesPeriod(range, clock.now());
    attach = <SalesAttachRate action={path} period={period} range={range} result={await attachRate(salesKpiService, slug, period)} locale={locale} t={t} />;
  }

  return (
    <Page>
      <PageHeader title={m.title} description={m.description} />
      <PanelExplain id="sales" className="mb-5" summary={t.admin.explain.sales.summary} points={t.admin.explain.sales.points(IMPORT_LIMITS.maxRows)} />
      {!canImport && <ReadOnlyNotice>{t.admin.import.readOnly}</ReadOnlyNotice>}
      <Flash saved={first(sp.saved)} error={first(sp.error)} n={first(sp.n)} />
      {body}
      {attach && <div className="mt-6">{attach}</div>}
    </Page>
  );
}

/** The KPIs of the period; a period the service refuses (`invalid_period`) is shown as an error in the card. */
async function attachRate(service: SalesKpiService, slug: string, period: { from: string; to: string }): Promise<AttachRateResult> {
  try {
    return { ok: true, kpis: await service.getSalesKpis(slug, period) };
  } catch (e) {
    if (isDomainError(e, 'invalid_period')) return { ok: false };
    throw e;
  }
}
