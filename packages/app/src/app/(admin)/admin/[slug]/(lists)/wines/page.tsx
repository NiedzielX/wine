import { WINE_STYLES, styleLabel, type WineStyle } from '@wine-match/core';
import { Button, Card, EmptyState, Input, NativeSelect, NativeSelectOption, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { ActiveBadge } from '../../../_components/badges';
import { PanelExplain } from '../../../_components/explain';
import { first, zl } from '../../../_components/format';
import { ActionButton } from '../../../_components/action-form';
import { Flash } from '../../../_components/flash';
import { setWineAvailability } from '../../actions';
import { getRequestScope } from '@/server/request-scope';
import { requireAccess } from '@/server/auth';
import { getI18n } from '@/server/i18n';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.wines };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A4 — wine list: producers, prices, glass availability and whether guests can see the wine. */
export default async function WinesPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const q = first(sp.q);
  const style = WINE_STYLES.find((s) => s === first(sp.style)) as WineStyle | undefined;
  const toggle = (await requireAccess(slug)).can('wines.toggle');
  const list = await (await getRequestScope()).cradle.adminService.wines(slug, { q, style }, (await getI18n()).locale);
  if (!list) notFound();
  const path = `/admin/${slug}/wines`;
  const { locale, t } = await getI18n();
  const m = t.admin.wines;

  return (
    <Page>
      <PageHeader title={m.title} description={m.description(list.active, list.byGlass)} />
      <PanelExplain id="wines" className="-mt-3 mb-4" summary={t.admin.explain.wines.summary} points={t.admin.explain.wines.points} />
      <Flash saved={first(sp.saved)} error={first(sp.error)} />
      <form action={path} method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" type="search" defaultValue={q} placeholder={m.search} aria-label={m.searchLabel} className="max-w-xs" />
        <NativeSelect name="style" defaultValue={style ?? ''} aria-label={m.style} className="w-auto">
          <NativeSelectOption value="">{m.allStyles}</NativeSelectOption>
          {WINE_STYLES.map((s) => <NativeSelectOption key={s} value={s}>{styleLabel(s, locale)}</NativeSelectOption>)}
        </NativeSelect>
        <Button type="submit" variant="secondary">{t.admin.common.filter}</Button>
        {(q || style) && <Button asChild variant="ghost"><Link href={path}>{t.admin.common.clear}</Link></Button>}
      </form>
      <Card className="py-0">
        {list.rows.length === 0 ? (
          <EmptyState title={m.noneTitle} description={list.total === 0 ? m.noneEmpty : m.noneFiltered} action={list.total === 0 ? <Button asChild><Link href={`/admin/${slug}/import/wines`}>{m.importWines}</Link></Button> : undefined} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.producerAndWine}</TableHead><TableHead>{m.vintage}</TableHead><TableHead>{m.region}</TableHead><TableHead>{m.grape}</TableHead>
                <TableHead>{m.style}</TableHead><TableHead>{m.serving}</TableHead><TableHead className="text-right">{m.glass}</TableHead><TableHead className="text-right">{m.bottle}</TableHead><TableHead>{m.availability}</TableHead><TableHead className="w-24"><span className="sr-only">{m.changeAvailability}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map(({ wine: w, approvedPairings }) => (
                <TableRow key={w.id}>
                  <TableCell className="min-w-48">
                    <Link href={`${path}/${w.id}`} className="font-medium underline-offset-4 hover:underline">{w.producer}</Link>
                    <div className="text-xs text-muted-foreground">{w.name}{approvedPairings > 0 ? ` · ${m.approvedPairings(approvedPairings)}` : ''}</div>
                  </TableCell>
                  <TableCell>{w.vintage}</TableCell>
                  <TableCell>{w.region}<div className="text-xs text-muted-foreground">{w.country}</div></TableCell>
                  <TableCell className="whitespace-normal">{w.grapes.join(', ')}</TableCell>
                  <TableCell>{styleLabel(w.profile.style, locale)}</TableCell>
                  <TableCell>{w.glassPrice !== null ? m.glassAndBottle : m.bottleOnly}</TableCell>
                  <TableCell className="text-right tabular-nums">{w.glassPrice !== null ? zl(w.glassPrice, locale) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{zl(w.bottlePrice, locale)}</TableCell>
                  <TableCell><ActiveBadge active={w.active} compact t={t} /></TableCell>
                  <TableCell className="text-right">
                    {toggle && <ActionButton action={setWineAvailability} fields={{ slug, back: `${path}${sp.q || sp.style ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(style ? { style } : {}) })}` : ''}`, wineId: w.id, active: String(!w.active) }} variant="ghost">{w.active ? m.hide : m.show}</ActionButton>}
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
