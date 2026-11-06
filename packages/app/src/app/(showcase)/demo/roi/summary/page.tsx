import { computeRoi, parsePrintDate, parseRoiInputs } from '@wine-match/core';
import type { Locale } from '@wine-match/core';
import { Button, Input, Label, buttonVariants } from '@wine-match/ui';
import type { Metadata } from 'next';
import { PrintButton } from '../../../_components/print-button';
import { RoiSteps } from '../../../_components/roi-steps';
import { ShowcaseHeader } from '../../../_components/showcase-header';
import { WhatIsThis } from '../../../_components/what-is-this';
import { getI18n } from '@/server/i18n';
import { logShowcaseView, showcaseGate } from '@/server/showcase';
import { explicitLang, roiFieldViews, roiQuery, roiSteps } from '@/server/showcase-roi';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.showcase.meta.summaryTitle };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The date as written on a printout: day.month.year in Polish, day/month/year in English. */
const printDate = (iso: string, locale: Locale) => {
  const [y, m, d] = iso.split('-');
  return locale === 'pl' ? `${d}.${m}.${y}` : `${d}/${m}/${y}`;
};

/**
 * DM3: the printable summary (A4). Same numbers as DM2 from the same query; the date comes from `d`, never from the server clock;
 * the screen controls hide on paper (`print:hidden`), and the print button exists only with a script (R5).
 */
export default async function RoiSummaryPage({ searchParams }: Props) {
  showcaseGate('calculator');
  const sp = await searchParams;
  const { locale, t } = await getI18n();
  const parsed = parseRoiInputs(Object.entries(sp));
  const result = computeRoi(parsed.inputs);
  const lang = explicitLang(sp.lang);
  const date = parsePrintDate(sp.d);
  const fields = roiFieldViews(parsed, locale, t.showcase);
  const names = parsed.replaced.map((k) => t.showcase.roi.fields[k].label);
  const s = t.showcase.summary;
  const query = roiQuery(parsed.inputs);

  logShowcaseView('roi_summary');
  return (
    <>
      <ShowcaseHeader path="/demo/roi/summary" query={new URLSearchParams(roiQuery(parsed.inputs, { d: date ?? undefined }))} locale={locale} t={t} />
      <main className="mx-auto grid max-w-3xl gap-5 px-4 py-8 sm:px-6 print:max-w-none print:gap-3 print:p-0">
        <section aria-label={s.controls} className="grid gap-3 rounded-lg border border-border bg-card p-4 print:hidden" data-print-controls>
          <div className="flex flex-wrap items-center gap-3">
            <a href={`/demo/roi?${roiQuery(parsed.inputs, { lang })}`} className={buttonVariants({ variant: 'outline' })}>{s.back}</a>
            <PrintButton>{s.print}</PrintButton>
          </div>
          <p className="text-sm text-muted-foreground">{s.printHint}</p>
          <form method="get" action="/demo/roi/summary" className="flex flex-wrap items-end gap-3">
            {[...new URLSearchParams(query)].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            {lang && <input type="hidden" name="lang" value={lang} />}
            <div className="grid gap-1.5">
              <Label htmlFor="d">{s.dateLabel}</Label>
              <Input id="d" name="d" type="date" defaultValue={date ?? ''} className="w-auto" />
            </div>
            <Button type="submit" variant="secondary">{s.setDate}</Button>
          </form>
        </section>

        <div className="grid gap-1">
          <h1 className="font-serif text-3xl leading-tight print:text-2xl">{s.title}</h1>
          <p className="text-sm">
            {s.dateLabel}:{' '}
            {date ? <span data-print-date>{printDate(date, locale)}</span> : (
              <>
                <span className="print:hidden">{s.dateEmpty}</span>
                <span className="hidden min-w-32 border-b border-foreground print:inline-block">&nbsp;</span>
              </>
            )}
          </p>
        </div>

        {names.length > 0 && <div role="status" data-replaced className="rounded-lg border border-border bg-card p-3 text-sm">{t.showcase.roi.replaced(names)}</div>}

        <section aria-labelledby="inputs-title" className="grid gap-2">
          <h2 id="inputs-title" className="font-serif text-xl">{s.inputsTitle}</h2>
          <table className="w-full table-fixed border-collapse text-sm" data-inputs-table>
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="w-[42%] py-1.5 pr-2 font-medium">{s.columns.name}</th>
                <th scope="col" className="w-[20%] py-1.5 pr-2 font-medium">{s.columns.value}</th>
                <th scope="col" className="py-1.5 font-medium">{s.columns.origin}</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.key} data-field={f.key} data-origin={f.origin} className="border-b border-border align-top">
                  <td className="py-1.5 pr-2">{f.label} ({f.symbol})</td>
                  <td className="py-1.5 pr-2 tabular-nums">{f.valueText}</td>
                  <td className="py-1.5">{f.originText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <RoiSteps steps={roiSteps(result, locale, t.showcase)} t={t} />
        <WhatIsThis t={t} />
        <p data-note className="text-sm font-medium">{s.note}</p>
      </main>
    </>
  );
}
