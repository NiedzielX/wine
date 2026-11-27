import { PROOF_MAX_WINDOW } from '@wine-match/core';
import { Alert, AlertDescription, Badge, Button, EmptyState, ErrorMessage } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden } from 'next/navigation';
import { Page } from '../../../_components/admin-shell';
import { formatDay } from '../../../_components/format';
import { ProofExplain, ProofGroups, ProofResult, ProofWindowsTable } from '../../../_components/proof-parts';
import { ProofPrintButton } from '../../../_components/proof-print-button';
import './print.css';
import { requireAccess } from '@/server/auth';
import { getI18n } from '@/server/i18n';
import { loadProofView, proofFacts } from '@/server/proof-view';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.proof.printTitle };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * A34 — the results report for paper (spec 2026-11-18-owner-proof-report, R13, F2): the same sections as A33 for one window, on an
 * A4 page without navigation or buttons, so the owner can show it to a partner. The line "Ctrl/Cmd+P" is always on the screen;
 * the "Print" button exists only when a script runs. The date on the paper is "data through" (from the POS data), never the clock
 * of the server. For `proof.view` (owner and general manager); the report is read-only here, the launch day form stays on A33.
 * Outside `(lists)`: no `loading.tsx`.
 */
export default async function ProofPrintPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireAccess(slug);
  if (!access.can('proof.view')) forbidden();
  const { locale, t } = await getI18n();
  const m = t.admin.proof;
  const c = (await getRequestScope()).cradle;
  const back = `/admin/${slug}/proof${sp.window === undefined ? '' : `?window=${encodeURIComponent(one(sp.window) ?? '')}`}`;
  const restaurant = access.membership.restaurantName;

  const view = await loadProofView(c, slug, one(sp.window));
  if (!view) {
    return (
      <Page>
        <ErrorMessage compact title={m.invalidWindowTitle} message={m.invalidWindowText(PROOF_MAX_WINDOW)} action={<Button asChild variant="outline"><Link href={`/admin/${slug}/proof/print`}>{m.invalidWindowAction}</Link></Button>} />
      </Page>
    );
  }
  const { result, all } = view;
  const { report: r, launch } = result;
  const day = (d: string) => formatDay(d, locale);
  const { facts, baselineFacts } = proofFacts(r, day);

  if (r.reasons.includes('no_launch_day') || r.reasons.includes('no_sales_import')) {
    return (
      <Page>
        <EmptyState
          title={r.reasons.includes('no_launch_day') ? m.emptyNoLaunchTitle : m.emptyNoImportTitle}
          description={r.reasons.includes('no_launch_day') ? m.emptyNoLaunchReadOnly : m.emptyNoImportText}
          action={<Button asChild variant="outline"><Link href={`/admin/${slug}/proof`}>{m.backToReport}</Link></Button>}
        />
      </Page>
    );
  }

  return (
    <Page>
      <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden" data-print-controls>
        <Button asChild variant="outline" size="sm"><Link href={back}>← {m.backToReport}</Link></Button>
        <ProofPrintButton>{m.printButton}</ProofPrintButton>
        <p className="text-sm text-muted-foreground" data-print-hint>{m.printHint}</p>
      </div>

      <header className="mb-5 border-b pb-4">
        <h1 className="font-serif text-3xl leading-tight tracking-tight">{m.printHeading(restaurant)}</h1>
        <p className="mt-1 text-sm">{r.window ? m.window(result.window, day(r.window.period.from), day(r.window.period.to)) : ''}</p>
        <p className="text-sm text-muted-foreground">
          {launch.current ? m.launchSet(day(launch.current.launchDay), t.admin.roles[launch.current.setByRole as keyof typeof t.admin.roles] ?? launch.current.setByRole, launch.changes) : ''}
          {' '}{m.dataThrough(r.dataThrough ? day(r.dataThrough) : '', '')}
          {launch.history.some((h) => h.afterWindow1) && <Badge variant="outline" className="ml-2">{m.launchChangedLate}</Badge>}
        </p>
      </header>
      {r.oldBaseline && <Alert className="mb-4" role="note"><AlertDescription>{m.oldBaseline}</AlertDescription></Alert>}

      <ProofResult r={r} m={m} locale={locale} day={day} facts={facts} baselineFacts={baselineFacts} />
      <ProofWindowsTable r={r} all={all} w={result.window} m={m} locale={locale} day={day} />
      {r.groups && <ProofGroups r={r} m={m} locale={locale} />}
      <ProofExplain r={r} m={m} />
    </Page>
  );
}
