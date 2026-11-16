import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DemoAccountForm } from '../../(admin)/admin/_components/demo-account';
import { StartHeader } from '../_components/start-header';
import { demoAccounts, demoStartSlug } from '@/server/demo-entry';
import { env } from '@/server/env';
import { getI18n } from '@/server/i18n';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.showcase.start.metaTitle };
}

const LINK = 'inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

/**
 * The start page of the interactive demo instance (spec 2026-11-16-interactive-demo-entry, R2): one click into every view of the invented
 * restaurant. 404 unless the instance is interactive and its demo restaurant is Halka. It writes nothing. The dashboard buttons are the
 * accounts that really exist here (`demoAccounts`: no hash, no password in the page); the QR page needs a session, so it is not linked.
 */
export default async function StartPage() {
  const e = env();
  const slug = demoStartSlug(e);
  if (!slug) notFound();
  const { locale, t } = await getI18n();
  const c = (await getRequestScope()).cradle;
  // the guest and waiter links only when the published menu exists, so the page never pretends that a link works
  const published = (await c.catalogService.publishedMenu(slug, locale)) !== null;
  const accounts = await demoAccounts(c.authService, e);
  const s = t.showcase.start;
  const q = `?lang=${locale}`;

  return (
    <>
      <StartHeader locale={locale} t={t} />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6">
        <div className="grid gap-2">
          <h1 className="font-serif text-4xl leading-tight">{s.title}</h1>
          <p className="max-w-[70ch] text-muted-foreground">{s.lead}</p>
        </div>
        <p data-demo-note className="max-w-[70ch] rounded-lg border border-border bg-muted p-3 text-sm">{s.note}</p>
        {!published && <p data-not-published role="status" className="max-w-[70ch] rounded-lg border border-border p-3 text-sm">{s.notPublished}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {published && (
            <>
              <section data-view="guest" className="min-w-0 rounded-lg border border-border bg-card p-4">
                <h2 className="font-serif text-xl">{s.sections.guest.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{s.sections.guest.text}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`/r/${slug}${q}`} className={LINK}>{s.sections.guest.dish}</a>
                  <a href={`/r/${slug}/table${q}`} className={LINK}>{s.sections.guest.table}</a>
                </div>
              </section>
              <section data-view="waiter" className="min-w-0 rounded-lg border border-border bg-card p-4">
                <h2 className="font-serif text-xl">{s.sections.waiter.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{s.sections.waiter.text}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`/r/${slug}/staff${q}`} className={LINK}>{s.sections.waiter.dish}</a>
                  <a href={`/r/${slug}/staff/table${q}`} className={LINK}>{s.sections.waiter.table}</a>
                </div>
              </section>
            </>
          )}
          {accounts.length > 0 && (
            <section data-view="panel" className="min-w-0 rounded-lg border border-border bg-card p-4">
              <h2 className="font-serif text-xl">{s.sections.panel.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{s.sections.panel.text}</p>
              <div className="mt-3 grid gap-5">
                {accounts.map((a) => (
                  <DemoAccountForm key={a.key} account={a} locale={locale} label={s.sections.panel.signInAs(a.name, t.admin.roles[a.role])} emailLabel={t.admin.login.email} passwordLabel={t.admin.login.password} />
                ))}
              </div>
              <p data-demo-lock className="mt-3 text-sm text-muted-foreground">{s.lock}</p>
            </section>
          )}
          {e.showcaseMode === 'calculator' && (
            <section data-view="roi" className="min-w-0 rounded-lg border border-border bg-card p-4">
              <h2 className="font-serif text-xl">{s.sections.roi.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{s.sections.roi.text}</p>
              <div className="mt-3"><a href={`/demo/roi${q}`} className={LINK}>{s.sections.roi.open}</a></div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
