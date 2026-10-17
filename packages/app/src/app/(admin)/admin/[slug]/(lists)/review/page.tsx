import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardHeader, CardTitle, Progress } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { ENGINE_FACTS } from '@wine-match/core';
import { ScoreBadge } from '../../../_components/badges';
import { PanelExplain } from '../../../_components/explain';
import { ActionButton } from '../../../_components/action-form';
import { Flash, ReadOnlyNotice } from '../../../_components/flash';
import { first } from '../../../_components/format';
import { approveAllPairings, approvePairing, rejectPairing } from '../../actions';
import { getRequestScope } from '@/server/request-scope';
import { requireAccess } from '@/server/auth';
import { getI18n } from '@/server/i18n';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.review };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A7 — review queue: the engine's suggestions that no sommelier has decided yet. */
export default async function ReviewPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const decide = (await requireAccess(slug)).can('pairings.decide');
  const { locale, t } = await getI18n();
  const m = t.admin.review;
  const q = await (await getRequestScope()).cradle.adminService.reviewQueue(slug, locale);
  if (!q) notFound();
  const { progress, groups } = q;
  const common = { slug, back: `/admin/${slug}/review` };
  const pct = progress.dishesWithPairings ? Math.round((progress.reviewedDishes / progress.dishesWithPairings) * 100) : 100;

  return (
    <Page>
      <PageHeader
        title={m.title}
        description={m.description}
        actions={decide && progress.suggestions > 0 ? <ActionButton action={approveAllPairings} fields={{ ...common, dishId: '' }} variant="default" size="default">{m.approveAll(progress.suggestions)}</ActionButton> : undefined}
      />
      {!decide && <ReadOnlyNotice>{m.readOnly}</ReadOnlyNotice>}
      <Flash saved={first(sp.saved)} error={first(sp.error)} n={first(sp.n)} />
      <Card className="mb-6">
        <CardContent className="grid gap-2.5">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <b className="font-semibold">{m.progress(progress.reviewedDishes, progress.dishesWithPairings)}</b>
            <span className="text-muted-foreground">{m.left(progress.suggestions)}</span>
          </div>
          <Progress value={pct} aria-label={m.progressLabel} />
          <PanelExplain id="review" summary={t.admin.explain.review.summary} points={t.admin.explain.review.points(ENGINE_FACTS)} />
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <Alert><AlertTitle>{m.doneTitle}</AlertTitle><AlertDescription>{m.doneText}</AlertDescription></Alert>
      ) : (
        <div className="grid gap-4">
          {groups.map((g) => (
            <Card key={g.dish.id} className="gap-0 py-0">
              <CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/50 py-3">
                <div className="min-w-0">
                  <CardTitle className="font-serif text-lg font-medium">{g.dish.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{t.admin.categories[g.dish.category] ?? g.dish.category}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!g.hasPrimary && <Badge variant="outline">{m.noPrimary}</Badge>}
                  {decide && <ActionButton action={approveAllPairings} fields={{ ...common, dishId: g.dish.id }}>{m.approveDish}</ActionButton>}
                  <Button asChild variant="outline" size="sm"><Link href={`/admin/${slug}/pairings/${g.dish.id}`}>{m.openPairings}</Link></Button>
                </div>
              </CardHeader>
              <CardContent className="divide-y px-0">
                {g.items.map((i) => (
                  <div key={i.pairing.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 py-3 text-sm">
                    <div className="min-w-0">
                      <Link href={`/admin/${slug}/wines/${i.wine.id}`} className="font-medium underline-offset-4 hover:underline">{i.wine.producer} {i.wine.name}</Link>
                      <span className="text-muted-foreground"> {i.wine.vintage}</span>
                      <p className="text-xs text-muted-foreground">{i.why}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ScoreBadge score={i.pairing.modelScore} t={t} />
                      {decide && <ActionButton action={approvePairing} fields={{ ...common, pairingId: i.pairing.id, version: i.pairing.version }}>{m.approve}</ActionButton>}
                      {decide && <ActionButton action={rejectPairing} fields={{ ...common, pairingId: i.pairing.id, version: i.pairing.version }} variant="ghost">{m.reject}</ActionButton>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
