import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ENGINE_FACTS } from '@wine-match/core';
import { Page, PageHeader } from '../../_components/admin-shell';
import { PanelExplain } from '../../_components/explain';
import { ActionButton, Hidden } from '../../_components/action-form';
import { Flash, ReadOnlyNotice } from '../../_components/flash';
import { first, formatDateTime } from '../../_components/format';
import { publishChanges, saveGuestSettings } from '../actions';
import { isDomainError } from '@/server/domain-errors';
import { getRequestScope } from '@/server/request-scope';
import { requireAccess } from '@/server/auth';
import { getI18n } from '@/server/i18n';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.publish };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

function Item({ ok, title, children, href, action }: { ok: boolean; title: string; children?: React.ReactNode; href?: string; action?: string }) {
  return (
    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-3 border-b px-6 py-4 last:border-b-0">
      <span aria-hidden="true" className={ok ? 'text-sage' : 'text-brass'}>{ok ? '✓' : '!'}</span>
      <div className="min-w-0 text-sm"><b className="font-medium">{title}</b>{children && <div className="mt-0.5 text-muted-foreground">{children}</div>}</div>
      {href && action && !ok && <Button asChild size="sm" variant="outline"><Link href={href}>{action}</Link></Button>}
    </div>
  );
}


/** A11 — publish: what guests will see, a checklist (advice, never a blocker) and guest-facing settings. */
export default async function PublishPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireAccess(slug);
  const p = await (await getRequestScope()).cradle.publishService.preview(slug).catch((e: unknown) => {
    if (isDomainError(e, 'not_found')) return null;
    throw e; // a real failure (database down, …) must surface as an error, not as a 404
  });
  if (!p) notFound();
  const base = `/admin/${slug}`;
  const common = { slug, back: `${base}/publish` };
  const first_ = p.withoutPrimary[0];
  const { locale, t } = await getI18n();
  const m = t.admin.publish;
  const names = (list: { name: string }[], max = 4) => m.names(list.slice(0, max).map((d) => d.name).join(', '), Math.max(0, list.length - max));

  return (
    <Page>
      <PageHeader title={m.title} description={m.description(formatDateTime(p.restaurant.publishedAt, locale), p.lastVersion ? m.version(p.lastVersion.number, p.lastVersion.publishedBy) : '')} />
      {!access.can('publish') && <ReadOnlyNotice>{m.readOnly}</ReadOnlyNotice>}
      <Flash saved={first(sp.saved)} error={first(sp.error)} n={first(sp.n)} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4"><CardTitle>{m.checklist}</CardTitle><CardDescription>{m.checklistText}</CardDescription></CardHeader>
          <CardContent className="px-0">
            <Item ok={p.withoutPrimary.length === 0} title={p.withoutPrimary.length ? m.noPrimary(p.withoutPrimary.length) : m.allPrimary} href={first_ ? `${base}/pairings/${first_.id}` : undefined} action={m.fix}>
              {p.withoutPrimary.length ? names(p.withoutPrimary) : m.allPrimaryText}
            </Item>
            <Item ok={p.unreviewedSuggestions === 0} title={p.unreviewedSuggestions ? m.unreviewed(p.unreviewedSuggestions) : m.allReviewed} href={`${base}/review`} action={m.review}>
              {p.settings.showUnreviewed ? m.unreviewedShown : m.unreviewedHidden}
            </Item>
            <Item ok={p.draftProfiles.length === 0} title={p.draftProfiles.length ? m.draftProfiles(p.draftProfiles.length) : m.allConfirmed} href={`${base}/menu`} action={m.check}>
              {p.draftProfiles.length ? names(p.draftProfiles) : m.allConfirmedText}
            </Item>
            <Item ok={p.draftDishes.length === 0} title={p.draftDishes.length ? m.newDishes(p.draftDishes.length) : m.noNewDishes}>
              {p.draftDishes.length ? names(p.draftDishes) : m.noNewDishesText}
            </Item>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.settings}</CardTitle>
            <CardDescription>{m.settingsText}</CardDescription>
            <PanelExplain id="publish" summary={t.admin.explain.publish.summary} points={t.admin.explain.publish.points(ENGINE_FACTS)} />
          </CardHeader>
          <CardContent>
            <form action={saveGuestSettings} className="grid gap-4">
              <Hidden fields={common} />
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="showUnreviewed" defaultChecked={p.settings.showUnreviewed} className="mt-0.5 size-4 accent-primary" />
                <span><b className="font-medium">{m.showUnreviewed}</b><span className="block text-muted-foreground">{m.showUnreviewedText}</span></span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="showScores" defaultChecked={p.settings.showScores} className="mt-0.5 size-4 accent-primary" />
                <span><b className="font-medium">{m.showScores}</b><span className="block text-muted-foreground">{m.showScoresText}</span></span>
              </label>
              {access.can('settings.change') && <div><Button type="submit" variant="outline">{m.saveSettings}</Button></div>}
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-medium">{p.pendingChanges ? m.pending(p.pendingChanges) : m.latest}</p>
              <p className="text-sm text-muted-foreground">
                {p.pendingChanges ? m.pendingText(p.pendingPairings, p.draftDishes.length) : m.nothing}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline"><Link href={`/r/${slug}`}>{m.preview}</Link></Button>
              <ActionButton action={publishChanges} fields={common} variant="default" size="default" disabled={p.pendingChanges === 0 || !access.can('publish')}>{m.submit}</ActionButton>
            </div>
          </CardContent>
        </Card>
        {p.pendingChanges === 0 && <Alert className="lg:col-span-2"><AlertTitle>{m.upToDate}</AlertTitle><AlertDescription>{m.upToDateText}</AlertDescription></Alert>}
      </div>
      <Badge variant="outline" className="mt-6">{m.versionBadge(p.lastVersion?.number ?? 0)}</Badge>
    </Page>
  );
}
