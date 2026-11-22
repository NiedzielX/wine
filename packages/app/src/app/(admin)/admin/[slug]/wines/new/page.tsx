import { WINE_STYLES, styleLabel } from '@wine-match/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wine-match/ui';
import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { CreateWineForm } from '../../../_components/catalog-create-forms';
import { Flash } from '../../../_components/flash';
import { first } from '../../../_components/format';
import { createWine } from '../../catalog-actions';
import { requireAccess } from '@/server/auth';
import { getI18n } from '@/server/i18n';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.catalog.create.wineTitle };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A32 (wine) — add one wine by hand (spec 2026-11-16-catalog-field-editing, R8). Needs `catalog.edit`, checked before any read; no `loading.tsx` here, so a 403 stays a 403. */
export default async function NewWinePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireAccess(slug);
  if (!access.can('catalog.edit')) forbidden();
  const { locale, t } = await getI18n();
  const cm = t.admin.catalog;
  const path = `/admin/${slug}/wines`;
  return (
    <Page>
      <PageHeader back={{ href: path, label: t.admin.wine.back }} title={cm.create.wineTitle} description={cm.create.wineText} />
      <Flash saved={first(sp.saved)} error={first(sp.error)} />
      <Card>
        <CardHeader><CardTitle>{cm.wine.title}</CardTitle><CardDescription>{cm.wine.text}</CardDescription></CardHeader>
        <CardContent>
          <CreateWineForm
            action={createWine} slug={slug} back={`${path}/new`} styles={WINE_STYLES.map((s) => [s, styleLabel(s, locale)])}
            text={{
              producer: cm.wine.producer, name: cm.wine.name, vintage: cm.wine.vintage, region: cm.wine.region, country: cm.wine.country, tastingNote: cm.wine.tastingNote,
              listNumber: cm.wine.listNumber, listNumberHint: cm.create.listNumberHint, bottlePrice: cm.wine.bottlePrice, pouredByGlass: cm.wine.pouredByGlass,
              glassPrice: cm.wine.glassPrice, glassHint: cm.wine.glassHint, style: cm.create.style, grape: cm.create.grape, grapeHint: cm.create.grapeHint
            }}
            labels={{
              save: cm.create.submitWine, baseHint: cm.dish.baseHint, errors: cm.errors, formErrors: cm.formErrors, lastEdit: null, stale: null, staleLink: cm.staleLink,
              identityWarning: null, identityConfirm: cm.identity.confirm, identityChecked: false, cancelHref: path, cancel: cm.create.cancel
            }}
          />
        </CardContent>
      </Card>
    </Page>
  );
}
