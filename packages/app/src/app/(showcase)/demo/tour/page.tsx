import type { Metadata } from 'next';
import { ShowcaseHeader } from '../../_components/showcase-header';
import { env } from '@/server/env';
import { getI18n } from '@/server/i18n';
import { logShowcaseView, showcaseGate } from '@/server/showcase';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.showcase.tour.metaTitle };
}

/**
 * DM1: "How it works for a restaurant" (spec 2026-11-04-sales-demo-and-roi-calculator, R10): five short sections about the
 * sommelier-first positioning (D13). In `calculator` and `demo`; it reads no data. The link to the guest's own explainer (G12)
 * and the way back to the guide are shown only in `demo`, where the invented restaurant exists.
 */
export default async function TourPage() {
  const mode = showcaseGate('calculator');
  const { locale, t } = await getI18n();
  const tour = t.showcase.tour;
  const q = `?lang=${locale}`;
  const link = 'inline-flex min-h-9 items-center underline underline-offset-4';

  logShowcaseView('tour');
  return (
    <>
      <ShowcaseHeader path="/demo/tour" query={new URLSearchParams()} locale={locale} t={t} mode={mode} />
      <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6">
        <div className="grid gap-2">
          <h1 className="font-serif text-4xl leading-tight">{tour.title}</h1>
          <p className="text-muted-foreground">{tour.lead}</p>
        </div>
        {tour.sections.map((s) => (
          <section key={s.id} data-section={s.id} aria-labelledby={`tour-${s.id}`} className="grid gap-1">
            <h2 id={`tour-${s.id}`} className="font-serif text-2xl">{s.title}</h2>
            <p className="max-w-[70ch]">{s.text}</p>
          </section>
        ))}
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {mode === 'demo' && <li><a data-how-link href={`/r/${env().demoRestaurantSlug}/how-it-works${q}`} className={link}>{tour.howLink}</a></li>}
          <li><a href={`/demo/roi${q}`} className={link}>{tour.roiLink}</a></li>
          {mode === 'demo' && <li><a href={`/demo${q}`} className={link}>{tour.demoLink}</a></li>}
        </ul>
      </main>
    </>
  );
}
