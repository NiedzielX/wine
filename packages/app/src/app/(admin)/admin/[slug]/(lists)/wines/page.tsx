import { WINE_STYLES, STYLE_LABELS, type WineStyle } from '@wine-match/core';
import { Button, Card, EmptyState, Input, NativeSelect, NativeSelectOption, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { ActiveBadge } from '../../../_components/badges';
import { first, zl } from '../../../_components/format';
import { ActionButton } from '../../../_components/action-form';
import { Flash } from '../../../_components/flash';
import { setWineAvailability } from '../../actions';
import { getRequestScope } from '@/server/request-scope';
import { requireAccess } from '@/server/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Wine list' };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A4 — wine list: producers, prices, glass availability and whether guests can see the wine. */
export default async function WinesPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const q = first(sp.q);
  const style = WINE_STYLES.find((s) => s === first(sp.style)) as WineStyle | undefined;
  const toggle = (await requireAccess(slug)).can('wines.toggle');
  const list = await (await getRequestScope()).cradle.adminService.wines(slug, { q, style });
  if (!list) notFound();
  const path = `/admin/${slug}/wines`;

  return (
    <Page>
      <PageHeader title="Wine list" description={`${list.active} active wines, ${list.byGlass} poured by the glass.`} />
      <Flash saved={first(sp.saved)} error={first(sp.error)} />
      <form action={path} method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" type="search" defaultValue={q} placeholder="Search producer, wine, region, grape" aria-label="Search wines" className="max-w-xs" />
        <NativeSelect name="style" defaultValue={style ?? ''} aria-label="Style" className="w-auto">
          <NativeSelectOption value="">All styles</NativeSelectOption>
          {WINE_STYLES.map((s) => <NativeSelectOption key={s} value={s}>{STYLE_LABELS[s]}</NativeSelectOption>)}
        </NativeSelect>
        <Button type="submit" variant="secondary">Filter</Button>
        {(q || style) && <Button asChild variant="ghost"><Link href={path}>Clear</Link></Button>}
      </form>
      <Card className="py-0">
        {list.rows.length === 0 ? (
          <EmptyState title="No wines found" description={list.total === 0 ? 'This restaurant has no wines yet.' : 'Try another search or style.'} action={list.total === 0 ? <Button asChild><Link href={`/admin/${slug}/import/wines`}>Import your wine list</Link></Button> : undefined} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producer and wine</TableHead><TableHead>Vintage</TableHead><TableHead>Region</TableHead><TableHead>Grape</TableHead>
                <TableHead>Style</TableHead><TableHead>Serving</TableHead><TableHead className="text-right">Glass</TableHead><TableHead className="text-right">Bottle</TableHead><TableHead>Availability</TableHead><TableHead className="w-24"><span className="sr-only">Change availability</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map(({ wine: w, approvedPairings }) => (
                <TableRow key={w.id}>
                  <TableCell className="min-w-48">
                    <Link href={`${path}/${w.id}`} className="font-medium underline-offset-4 hover:underline">{w.producer}</Link>
                    <div className="text-xs text-muted-foreground">{w.name}{approvedPairings > 0 ? ` · ${approvedPairings} approved pairings` : ''}</div>
                  </TableCell>
                  <TableCell>{w.vintage}</TableCell>
                  <TableCell>{w.region}<div className="text-xs text-muted-foreground">{w.country}</div></TableCell>
                  <TableCell className="whitespace-normal">{w.grapes.join(', ')}</TableCell>
                  <TableCell>{STYLE_LABELS[w.profile.style]}</TableCell>
                  <TableCell>{w.glassPrice !== null ? 'Glass and bottle' : 'Bottle only'}</TableCell>
                  <TableCell className="text-right tabular-nums">{w.glassPrice !== null ? zl(w.glassPrice) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{zl(w.bottlePrice)}</TableCell>
                  <TableCell><ActiveBadge active={w.active} compact /></TableCell>
                  <TableCell className="text-right">
                    {toggle && <ActionButton action={setWineAvailability} fields={{ slug, back: `${path}${sp.q || sp.style ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(style ? { style } : {}) })}` : ''}`, wineId: w.id, active: String(!w.active) }} variant="ghost">{w.active ? 'Hide' : 'Show'}</ActionButton>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </Page>
  );
}
