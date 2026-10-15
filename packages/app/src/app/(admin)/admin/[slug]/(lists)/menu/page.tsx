import { Button, Card, EmptyState, Input, NativeSelect, NativeSelectOption, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { DishStatusBadge, ProfileBadge } from '../../../_components/badges';
import { first, zl } from '../../../_components/format';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Menu' };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A2 — menu: every dish with status, taste profile state and pairing coverage. */
export default async function MenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const q = first(sp.q);
  const category = first(sp.category);
  const menu = await (await getRequestScope()).cradle.adminService.menu(slug, { q, category: category || undefined });
  if (!menu) notFound();
  const path = `/admin/${slug}/menu`;

  return (
    <Page>
      <PageHeader title="Menu" description={`${menu.total} dishes. Taste profiles drive the pairing engine; check each draft profile before relying on it.`} />
      <form action={path} method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" type="search" defaultValue={q} placeholder="Search dishes" aria-label="Search dishes" className="max-w-xs" />
        <NativeSelect name="category" defaultValue={category} aria-label="Category" className="w-auto">
          <NativeSelectOption value="">All categories</NativeSelectOption>
          {menu.categories.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
        </NativeSelect>
        <Button type="submit" variant="secondary">Filter</Button>
        {(q || category) && <Button asChild variant="ghost"><Link href={path}>Clear</Link></Button>}
      </form>
      <Card className="py-0">
        {menu.rows.length === 0 ? (
          <EmptyState title="No dishes found" description={menu.total === 0 ? 'This restaurant has no dishes yet.' : 'Try another search or category.'} action={menu.total === 0 ? <Button asChild><Link href={`/admin/${slug}/import/menu`}>Import your menu</Link></Button> : undefined} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dish</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead><TableHead>Taste profile</TableHead><TableHead className="text-right">Pairings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {menu.rows.map((r) => (
                <TableRow key={r.dish.id}>
                  <TableCell className="min-w-56 max-w-sm whitespace-normal">
                    <Link href={`${path}/${r.dish.id}`} className="font-medium underline-offset-4 hover:underline">{r.dish.name}</Link>
                    <div className="text-xs text-muted-foreground">{r.dish.description}</div>
                  </TableCell>
                  <TableCell>{r.dish.category}</TableCell>
                  <TableCell className="text-right tabular-nums">{zl(r.dish.price)}</TableCell>
                  <TableCell><DishStatusBadge status={r.dish.status} /></TableCell>
                  <TableCell><ProfileBadge source={r.dish.profile.source} /></TableCell>
                  <TableCell className="text-right tabular-nums">
                    <b className="font-semibold">{r.approved}</b> approved
                    {r.suggested > 0 && <div className="text-xs text-muted-foreground">{r.suggested} to review</div>}
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
