import type { Metadata } from 'next';
import { ShowcaseHeader } from '../_components/showcase-header';
import { env } from '@/server/env';
import { getI18n } from '@/server/i18n';
import { getRequestScope } from '@/server/request-scope';
import { logShowcaseView, showcaseGate } from '@/server/showcase';
import { hubSteps, pickShowcaseDish } from '@/server/showcase-hub';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.showcase.hub.metaTitle };
}

/**
 * DM0: the guide through the demo, five steps with a link each (spec 2026-11-04-sales-demo-and-roi-calculator, R6). Only in `demo` mode.
 * It reads the published menu of the invented restaurant through the catalog service (no write), to pick a dish that has the seal.
 */
export default async function DemoHubPage() {
  const mode = showcaseGate('demo');
  const { locale, t } = await getI18n();
  const slug = env().demoRestaurantSlug;
  const { catalogService } = (await getRequestScope()).cradle;
  const menu = await catalogService.publishedMenu(slug, locale);
  const dishId = menu ? pickShowcaseDish(menu.dishes, await catalogService.pairingCoverage(menu.restaurant.id)) : null;
  const steps = hubSteps({ slug, dishId, locale });
  const h = t.showcase.hub;
  const q = `?lang=${locale}`;

  logShowcaseView('hub');
  return (
    <>
      <ShowcaseHeader path="/demo" query={new URLSearchParams()} locale={locale} t={t} mode={mode} />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6">
        <div className="grid gap-2">
          <h1 className="font-serif text-4xl leading-tight">{h.title}</h1>
          <p className="max-w-[70ch] text-muted-foreground">{h.lead}</p>
        </div>
        <ol className="grid gap-3 md:grid-cols-2">
          {steps.map((s, i) => (
            <li key={s.id} data-step={s.id} className="min-w-0 rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{h.stepWord(i + 1)}</p>
              <h2 className="mt-1 font-serif text-xl">{h.steps[s.id].title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{h.steps[s.id].see}</p>
              {s.href ? (
                <a href={s.href} className="mt-3 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">{h.open}<span className="sr-only">: {h.steps[s.id].title}</span></a>
              ) : (
                <p data-soon className="mt-3 text-sm font-medium">{h.soon}</p>
              )}
            </li>
          ))}
        </ol>
        <section aria-labelledby="more-title" className="grid gap-2">
          <h2 id="more-title" className="font-serif text-xl">{h.more.title}</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <li><a href={`/demo/tour${q}`} className="inline-flex min-h-9 items-center underline underline-offset-4">{h.more.tour}</a></li>
            <li><a href={`/demo/roi${q}`} className="inline-flex min-h-9 items-center underline underline-offset-4">{h.more.roi}</a></li>
          </ul>
        </section>
        <p data-fiction-note className="max-w-[70ch] rounded-lg border border-border bg-muted p-3 text-sm">{h.note}</p>
      </main>
    </>
  );
}
