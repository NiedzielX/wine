import { PROOF_MAX_WINDOW } from '@wine-match/core';
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorMessage, Input } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden } from 'next/navigation';
import { Hidden } from '../../_components/action-form';
import { Page, PageHeader } from '../../_components/admin-shell';
import { Flash } from '../../_components/flash';
import { formatDateTime, formatDay } from '../../_components/format';
import { CodesCard, ProofExplain, ProofGroups, ProofResult, ProofWindowsTable } from '../../_components/proof-parts';
import { setProofLaunchDay } from '../proof-actions';
import { requireAccess } from '@/server/auth';
import { getI18n } from '@/server/i18n';
import { loadProofView, proofFacts } from '@/server/proof-view';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.proof };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * A33 — the results report (spec 2026-11-18-owner-proof-report, R4 to R9, R15): Wine Attach Rate before (the 28 days before the
 * launch day) and after (28-day windows), with its uncertainty, an honest "not enough data", the checks with and without a code
 * (a correlation, never a cause), the codes of the window and what the report does not say. For owner and general manager
 * (`proof.view`); the Wine Director gets 403. Plain links (`?window=`) and one plain form (the launch day), so everything works
 * without JavaScript. Outside `(lists)`: no `loading.tsx` (it would turn the 403 into a 200 and the page needs no script).
 */
export default async function ProofPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireAccess(slug);
  if (!access.can('proof.view')) forbidden();
  const canManage = access.can('proof.manage');
  const { locale, t } = await getI18n();
  const m = t.admin.proof;
  const c = (await getRequestScope()).cradle;
  const path = `/admin/${slug}/proof`;

  const view = await loadProofView(c, slug, one(sp.window));
  if (!view) {
    return (
      <Page>
        <PageHeader title={m.title} description={m.description} />
        <ErrorMessage compact title={m.invalidWindowTitle} message={m.invalidWindowText(PROOF_MAX_WINDOW)} action={<Button asChild variant="outline"><Link href={path}>{m.invalidWindowAction}</Link></Button>} />
      </Page>
    );
  }

  const { result, all, started } = view;
  const { report: r, launch } = result;
  const day = (d: string) => formatDay(d, locale);
  const noLaunch = r.reasons.includes('no_launch_day');
  const noImport = r.reasons.includes('no_sales_import');
  const { facts, baselineFacts } = proofFacts(r, day);

  const launchCard = (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{m.launchTitle}</CardTitle>
        <CardDescription>{m.launchHelp}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {launch.current && <p className="text-sm">{m.launchSet(day(launch.current.launchDay), t.admin.roles[launch.current.setByRole as keyof typeof t.admin.roles] ?? launch.current.setByRole, launch.changes)}</p>}
        {canManage ? (
          <form action={setProofLaunchDay} className="grid max-w-xl gap-3">
            <Hidden fields={{ slug, back: path, expectedCurrent: launch.current?.id ?? '' }} />
            <label className="grid gap-1 text-sm font-medium">
              {m.launchLabel}
              <Input name="launchDay" type="date" required min="2020-01-01" defaultValue={launch.current?.launchDay ?? ''} className="max-w-48" />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {m.reasonLabel}
              <Input name="reason" type="text" maxLength={200} required={launch.current !== null} />
              <span className="text-xs font-normal text-muted-foreground">{launch.current ? m.reasonLater : m.reasonFirst}</span>
            </label>
            <div><Button type="submit">{m.save}</Button></div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{m.readOnly}</p>
        )}
        {launch.history.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">{m.historyTitle}</h3>
            <ol className="grid gap-2 text-sm">
              {launch.history.map((h) => (
                <li key={h.id}>
                  {m.historyEntry(h.seq, day(h.launchDay), t.admin.roles[h.setByRole as keyof typeof t.admin.roles] ?? h.setByRole, formatDateTime(h.setAt, locale))}
                  {h.afterWindow1 && <Badge variant="outline" className="ml-2">{m.launchChangedLate}</Badge>}
                  {h.reason && <div className="text-muted-foreground">{m.historyReason(h.reason)}</div>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const explain = <ProofExplain r={r} m={m} />;

  if (noLaunch || noImport) {
    return (
      <Page>
        <PageHeader title={m.title} description={m.description} />
        <Flash saved={one(sp.saved)} error={one(sp.error)} />
        <Card className="mb-6">
          {noLaunch ? (
            <EmptyState title={m.emptyNoLaunchTitle} description={canManage ? m.emptyNoLaunchText : m.emptyNoLaunchReadOnly} />
          ) : (
            <EmptyState title={m.emptyNoImportTitle} description={m.emptyNoImportText} action={<Button asChild><Link href={`/admin/${slug}/import/sales`}>{m.emptyNoImportAction}</Link></Button>} />
          )}
        </Card>
        {launchCard}
        {explain}
      </Page>
    );
  }

  const w = result.window;
  const prev = w > 1 ? `${path}?window=${w - 1}` : null;
  const next = started(w + 1) ? `${path}?window=${w + 1}` : null;
  const period = r.window ? m.window(w, day(r.window.period.from), day(r.window.period.to)) : '';

  return (
    <Page>
      <PageHeader title={m.title} description={m.description} actions={<Button asChild variant="outline"><Link href={`${path}/print?window=${result.window}`}>{m.print}</Link></Button>} />
      <Flash saved={one(sp.saved)} error={one(sp.error)} />

      <nav aria-label={m.windowNav} className="mb-4 flex flex-wrap items-center gap-3">
        {prev ? <Button asChild variant="outline" size="sm"><Link href={prev}>← {m.prev}</Link></Button> : <span className="text-sm text-muted-foreground">← {m.prev}</span>}
        <h2 className="font-serif text-xl">{period}</h2>
        {next ? <Button asChild variant="outline" size="sm"><Link href={next}>{m.next} →</Link></Button> : <span className="text-sm text-muted-foreground">{m.next} →</span>}
      </nav>
      <p className="mb-4 text-sm text-muted-foreground">
        {m.dataThrough(r.dataThrough ? day(r.dataThrough) : '', '')}
        {launch.history.some((h) => h.afterWindow1) && <Badge variant="outline" className="ml-2">{m.launchChangedLate}</Badge>}
      </p>
      {r.oldBaseline && <Alert className="mb-4" role="note"><AlertDescription>{m.oldBaseline}</AlertDescription></Alert>}

      <ProofResult r={r} m={m} locale={locale} day={day} facts={facts} baselineFacts={baselineFacts} />

      <ProofWindowsTable r={r} all={all} w={w} m={m} locale={locale} day={day} />

      {r.groups && <ProofGroups r={r} m={m} locale={locale} />}

      {r.codes && <CodesCard codes={r.codes} m={m} />}
      {launchCard}
      {explain}
    </Page>
  );
}
