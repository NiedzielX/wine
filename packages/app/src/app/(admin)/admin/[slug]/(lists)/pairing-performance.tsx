import { KPI_DAYS, MIN_RATE_SAMPLE, PAIRING_ROWS_LIMIT, type Locale, type PairingPerformance, type PairingPerformanceRow } from '@wine-match/core';
import { Badge, Button, Card, EmptyState, ErrorMessage, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@wine-match/ui';
import Link from 'next/link';
import type { SettledSection } from '@/server/analytics-section';
import { getDictionary } from '@/server/i18n';
import { ScoreBadge } from '../../_components/badges';
import { PanelExplain } from '../../_components/explain';
import { formatCount, formatPeriod, formatRate } from '../../_components/kpi-format';

/**
 * A1 "Pairing performance" (spec 2026-10-15-kpi-dashboard, phase 3, #22): per dish and wine, how often guests of the
 * last 28 days saw and chose it, with the source it had when they saw it (R8). The top 10 rows, `?pairs=all` for all
 * of them (Q11); a dish links to its pairings (A6). Loaded and failing on its own (R9). Props only, so the states are
 * testable without a server.
 */
export function PairingPerformanceSection({ result, slug, showAll, locale }: { result: SettledSection<PairingPerformance>; slug: string; showAll: boolean; locale: Locale }) {
  const t = getDictionary(locale);
  const m = t.admin.dashboard.pairings;
  const perf = result.ok ? result.value : null;
  const base = `/admin/${slug}`;
  return (
    <section aria-labelledby="pairings-title" className="mt-6 min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="pairings-title" className="font-serif text-2xl">{m.title}</h2>
        {perf && <span className="text-sm text-muted-foreground">{formatPeriod(perf.period.current, locale)}</span>}
      </div>
      {!perf ? (
        <Card><ErrorMessage compact title={t.admin.dashboard.analyticsUnavailable} message={t.admin.dashboard.analyticsUnavailableText} /></Card>
      ) : perf.rows.length === 0 ? (
        <Card>
          <EmptyState
            title={m.emptyTitle}
            description={m.emptyText}
            action={<Button asChild size="sm"><Link href={`${base}/review`}>{m.openReview}</Link></Button>}
          />
          {perf.omitted > 0 && <p className="px-6 pb-4 text-sm text-muted-foreground">{m.omitted(perf.omitted)}</p>}
        </Card>
      ) : (
        <>
          <PanelExplain id="performance" className="mb-3" summary={t.admin.explain.performance.summary} points={t.admin.explain.performance.points({ days: KPI_DAYS, minSample: MIN_RATE_SAMPLE })} />
          <Card className="min-w-0 gap-0 py-0">
            <Table>
              <caption className="sr-only">{m.caption}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.dish}</TableHead><TableHead>{m.wine}</TableHead><TableHead>{m.source}</TableHead><TableHead>{m.match}</TableHead>
                  <TableHead className="text-right">{m.shown}</TableHead><TableHead className="text-right">{m.chosen}</TableHead><TableHead className="text-right">{m.conversion}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perf.rows.map((r) => <PairingRow key={`${r.dish.id}:${r.wine.id}:${r.source}`} row={r} base={base} locale={locale} />)}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-3 text-sm">
              {perf.omitted > 0 ? <p className="text-muted-foreground">{m.omitted(perf.omitted)}</p> : <span />}
              {!showAll && perf.total > perf.rows.length && (
                <Link className="font-medium underline-offset-4 hover:underline" href={`${base}?pairs=all`}>{m.showAll(perf.total)}</Link>
              )}
              {showAll && perf.total > PAIRING_ROWS_LIMIT && (
                <Link className="font-medium underline-offset-4 hover:underline" href={base}>{m.showTop(PAIRING_ROWS_LIMIT)}</Link>
              )}
            </div>
          </Card>
        </>
      )}
    </section>
  );
}

function PairingRow({ row: r, base, locale }: { row: PairingPerformanceRow; base: string; locale: Locale }) {
  const t = getDictionary(locale);
  const m = t.admin.dashboard.pairings;
  const vintage = r.wine.vintage === 'NV' ? t.admin.common.nonVintage : r.wine.vintage;
  return (
    <TableRow data-pairing-row={r.source}>
      <TableCell className="min-w-40 whitespace-normal break-words">
        <Link className="font-medium underline-offset-4 hover:underline" href={`${base}/pairings/${r.dish.id}`}>{r.dish.name}</Link>
      </TableCell>
      <TableCell className="min-w-48 whitespace-normal break-words">
        {r.wine.name} {vintage}
        <div className="text-xs text-muted-foreground">{r.wine.producer}</div>
      </TableCell>
      <TableCell>{r.source === 'sommelier' ? <Badge>{m.sources.sommelier}</Badge> : <Badge variant="outline">{m.sources.engine}</Badge>}</TableCell>
      <TableCell><ScoreBadge score={r.matchScore} t={t} /></TableCell>
      <TableCell className="text-right tabular-nums">{formatCount(r.shown, locale)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCount(r.chosen, locale)}</TableCell>
      <TableCell className="text-right tabular-nums">{r.conversion === null ? <span className="text-muted-foreground">{m.noViews}</span> : formatRate(r.conversion, locale)}</TableCell>
    </TableRow>
  );
}
