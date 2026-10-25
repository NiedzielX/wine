import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wine-match/ui';

/** The line under a KPI comparing it with the previous window; the arrow is decoration, `direction` is read out. */
export interface KpiDelta {
  text: string;
  arrow?: { symbol: '▲' | '▼'; label: string };
}

/**
 * One dashboard tile (A1): a label, a value and a detail line, optionally the change against the previous window
 * (spec 2026-10-15-kpi-dashboard, UI). No colours of meaning: a rise is not "good" by itself. `lead` = the highlighted tile;
 * `className` places the tile in its grid (e.g. a span).
 */
export function Kpi({ label, value, detail, delta, lead = false, className = '', ...data }: {
  label: string; value: string; detail: string; delta?: KpiDelta; lead?: boolean; className?: string; [data: `data-${string}`]: string | undefined;
}) {
  const muted = lead ? 'text-primary-foreground/80' : 'text-muted-foreground';
  return (
    <Card {...data} className={`min-w-0 ${lead ? 'border-transparent bg-primary text-primary-foreground' : ''} ${className}`.trim()}>
      <CardHeader>
        <CardDescription className={lead ? 'text-primary-foreground/80' : undefined}>{label}</CardDescription>
        <CardTitle className="font-serif text-4xl font-normal tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className={`grid gap-1 text-sm ${muted}`}>
        <span>{detail}</span>
        {delta && (
          <span data-kpi-delta className="tabular-nums">
            {delta.arrow && <><span aria-hidden="true">{delta.arrow.symbol}</span><span className="sr-only">{delta.arrow.label}</span>{' '}</>}
            {delta.text}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
