import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../_components/admin-shell';
import { ActionButton, Hidden } from '../../_components/action-form';
import { Flash, ReadOnlyNotice } from '../../_components/flash';
import { first, formatDateTime } from '../../_components/format';
import { publishChanges, saveGuestSettings } from '../actions';
import { isDomainError } from '@/server/domain-errors';
import { getRequestScope } from '@/server/request-scope';
import { requireAccess } from '@/server/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Publish' };

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

const names = (list: { name: string }[], max = 4) => list.slice(0, max).map((d) => d.name).join(', ') + (list.length > max ? ` and ${list.length - max} more` : '');

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

  return (
    <Page>
      <PageHeader title="Publish" description={`Last published ${formatDateTime(p.restaurant.publishedAt)}${p.lastVersion ? ` (version ${p.lastVersion.number}, ${p.lastVersion.publishedBy})` : ''}. Guests see the published version through the QR code.`} />
      {!access.can('publish') && <ReadOnlyNotice>Your role cannot publish.</ReadOnlyNotice>}
      <Flash saved={first(sp.saved)} error={first(sp.error)} n={first(sp.n)} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4"><CardTitle>Before you publish</CardTitle><CardDescription>Recommended, not required.</CardDescription></CardHeader>
          <CardContent className="px-0">
            <Item ok={p.withoutPrimary.length === 0} title={p.withoutPrimary.length ? `${p.withoutPrimary.length} dishes have no primary pick` : 'Every dish has a primary pick'} href={first_ ? `${base}/pairings/${first_.id}` : undefined} action="Fix">
              {p.withoutPrimary.length ? names(p.withoutPrimary) : 'Guests always see your first choice first.'}
            </Item>
            <Item ok={p.unreviewedSuggestions === 0} title={p.unreviewedSuggestions ? `${p.unreviewedSuggestions} engine suggestions not reviewed` : 'All suggestions reviewed'} href={`${base}/review`} action="Review">
              {p.settings.showUnreviewed ? 'Unreviewed suggestions can still appear as “Best match”, never as a sommelier recommendation.' : 'Unreviewed suggestions are hidden from guests.'}
            </Item>
            <Item ok={p.draftProfiles.length === 0} title={p.draftProfiles.length ? `${p.draftProfiles.length} taste profiles are still drafts` : 'All taste profiles confirmed'} href={`${base}/menu`} action="Check">
              {p.draftProfiles.length ? names(p.draftProfiles) : 'Scores are based on profiles you checked.'}
            </Item>
            <Item ok={p.draftDishes.length === 0} title={p.draftDishes.length ? `${p.draftDishes.length} new dishes will go live` : 'No new dishes'}>
              {p.draftDishes.length ? names(p.draftDishes) : 'The menu is unchanged since the last publish.'}
            </Item>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Guest settings</CardTitle><CardDescription>These apply right away; they are not part of a published version.</CardDescription></CardHeader>
          <CardContent>
            <form action={saveGuestSettings} className="grid gap-4">
              <Hidden fields={common} />
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="showUnreviewed" defaultChecked={p.settings.showUnreviewed} className="mt-0.5 size-4 accent-primary" />
                <span><b className="font-medium">Fill empty places with engine picks</b><span className="block text-muted-foreground">When off, guests only see pairings you approved.</span></span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="showScores" defaultChecked={p.settings.showScores} className="mt-0.5 size-4 accent-primary" />
                <span><b className="font-medium">Show match percentages to guests</b><span className="block text-muted-foreground">The glass icon is always shown.</span></span>
              </label>
              {access.can('settings.change') && <div><Button type="submit" variant="outline">Save settings</Button></div>}
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-medium">{p.pendingChanges ? `${p.pendingChanges} unpublished ${p.pendingChanges === 1 ? 'change' : 'changes'}` : 'Guests see the latest version'}</p>
              <p className="text-sm text-muted-foreground">
                {p.pendingChanges ? `${p.pendingPairings} pairings and ${p.draftDishes.length} new dishes. Publishing updates the guest app immediately; the QR code stays the same.` : 'There is nothing to publish.'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline"><Link href={`/r/${slug}`}>Preview guest app</Link></Button>
              <ActionButton action={publishChanges} fields={common} variant="default" size="default" disabled={p.pendingChanges === 0 || !access.can('publish')}>Publish changes</ActionButton>
            </div>
          </CardContent>
        </Card>
        {p.pendingChanges === 0 && <Alert className="lg:col-span-2"><AlertTitle>Up to date</AlertTitle><AlertDescription>Make a change on the Pairings or Review queue screens, then come back to publish it.</AlertDescription></Alert>}
      </div>
      <Badge variant="outline" className="mt-6">Version {p.lastVersion?.number ?? 0}</Badge>
    </Page>
  );
}
