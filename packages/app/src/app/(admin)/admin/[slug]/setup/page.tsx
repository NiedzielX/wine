import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../_components/admin-shell';
import { ActionButton, Hidden } from '../../_components/action-form';
import { Flash, ReadOnlyNotice } from '../../_components/flash';
import { first } from '../../_components/format';
import { saveRestaurantDetails, generateSuggestions } from '../import-actions';
import { requireAccess } from '@/server/auth';
import { env } from '@/server/env';
import { guestUrl } from '@/server/qr';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Setup' };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A10 — setup: the restaurant's details and the checklist that leads to going live. */
export default async function SetupPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireAccess(slug);
  const setup = await (await getRequestScope()).cradle.adminService.setup(slug);
  if (!setup) notFound();
  const r = setup.restaurant;
  const base = `/admin/${slug}`;
  const canEdit = access.can('restaurant.edit');
  const next = setup.steps.find((s) => !s.done);
  const common = { slug, back: `${base}/setup` };
  const LINKS: Record<string, { href: string; label: string }> = {
    menu: { href: `${base}/import/menu`, label: 'Import menu' }, wines: { href: `${base}/import/wines`, label: 'Import wines' },
    profiles: { href: `${base}/menu`, label: 'Open menu' }, pairings: { href: `${base}/review`, label: 'Review' },
    publish: { href: `${base}/publish`, label: 'Publish' }, qr: { href: `${base}/qr`, label: 'QR code' }
  };

  return (
    <Page>
      <PageHeader title="Setup" description="Everything that takes a restaurant from an empty account to guests scanning a code." />
      <Flash saved={first(sp.saved)} error={first(sp.error)} n={first(sp.n)} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4"><CardTitle>Checklist</CardTitle><CardDescription>{next ? `Next: ${next.title.toLowerCase()}.` : 'Everything is done.'}</CardDescription></CardHeader>
          <CardContent className="px-0">
            {setup.steps.map((s, i) => (
              <div key={s.key} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-3 border-b px-6 py-4 last:border-b-0">
                <span aria-hidden="true" className={`grid size-6 place-items-center rounded-full text-xs ${s.done ? 'bg-sage-soft text-sage' : s === next ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{s.done ? '✓' : i + 1}</span>
                <div className="min-w-0 text-sm"><b className="font-medium">{s.title}</b><div className="text-muted-foreground">{s.detail}</div></div>
                {LINKS[s.key] && (!s.done || s.key === 'qr') && <Button asChild size="sm" variant={s === next ? 'default' : 'outline'}><Link href={LINKS[s.key].href}>{LINKS[s.key].label}</Link></Button>}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><CardTitle>Restaurant details</CardTitle><CardDescription>Shown to guests on the landing page.</CardDescription></CardHeader>
            <CardContent>
              {!canEdit && <ReadOnlyNotice>Only the owner or general manager changes these details.</ReadOnlyNotice>}
              <form action={saveRestaurantDetails} className="grid gap-4">
                <Hidden fields={common} />
                <div className="grid gap-1.5"><Label htmlFor="name">Name</Label><Input id="name" name="name" defaultValue={r.name} required maxLength={120} readOnly={!canEdit} /></div>
                <div className="grid gap-1.5"><Label htmlFor="address">Address</Label><Input id="address" name="address" defaultValue={r.address} required readOnly={!canEdit} /></div>
                <div className="grid gap-1.5"><Label htmlFor="city">City</Label><Input id="city" name="city" defaultValue={r.city} required readOnly={!canEdit} /></div>
                <div className="grid gap-1.5"><Label htmlFor="wineDirector">Wine director</Label><Input id="wineDirector" name="wineDirector" defaultValue={r.wineDirector} required readOnly={!canEdit} /></div>
                <div className="grid gap-1.5">
                  <Label htmlFor="newSlug">Address name</Label>
                  <Input id="newSlug" name="newSlug" defaultValue={r.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={2} maxLength={40} readOnly={!canEdit} />
                  <p className="text-xs text-muted-foreground">Guests open <code>{guestUrl(r.slug)}</code>. <b className="font-medium">Changing the address name stops every printed QR code from working.</b></p>
                </div>
                {canEdit && <div><Button type="submit">Save details</Button></div>}
              </form>
            </CardContent>
          </Card>
          {access.can('import.manage') && (
            <Card>
              <CardHeader><CardTitle>Pairing suggestions</CardTitle><CardDescription>Prepares engine suggestions for dishes and wines that have none yet. It never changes a decision you made.</CardDescription></CardHeader>
              <CardContent><ActionButton action={generateSuggestions} fields={common}>Generate suggestions</ActionButton></CardContent>
            </Card>
          )}
          {setup.published && <Badge variant="outline" className="justify-self-start">Live for guests</Badge>}
        </div>
      </div>
      {env().isProduction && env().publicBaseUrlIsDefault && (
        <Alert variant="destructive" className="mt-6"><AlertDescription><span>PUBLIC_BASE_URL is not set: the QR code points to localhost. Set it to your real address before printing.</span></AlertDescription></Alert>
      )}
    </Page>
  );
}
