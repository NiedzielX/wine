import { styleLabel } from '@wine-match/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, LevelMeter } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { ActiveBadge, RoleBadge, ScoreBadge } from '../../../_components/badges';
import { first, vintageLabel, zl } from '../../../_components/format';
import { Flash } from '../../../_components/flash';
import { TranslationsCard } from '../../../_components/translations-form';
import { saveWineTranslations } from '../../actions';
import { TEXT_LIMITS, translationsVersion } from '@wine-match/core';
import { requireAccess } from '@/server/auth';
import { getI18n } from '@/server/i18n';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.wine };
}

type Props = { params: Promise<{ slug: string; wineId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const SCALES = ['body', 'acidity', 'tannin', 'sweetness', 'fruitiness', 'oak', 'aromatic', 'freshness'] as const;

/** A5 — wine details: listing, prices, profile and the dishes it suits best. */
export default async function WinePage({ params, searchParams }: Props) {
  const { slug, wineId } = await params;
  const sp = await searchParams;
  const canTranslate = (await requireAccess(slug)).can('import.manage');
  const { locale, t } = await getI18n();
  const m = t.admin.wine;
  const d = await (await getRequestScope()).cradle.adminService.wineDetail(slug, wineId, locale);
  if (!d) notFound();
  const { wine: w, source, bestDishes, approvedFor } = d;
  const tm = t.admin.translations.fields;
  const p = w.profile;

  return (
    <Page>
      <PageHeader
        back={{ href: `/admin/${slug}/wines`, label: m.back }}
        title={`${w.producer} ${w.name}`}
        description={`${vintageLabel(w, locale)}, ${w.region}, ${w.country}. ${w.grapes.join(', ')}.`}
      />
      <Flash saved={first(sp.saved)} error={first(sp.error)} n={first(sp.n)} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3"><CardTitle>{m.listing}</CardTitle><ActiveBadge active={w.active} t={t} /></div>
            <CardDescription>{w.tastingNote}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <div><dt className="text-muted-foreground">{m.style}</dt><dd className="mt-0.5 font-medium">{m.abv(styleLabel(p.style, locale), p.alcohol)}</dd></div>
              <div><dt className="text-muted-foreground">{m.listNo}</dt><dd className="mt-0.5 font-medium tabular-nums">{w.listNumber ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground">{m.serving}</dt><dd className="mt-0.5 font-medium">{w.glassPrice !== null ? m.glassAndBottle(w.glassPour) : m.bottleOnly}</dd></div>
              <div><dt className="text-muted-foreground">{m.glassPrice}</dt><dd className="mt-0.5 font-medium tabular-nums">{w.glassPrice !== null ? zl(w.glassPrice, locale) : '—'}</dd></div>
              <div><dt className="text-muted-foreground">{m.bottlePrice}</dt><dd className="mt-0.5 font-medium tabular-nums">{zl(w.bottlePrice, locale)} ({w.bottleSize} ml)</dd></div>
              <div><dt className="text-muted-foreground">{m.character}</dt><dd className="mt-0.5 font-medium">{p.adventurous ? m.adventurous : m.classic}</dd></div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.bestDishes}</CardTitle>
            <CardDescription>{m.bestDishesText}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {bestDishes.map((x) => (
              <div key={x.dish.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/admin/${slug}/menu/${x.dish.id}`} className="font-medium underline-offset-4 hover:underline">{x.dish.name}</Link>
                  <p className="text-xs text-muted-foreground">{x.why}</p>
                </div>
                <ScoreBadge score={x.score} t={t} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{m.profile}</CardTitle><CardDescription>{m.profileText}</CardDescription></CardHeader>
          <CardContent>
            <dl className="grid gap-3">
              {SCALES.map((key) => (
                <div key={key} className="flex items-center justify-between gap-4 text-sm"><dt>{m.scales[key]}</dt><dd><LevelMeter value={p[key]} label={t.admin.common.levelOf} /></dd></div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.approved}</CardTitle>
            <CardDescription>{m.approvedText}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {approvedFor.length === 0 ? <p className="text-sm text-muted-foreground">{m.noApproved}</p> : approvedFor.map((x) => (
              <div key={x.dish.id} className="flex items-center justify-between gap-3 text-sm">
                <Link href={`/admin/${slug}/pairings/${x.dish.id}`} className="font-medium underline-offset-4 hover:underline">{x.dish.name}</Link>
                <RoleBadge role={x.role} t={t} />
              </div>
            ))}
          </CardContent>
        </Card>

        <TranslationsCard
          action={saveWineTranslations} hidden={{ slug, back: `/admin/${slug}/wines/${w.id}`, wineId: w.id }} t={t} canEdit={canTranslate}
          contentLocale={d.restaurant.contentLocale} translations={source.translations} version={translationsVersion(source.translations)}
          fields={[
            { key: 'tastingNote', label: tm.tastingNote, base: source.tastingNote, max: TEXT_LIMITS.tastingNote, multiline: true },
            { key: 'region', label: tm.region, base: source.region, max: TEXT_LIMITS.region },
            { key: 'country', label: tm.country, base: source.country, max: TEXT_LIMITS.country }
          ]}
        />
      </div>
    </Page>
  );
}
