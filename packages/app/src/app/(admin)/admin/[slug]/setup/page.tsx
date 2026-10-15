import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@wine-match/ui';
import type { SetupStep, SetupStepKey } from '@wine-match/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../_components/admin-shell';
import { ActionButton, Hidden } from '../../_components/action-form';
import { Flash, ReadOnlyNotice } from '../../_components/flash';
import { first } from '../../_components/format';
import { saveRestaurantDetails, generateSuggestions } from '../import-actions';
import { requireAccess } from '@/server/auth';
import { getI18n } from '@/server/i18n';
import { env } from '@/server/env';
import { guestUrl } from '@/server/qr';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.setup };
}

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
  const { t } = await getI18n();
  const m = t.admin.setup;
  const HREFS: Partial<Record<SetupStepKey, string>> = {
    menu: `${base}/import/menu`, wines: `${base}/import/wines`, profiles: `${base}/menu`, pairings: `${base}/review`, publish: `${base}/publish`, qr: `${base}/qr`
  };
  const detail = (s: SetupStep) => (s.state === 'details' ? m.states.details(r) : m.states[s.state](s.values));

  return (
    <Page>
      <PageHeader title={m.title} description={m.description} />
      <Flash saved={first(sp.saved)} error={first(sp.error)} n={first(sp.n)} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4"><CardTitle>{m.checklist}</CardTitle><CardDescription>{next ? m.next(m.steps[next.key]) : m.allDone}</CardDescription></CardHeader>
          <CardContent className="px-0">
            {setup.steps.map((step) => ({ ...step, href: HREFS[step.key] })).map((s, i) => (
              <div key={s.key} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-3 border-b px-6 py-4 last:border-b-0">
                <span aria-hidden="true" className={`grid size-6 place-items-center rounded-full text-xs ${s.done ? 'bg-sage-soft text-sage' : s.key === next?.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{s.done ? '✓' : i + 1}</span>
                <div className="min-w-0 text-sm"><b className="font-medium">{m.steps[s.key]}</b><div className="text-muted-foreground">{detail(s)}</div></div>
                {s.href && (!s.done || s.key === 'qr') && <Button asChild size="sm" variant={s.key === next?.key ? 'default' : 'outline'}><Link href={s.href}>{m.links[s.key]}</Link></Button>}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><CardTitle>{m.details}</CardTitle><CardDescription>{m.detailsText}</CardDescription></CardHeader>
            <CardContent>
              {!canEdit && <ReadOnlyNotice>{m.readOnly}</ReadOnlyNotice>}
              <form action={saveRestaurantDetails} className="grid gap-4">
                <Hidden fields={common} />
                <div className="grid gap-1.5"><Label htmlFor="name">{m.name}</Label><Input id="name" name="name" defaultValue={r.name} required maxLength={120} readOnly={!canEdit} /></div>
                <div className="grid gap-1.5"><Label htmlFor="address">{m.address}</Label><Input id="address" name="address" defaultValue={r.address} required readOnly={!canEdit} /></div>
                <div className="grid gap-1.5"><Label htmlFor="city">{m.city}</Label><Input id="city" name="city" defaultValue={r.city} required readOnly={!canEdit} /></div>
                <div className="grid gap-1.5"><Label htmlFor="wineDirector">{m.wineDirector}</Label><Input id="wineDirector" name="wineDirector" defaultValue={r.wineDirector} required readOnly={!canEdit} /></div>
                <div className="grid gap-1.5">
                  <Label htmlFor="newSlug">{m.slug}</Label>
                  <Input id="newSlug" name="newSlug" defaultValue={r.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={2} maxLength={40} readOnly={!canEdit} />
                  <p className="text-xs text-muted-foreground">{m.slugHelpBefore} <code>{guestUrl(r.slug)}</code>. <b className="font-medium">{m.slugWarning}</b></p>
                </div>
                {canEdit && <div><Button type="submit">{m.save}</Button></div>}
              </form>
            </CardContent>
          </Card>
          {access.can('import.manage') && (
            <Card>
              <CardHeader><CardTitle>{m.suggestions}</CardTitle><CardDescription>{m.suggestionsText}</CardDescription></CardHeader>
              <CardContent><ActionButton action={generateSuggestions} fields={common}>{m.generate}</ActionButton></CardContent>
            </Card>
          )}
          {setup.published && <Badge variant="outline" className="justify-self-start">{m.live}</Badge>}
        </div>
      </div>
      {env().isProduction && env().publicBaseUrlIsDefault && (
        <Alert variant="destructive" className="mt-6"><AlertDescription><span>{m.noBaseUrl}</span></AlertDescription></Alert>
      )}
    </Page>
  );
}
