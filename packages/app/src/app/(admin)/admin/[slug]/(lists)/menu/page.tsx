import { Button, Card, EmptyState, Input, NativeSelect, NativeSelectOption, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { DishStatusBadge, ProfileBadge } from '../../../_components/badges';
import { PanelExplain } from '../../../_components/explain';
import { first, zl } from '../../../_components/format';
import { getI18n } from '@/server/i18n';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.menu };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A2 — menu: every dish with status, taste profile state and pairing coverage. */
export default async function MenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const q = first(sp.q);
  const category = first(sp.category);
  const menu = await (await getRequestScope()).cradle.adminService.menu(slug, { q, category: category || undefined }, (await getI18n()).locale);
  if (!menu) notFound();
  const path = `/admin/${slug}/menu`;
  const { locale, t } = await getI18n();
  const m = t.admin.menu;
  const category_ = (c: string) => t.admin.categories[c] ?? c;

  return (
    <Page>
      <PageHeader title={m.title} description={m.description(menu.total)} />
      <PanelExplain id="menu" className="-mt-3 mb-4" summary={t.admin.explain.menu.summary} points={t.admin.explain.menu.points} />
      <form action={path} method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" type="search" defaultValue={q} placeholder={m.search} aria-label={m.search} className="max-w-xs" />
        <NativeSelect name="category" defaultValue={category} aria-label={m.category} className="w-auto">
          <NativeSelectOption value="">{m.allCategories}</NativeSelectOption>
          {menu.categories.map((c) => <NativeSelectOption key={c} value={c}>{category_(c)}</NativeSelectOption>)}
        </NativeSelect>
        <Button type="submit" variant="secondary">{t.admin.common.filter}</Button>
        {(q || category) && <Button asChild variant="ghost"><Link href={path}>{t.admin.common.clear}</Link></Button>}
      </form>
      <Card className="py-0">
        {menu.rows.length === 0 ? (
          <EmptyState title={m.noneTitle} description={menu.total === 0 ? m.noneEmpty : m.noneFiltered} action={menu.total === 0 ? <Button asChild><Link href={`/admin/${slug}/import/menu`}>{m.importMenu}</Link></Button> : undefined} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.dish}</TableHead><TableHead>{m.category}</TableHead><TableHead className="text-right">{m.price}</TableHead>
                <TableHead>{m.status}</TableHead><TableHead>{m.profile}</TableHead><TableHead className="text-right">{m.pairings}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {menu.rows.map((r) => (
                <TableRow key={r.dish.id}>
                  <TableCell className="min-w-56 max-w-sm whitespace-normal">
                    <Link href={`${path}/${r.dish.id}`} className="font-medium underline-offset-4 hover:underline">{r.dish.name}</Link>
                    <div className="text-xs text-muted-foreground">{r.dish.description}</div>
                  </TableCell>
                  <TableCell>{category_(r.dish.category)}</TableCell>
                  <TableCell className="text-right tabular-nums">{zl(r.dish.price, locale)}</TableCell>
                  <TableCell><DishStatusBadge status={r.dish.status} t={t} /></TableCell>
                  <TableCell><ProfileBadge source={r.dish.profile.source} t={t} /></TableCell>
                  <TableCell className="text-right tabular-nums">
                    <b className="font-semibold">{r.approved}</b> {m.approved}
                    {r.suggested > 0 && <div className="text-xs text-muted-foreground">{m.toReview(r.suggested)}</div>}
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
