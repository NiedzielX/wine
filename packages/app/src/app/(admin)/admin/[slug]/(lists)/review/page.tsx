import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardHeader, CardTitle, Progress } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { ScoreBadge } from '../../../_components/badges';
import { ActionButton } from '../../../_components/action-form';
import { Flash, ReadOnlyNotice } from '../../../_components/flash';
import { first } from '../../../_components/format';
import { approveAllPairings, approvePairing, rejectPairing } from '../../actions';
import { getRequestScope } from '@/server/request-scope';
import { requireAccess } from '@/server/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Review queue' };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A7 — review queue: the engine's suggestions that no sommelier has decided yet. */
export default async function ReviewPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const decide = (await requireAccess(slug)).can('pairings.decide');
  const q = await (await getRequestScope()).cradle.adminService.reviewQueue(slug);
  if (!q) notFound();
  const { progress, groups } = q;
  const common = { slug, back: `/admin/${slug}/review` };
  const pct = progress.dishesWithPairings ? Math.round((progress.reviewedDishes / progress.dishesWithPairings) * 100) : 100;

  return (
    <Page>
      <PageHeader
        title="Review queue"
        description="Pairings the engine proposed for your list. Nothing here is labelled as a sommelier recommendation until you approve it."
        actions={decide && progress.suggestions > 0 ? <ActionButton action={approveAllPairings} fields={{ ...common, dishId: '' }} variant="default" size="default">Approve all {progress.suggestions}</ActionButton> : undefined}
      />
      {!decide && <ReadOnlyNotice>You can follow the review queue. Only the Wine Director approves or rejects pairings.</ReadOnlyNotice>}
      <Flash saved={first(sp.saved)} error={first(sp.error)} n={first(sp.n)} />
      <Card className="mb-6">
        <CardContent className="grid gap-2.5">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <b className="font-semibold">{progress.reviewedDishes} of {progress.dishesWithPairings} dishes have at least one approved pairing</b>
            <span className="text-muted-foreground">{progress.suggestions} suggestions left</span>
          </div>
          <Progress value={pct} aria-label="Review progress" />
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <Alert><AlertTitle>Everything is reviewed</AlertTitle><AlertDescription>Guests see your approved pairings first, with the engine filling any remaining places.</AlertDescription></Alert>
      ) : (
        <div className="grid gap-4">
          {groups.map((g) => (
            <Card key={g.dish.id} className="gap-0 py-0">
              <CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/50 py-3">
                <div className="min-w-0">
                  <CardTitle className="font-serif text-lg font-medium">{g.dish.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{g.dish.category}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!g.hasPrimary && <Badge variant="outline">No primary pick yet</Badge>}
                  {decide && <ActionButton action={approveAllPairings} fields={{ ...common, dishId: g.dish.id }}>Approve all for this dish</ActionButton>}
                  <Button asChild variant="outline" size="sm"><Link href={`/admin/${slug}/pairings/${g.dish.id}`}>Open pairings</Link></Button>
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
                      <ScoreBadge score={i.pairing.modelScore} />
                      {decide && <ActionButton action={approvePairing} fields={{ ...common, pairingId: i.pairing.id, version: i.pairing.version }}>Approve</ActionButton>}
                      {decide && <ActionButton action={rejectPairing} fields={{ ...common, pairingId: i.pairing.id, version: i.pairing.version }} variant="ghost">Reject</ActionButton>}
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
