import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wine-match/ui';
import type { RoiResult } from '@wine-match/core';
import type { Dictionary } from '@/i18n/en';
import type { Formatters } from '@/server/showcase-roi';

/** The headline result and its two parts. The number is always "extra margin after the plan fee (assumption)", never a profit (R3). */
export function RoiResultSection({ result, f, t }: { result: RoiResult; f: Formatters; t: Dictionary }) {
  const r = t.showcase.roi;
  const tag = <span data-origin="formula" className="text-xs">({r.origin.formula})</span>;
  return (
    <section id="result" aria-labelledby="result-title" className="grid min-w-0 gap-3">
      <h2 id="result-title" className="font-serif text-xl">{r.result.title}</h2>
      <Card data-result="net" className="border-transparent bg-primary text-primary-foreground">
        <CardHeader>
          <CardDescription className="text-primary-foreground/90">{r.result.headline}</CardDescription>
          <CardTitle className="font-serif text-4xl font-normal tabular-nums">{f.money(result.netAfterFee)}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm text-primary-foreground/90">
          <span>{r.result.perMonth} {tag}</span>
          {result.netAfterFee < 0 && <span data-negative>{r.result.negative}</span>}
          <span>{r.result.headlineNote}</span>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card data-result="revenue" className="min-w-0">
          <CardHeader>
            <CardDescription>{r.result.revenue}</CardDescription>
            <CardTitle className="font-serif text-2xl font-normal tabular-nums">{f.money(result.revenueChange)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{r.result.perMonth} {tag}</CardContent>
        </Card>
        <Card data-result="margin" className="min-w-0">
          <CardHeader>
            <CardDescription>{r.result.margin}</CardDescription>
            <CardTitle className="font-serif text-2xl font-normal tabular-nums">{f.money(result.marginChange)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{r.result.perMonth} {tag}</CardContent>
        </Card>
      </div>
    </section>
  );
}
