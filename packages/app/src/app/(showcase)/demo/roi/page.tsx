import { computeRoi, parseRoiInputs } from '@wine-match/core';
import type { Metadata } from 'next';
import { RoiForm } from '../../_components/roi-form';
import { RoiResultSection } from '../../_components/roi-result';
import { RoiSteps } from '../../_components/roi-steps';
import { ShowcaseHeader } from '../../_components/showcase-header';
import { WhatIsThis } from '../../_components/what-is-this';
import { getI18n } from '@/server/i18n';
import { logShowcaseView, showcaseGate } from '@/server/showcase';
import { explicitLang, formatters, roiFieldViews, roiQuery, roiSteps } from '@/server/showcase-roi';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.showcase.meta.roiTitle };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** DM2: the return calculator. State is the query string; the form is a plain GET; nothing is stored (spec 2026-11-04-sales-demo-and-roi-calculator, R2-R4). */
export default async function RoiPage({ searchParams }: Props) {
  showcaseGate('calculator');
  const sp = await searchParams;
  const { locale, t } = await getI18n();
  const parsed = parseRoiInputs(Object.entries(sp));
  const result = computeRoi(parsed.inputs);
  const lang = explicitLang(sp.lang);
  const f = formatters(locale, t.showcase);
  const fields = roiFieldViews(parsed, locale, t.showcase);
  const names = parsed.replaced.map((k) => t.showcase.roi.fields[k].label);
  const query = roiQuery(parsed.inputs);

  logShowcaseView('roi');
  return (
    <>
      <ShowcaseHeader path="/demo/roi" query={new URLSearchParams(query)} locale={locale} t={t} />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6">
        <div className="grid gap-2">
          <h1 className="font-serif text-4xl leading-tight">{t.showcase.roi.title}</h1>
          <p className="max-w-[70ch] text-muted-foreground">{t.showcase.roi.lead}</p>
        </div>
        <WhatIsThis t={t} />
        {names.length > 0 && (
          <div role="status" data-replaced className="rounded-lg border border-border bg-card p-3 text-sm">{t.showcase.roi.replaced(names)}</div>
        )}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="min-w-0 lg:col-start-2 lg:row-start-1"><RoiResultSection result={result} f={f} t={t} /></div>
          <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <RoiForm
              fields={fields}
              t={t}
              lang={lang}
              resetHref={lang ? `/demo/roi?lang=${lang}` : '/demo/roi'}
              summaryHref={`/demo/roi/summary?${roiQuery(parsed.inputs, { lang })}`}
            />
          </div>
          <div className="min-w-0 lg:col-start-2 lg:row-start-2"><RoiSteps steps={roiSteps(result, locale, t.showcase)} t={t} /></div>
        </div>
      </main>
    </>
  );
}
