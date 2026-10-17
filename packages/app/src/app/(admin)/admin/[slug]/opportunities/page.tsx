import { DISMISS_DAYS, type DismissedOpportunity } from '@wine-match/core';
import { Alert, AlertDescription, Button, Card, CardContent, CardHeader, EmptyState } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Dictionary } from '@/i18n/en';
import { requireAccess } from '@/server/auth';
import { getI18n } from '@/server/i18n';
import { logger } from '@/server/logger';
import { getRequestScope } from '@/server/request-scope';
import { ActionButton } from '../../_components/action-form';
import { Page, PageHeader } from '../../_components/admin-shell';
import { RoleBadge } from '../../_components/badges';
import { PanelExplain } from '../../_components/explain';
import { Flash, ReadOnlyNotice } from '../../_components/flash';
import { first, formatDateTime } from '../../_components/format';
import { OpportunityList } from '../../_components/opportunity-list';
import { restoreOpportunity } from '../actions';

// Outside `(lists)` and without `loading.tsx`: the inbox and its actions work without JavaScript (packages/app/AGENTS.md).
export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.opportunities };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** What an ignored opportunity was about: its kind, then the dish and the wine it named. */
function dismissedLabel(d: DismissedOpportunity, t: Dictionary): string {
  const names = [d.dish?.name, d.wine ? `${d.wine.producer} ${d.wine.name}` : undefined].filter(Boolean).join(' · ');
  return names ? `${t.admin.opportunities.rules[d.rule]}: ${names}` : t.admin.opportunities.rules[d.rule];
}

/**
 * A14 — Opportunities (spec 2026-10-16-sommelier-opportunities, F2): every opportunity of the restaurant grouped by dish,
 * each group headed by the dish's current pairings (Q9), and the ignored ones with "Restore".
 */
export default async function OpportunitiesPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const decide = (await requireAccess(slug)).can('pairings.decide');
  const { locale, t } = await getI18n();
  const m = t.admin.opportunities;
  const view = await (await getRequestScope()).cradle.opportunityService.list(slug, { scope: 'all' }, locale);
  if (!view) notFound();
  if (view.degraded.length > 0) logger.warn('opportunities: some sources are unavailable', { slug, degraded: view.degraded });
  const base = `/admin/${slug}`;
  const back = `${base}/opportunities`;

  return (
    <Page>
      <PageHeader title={m.title} description={m.description} />
      <PanelExplain id="opportunities" className="mb-5" summary={t.admin.explain.opportunities.summary} points={t.admin.explain.opportunities.points(DISMISS_DAYS)} />
      {!decide && <ReadOnlyNotice>{m.readOnly}</ReadOnlyNotice>}
      <Flash saved={first(sp.saved)} error={first(sp.error)} n={first(sp.n)} />
      {view.degraded.length > 0 && (
        <Alert className="mb-5" role="note"><AlertDescription>{m.degraded}</AlertDescription></Alert>
      )}

      {view.groups.length === 0 ? (
        <Card><EmptyState title={m.emptyTitle} description={m.emptyText} /></Card>
      ) : (
        <div className="grid gap-6">
          {view.groups.map((g) => (
            <Card key={g.dish.id} className="gap-0 py-0">
              <CardHeader className="border-b py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="min-w-0 font-serif text-xl leading-tight">{g.dish.name}</h2>
                  <Button asChild size="sm" variant="outline"><Link href={`${base}/pairings/${g.dish.id}`}>{m.openPairings}</Link></Button>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                  <span className="text-muted-foreground">{m.current}:</span>
                  {g.current.length === 0 ? <span className="text-muted-foreground">{m.noCurrent}</span> : (
                    <ul className="flex min-w-0 flex-wrap gap-x-3 gap-y-1.5">
                      {g.current.map((c) => (
                        <li key={c.pairingId} className="inline-flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0">{c.wine.producer} {c.wine.name}</span>
                          <RoleBadge role={c.role} t={t} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-0">
                <OpportunityList items={g.items} dish={g.dish} slug={slug} back={back} decide={decide} t={t} locale={locale} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {view.dismissed.length > 0 && (
        <details className="mt-8 rounded-xl border bg-card">
          <summary className="cursor-pointer px-6 py-4 font-medium">{m.dismissed(view.dismissed.length)}</summary>
          <ul className="border-t">
            {view.dismissed.map((d) => (
              <li key={d.key} className="grid gap-2 border-b px-6 py-3 text-sm last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="font-medium">{dismissedLabel(d, t)}</div>
                  <div className="text-xs text-muted-foreground">{m.dismissedBy(d.dismissedBy, formatDateTime(d.expiresAt, locale))}</div>
                </div>
                {decide && <ActionButton action={restoreOpportunity} fields={{ slug, back, key: d.key }}>{m.restore}</ActionButton>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Page>
  );
}
