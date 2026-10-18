import { DEFAULT_RESTAURANT_SETTINGS, ENGINE_FACTS } from '@wine-match/core';
import type { Metadata } from 'next';
import { Button, LanguageSwitch, TopBar } from '../../../_components/guest-ui';
import { guestContext, notFound, type SearchParams } from '@/server/guest-page';
import { getI18n } from '@/server/i18n';
import { trackUsage } from '@/server/usage-events';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.guest.meta.howItWorks };
}

type Props = { params: Promise<{ slug: string }>; searchParams: SearchParams };

/**
 * G12 — "How we pick your wine" (spec 2026-10-16-how-it-works-explanations, R9): the long, calm version of the
 * explanations, linked from G0 and from the trust note on G3. Plain server HTML, no script. The restaurant comes from
 * the published menu (an unknown slug is a 404; a restaurant without dishes still gets the page), the guest settings
 * are the live ones (like G3), the numbers come from ENGINE_FACTS. Links carry the guest's `lang` and `sid`.
 */
export default async function HowItWorksPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { prefs, services, t, locale, session, href, langHrefs } = await guestContext(searchParams);
  const menu = await services.catalogService.publishedMenu(slug, locale);
  if (!menu) notFound();
  const r = menu.restaurant;
  const { showScores, showUnreviewed } = r.settings ?? DEFAULT_RESTAURANT_SETTINGS;
  const h = t.guest.howItWorks;
  const sections = h.sections(ENGINE_FACTS, { showScores, showUnreviewed, director: r.wineDirector, restaurant: r.name });
  const back = href(`/r/${r.slug}`, prefs);

  // one view event (E07 Q9); a guest who arrives here by a link starts a session
  await trackUsage(services, r, session, [{ name: 'explainer_viewed' }]);
  return (
    <>
      <TopBar back={back} title={r.name} t={t} langSwitch={<LanguageSwitch locale={locale} hrefs={langHrefs(`/r/${r.slug}/how-it-works`)} t={t} />} />
      <main className="flex-1 px-5 pt-6 pb-10 lg:mx-auto lg:w-full lg:max-w-[720px]">
        <h1 className="font-serif text-[30px] leading-[1.08] tracking-tight lg:text-4xl">{h.title}</h1>
        <p className="mt-2 max-w-[60ch] text-[15.5px] text-ink-2">{h.lead(r.name)}</p>
        {sections.map((s) => (
          <section key={s.id} data-section={s.id} aria-labelledby={`how-${s.id}`} className="mt-7 max-w-[60ch]">
            <h2 id={`how-${s.id}`} className="font-serif text-[22px] leading-tight">{s.title}</h2>
            {s.text.map((p) => <p key={p} className="mt-2 text-[15.5px] leading-normal break-words">{p}</p>)}
            {s.points && (
              <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-[15.5px] leading-snug marker:text-ink-2">
                {s.points.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
            {s.after && <p className="mt-2 text-[15.5px] leading-normal">{s.after}</p>}
          </section>
        ))}
        <Button href={back} variant="secondary" className="mt-9">{h.back}</Button>
      </main>
    </>
  );
}
