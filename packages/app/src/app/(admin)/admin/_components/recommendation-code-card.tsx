import type { CodeSummary } from '@wine-match/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorMessage } from '@wine-match/ui';
import type { Dictionary } from '@/i18n/en';

/** What the page loaded for the chosen period: the totals, or a period the service refused (`invalid_period`). */
export type CodeSummaryResult = { ok: true; summary: CodeSummary } | { ok: false };

/**
 * A13 — wine from a recommendation (spec 2026-10-16-recommendation-code, phase 3, Q13, AC12): under the Wine Attach Rate,
 * for the same period. "Ordered" counts each recommendation once, whether the waiter confirmed it or the POS matched it
 * (R10); the codes on the till that match no recommendation are shown on their own. Presentation only: the numbers come
 * from `RecommendationCodeService.summary`. No data → `EmptyState`, a refused period → `ErrorMessage`.
 */
export function RecommendationCodeCard({ result, t }: { result: CodeSummaryResult; t: Dictionary }) {
  const m = t.admin.import.sales.recommendation;
  return (
    <Card id="wine-from-recommendation" data-recommendation-card className="min-w-0 scroll-mt-4">
      <CardHeader>
        <CardTitle>{m.title}</CardTitle>
        <CardDescription>{m.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!result.ok
          ? <ErrorMessage compact title={m.invalidTitle} message={m.invalid} />
          : result.summary.issued === 0 && result.summary.unmatchedPosCodes === 0
            ? <div data-codes-empty><EmptyState title={m.noneTitle} description={m.none} /></div>
            : <CodeTotals summary={result.summary} t={t} />}
      </CardContent>
    </Card>
  );
}

function CodeTotals({ summary: s, t }: { summary: CodeSummary; t: Dictionary }) {
  const m = t.admin.import.sales.recommendation;
  return (
    <div className="grid gap-4">
      <div className="min-w-0 rounded-md bg-muted px-4 py-3">
        <div className="font-serif text-3xl tabular-nums" data-codes-ordered>{m.ordered(s.ordered, s.issued)}</div>
        <div className="text-sm text-muted-foreground" data-codes-split>{m.split(s.staffConfirmed, s.posMatched)}</div>
      </div>
      <p className="text-sm" data-codes-unmatched>{m.unmatched(s.unmatchedPosCodes)}</p>
      <p className="text-xs text-muted-foreground">{m.note}</p>
    </div>
  );
}
