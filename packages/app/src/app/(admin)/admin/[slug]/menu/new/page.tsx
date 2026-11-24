import { Card, CardContent, CardHeader, CardTitle } from '@wine-match/ui';
import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { CreateDishForm } from '../../../_components/catalog-create-forms';
import { Flash } from '../../../_components/flash';
import { first } from '../../../_components/format';
import { createDish } from '../../catalog-actions';
import { requireAccess } from '@/server/auth';
import { getI18n } from '@/server/i18n';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.catalog.create.dishTitle };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * A32 (dish) — add one dish by hand (spec 2026-11-16-catalog-field-editing, R8). Needs `catalog.edit`; the page checks it itself
 * before reading anything (a hidden button is no protection). Outside `(lists)`: no `loading.tsx`, so a 403 stays a 403.
 */
export default async function NewDishPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireAccess(slug);
  if (!access.can('catalog.edit')) forbidden();
  const { t } = await getI18n();
  const cm = t.admin.catalog;
  const path = `/admin/${slug}/menu`;
  return (
    <Page>
      <PageHeader back={{ href: path, label: t.admin.dish.back }} title={cm.create.dishTitle} description={cm.create.dishText} />
      <Flash saved={first(sp.saved)} error={first(sp.error)} />
      <Card>
        <CardHeader><CardTitle>{cm.dish.title}</CardTitle></CardHeader>
        <CardContent>
          <CreateDishForm
            action={createDish} slug={slug} back={`${path}/new`}
            categories={(['Starters', 'Mains', 'Desserts'] as const).map((c) => [c, t.admin.categories[c] ?? c])}
            text={{ name: cm.dish.name, description: cm.dish.description, category: cm.dish.category, price: cm.dish.price, renameHint: cm.dish.renameHint }}
            labels={{
              save: cm.create.submitDish, baseHint: cm.dish.baseHint, errors: cm.errors, formErrors: cm.formErrors, lastEdit: null, stale: null, staleLink: cm.staleLink,
              identityWarning: null, identityConfirm: cm.identity.confirm, identityChecked: false, cancelHref: path, cancel: cm.create.cancel
            }}
          />
        </CardContent>
      </Card>
    </Page>
  );
}
