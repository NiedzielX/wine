import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, MatchGlass, NativeSelect, NativeSelectOption, Textarea } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { ActionButton, Hidden } from '../../../_components/action-form';
import { DishStatusBadge, PairingStatusBadge, RoleBadge, ScoreBadge } from '../../../_components/badges';
import { Flash, ReadOnlyNotice } from '../../../_components/flash';
import { first, formatDateTime, zl } from '../../../_components/format';
import { addPairing, approveAllPairings, approvePairing, deletePairing, movePairing, rejectPairing, restorePairing, savePairingNote, setPairingRole } from '../../actions';
import { getRequestScope } from '@/server/request-scope';
import { requireAccess } from '@/server/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pairings' };

type Props = { params: Promise<{ slug: string; dishId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const ACTION_LABEL: Record<string, string> = {
  approve: 'approved', modify: 'modified', reject: 'rejected', restore: 'restored', set_role: 'changed the role of',
  reorder: 'reordered', comment: 'edited the note of', create: 'added', delete: 'deleted'
};

/** A6 — pairing management: the sommelier's decisions for one dish, and what guests see now. */
export default async function PairingsPage({ params, searchParams }: Props) {
  const { slug, dishId } = await params;
  const sp = await searchParams;
  const { adminService, recommendationService } = (await getRequestScope()).cradle;
  const decide = (await requireAccess(slug)).can('pairings.decide');
  const w = await adminService.pairingWorkbench(slug, dishId);
  if (!w) notFound();
  const { dish } = w;
  const guest = await recommendationService.forDish(slug, dish.id);
  const guestItems = guest?.result.items ?? [];
  const path = `/admin/${slug}/pairings/${dish.id}`;
  const common = { slug, back: path };
  const pair = (p: { id: string; version?: number }) => ({ ...common, pairingId: p.id, version: p.version });

  return (
    <Page>
      <PageHeader
        back={{ href: `/admin/${slug}/menu/${dish.id}`, label: dish.name }}
        title={`Pairings: ${dish.name}`}
        description={dish.description}
        actions={dish.status === 'published' ? <Button asChild variant="outline"><Link href={`/r/${slug}/dish/${dish.id}`}>View as guest</Link></Button> : <DishStatusBadge status={dish.status} />}
      />
      {!decide && <ReadOnlyNotice>You can see every pairing, the history and what guests see. Only the Wine Director decides pairings.</ReadOnlyNotice>}
      <Flash saved={first(sp.saved)} error={first(sp.error)} n={first(sp.n)} />

      <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        <nav aria-label="Dishes" className="order-3 xl:order-none">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-3"><CardTitle className="text-sm">Dishes</CardTitle></CardHeader>
            <CardContent className="max-h-80 overflow-y-auto px-0 xl:max-h-[70dvh]">
              {w.menu.map((r) => (
                <Link key={r.dish.id} href={`/admin/${slug}/pairings/${r.dish.id}`} aria-current={r.dish.id === dish.id ? 'page' : undefined}
                  className="flex items-center justify-between gap-2 border-b px-4 py-2.5 text-sm last:border-b-0 hover:bg-accent aria-[current=page]:bg-accent">
                  <span className="min-w-0 truncate">{r.dish.name}</span>
                  {r.suggested > 0 ? <Badge variant="secondary" className="tabular-nums">{r.suggested}</Badge> : <span className="text-xs text-muted-foreground tabular-nums">{r.approved}</span>}
                </Link>
              ))}
            </CardContent>
          </Card>
        </nav>

        <div className="grid min-w-0 content-start gap-6">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Approved for guests</CardTitle>
              <CardDescription>In this order. The primary pick always comes first; guests see your note as “Why it works”.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {w.approved.length === 0 && <p className="px-6 py-8 text-center text-sm text-muted-foreground">No approved pairings yet. Approve an engine suggestion below, or add your own.</p>}
              {w.approved.map((p, i) => (
                <div key={p.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b px-6 py-4 last:border-b-0">
                  <span className="font-serif text-2xl leading-tight text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{p.wine ? `${p.wine.producer} ${p.wine.name}` : 'Wine removed'}</div>
                        {p.wine && <div className="text-xs text-muted-foreground">{p.wine.vintage}, {p.wine.region}. {p.wine.glassPrice !== null ? `${zl(p.wine.glassPrice)} glass, ` : 'Bottle only, '}{zl(p.wine.bottlePrice)} bottle{p.wine.active ? '' : ' · hidden from guests'}</div>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PairingStatusBadge status={p.status} /><RoleBadge role={p.role} /><ScoreBadge score={p.modelScore} />
                        {p.dirty && <Badge variant="outline" className="border-brass text-brass">Unpublished</Badge>}
                      </div>
                    </div>
                    {p.comment && <p className="mt-2 text-sm text-muted-foreground italic">“{p.comment}”</p>}
                    {decide && (
                      <>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <form action={setPairingRole} className="inline-flex gap-1.5">
                        <Hidden fields={pair(p)} />
                        <NativeSelect name="role" defaultValue={p.role ?? 'alternative'} aria-label={`Role of ${p.wine?.name ?? 'pairing'}`} className="h-8 w-auto text-sm">
                          <NativeSelectOption value="primary">Primary</NativeSelectOption>
                          <NativeSelectOption value="alternative">Alternative</NativeSelectOption>
                          <NativeSelectOption value="best_value">Best value</NativeSelectOption>
                        </NativeSelect>
                        <Button type="submit" size="sm" variant="outline">Set role</Button>
                      </form>
                      <ActionButton action={movePairing} fields={{ ...pair(p), direction: 'up' }} disabled={!p.canMoveUp} title="Move up">↑ Up</ActionButton>
                      <ActionButton action={movePairing} fields={{ ...pair(p), direction: 'down' }} disabled={!p.canMoveDown} title="Move down">↓ Down</ActionButton>
                      <ActionButton action={rejectPairing} fields={pair(p)} variant="ghost" title="Never recommend this wine with the dish">Reject</ActionButton>
                      {p.source === 'sommelier' && <ActionButton action={deletePairing} fields={pair(p)} variant="ghost" title="Delete this pairing">Delete</ActionButton>}
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">{p.comment ? 'Edit note for guests' : 'Add a note for guests'}</summary>
                      <form action={savePairingNote} className="mt-2 grid max-w-lg gap-2">
                        <Hidden fields={pair(p)} />
                        <Textarea name="comment" maxLength={140} defaultValue={p.comment ?? ''} placeholder="Shown as “Why it works”. 140 characters." aria-label="Note for guests" />
                        <div><Button type="submit" size="sm" variant="outline">Save note</Button></div>
                      </form>
                    </details>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="flex-row items-center justify-between gap-3 border-b py-4">
              <div><CardTitle>Engine suggestions</CardTitle><CardDescription>Guests see these as “Best match”, never as your recommendation, until you approve them.</CardDescription></div>
              {decide && w.suggested.length > 0 && <ActionButton action={approveAllPairings} fields={{ ...common, dishId: dish.id }}>Approve all {w.suggested.length}</ActionButton>}
            </CardHeader>
            <CardContent className="px-0">
              {w.suggested.length === 0 && <p className="px-6 py-8 text-center text-sm text-muted-foreground">All suggestions reviewed.</p>}
              {w.suggested.map((p) => (
                <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b px-6 py-3 last:border-b-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{p.wine ? `${p.wine.producer} ${p.wine.name}` : 'Wine removed'} <ScoreBadge score={p.modelScore} /></div>
                    <p className="text-xs text-muted-foreground">{p.why}</p>
                  </div>
                  {decide && (
                  <div className="flex gap-1.5">
                    <ActionButton action={approvePairing} fields={pair(p)}>Approve</ActionButton>
                    <ActionButton action={rejectPairing} fields={pair(p)} variant="ghost">Reject</ActionButton>
                  </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {decide && (
          <Card>
            <CardHeader><CardTitle>Add your own pairing</CardTitle><CardDescription>Pick any wine on the list. The engine score is shown for reference; your choice always wins.</CardDescription></CardHeader>
            <CardContent>
              <form action={addPairing} className="grid gap-3 sm:grid-cols-2">
                <Hidden fields={{ ...common, dishId: dish.id }} />
                <label className="grid gap-1.5 text-sm sm:col-span-2"><span className="font-medium">Wine</span>
                  <NativeSelect name="wineId" defaultValue="" required>
                    <NativeSelectOption value="" disabled>Choose a wine</NativeSelectOption>
                    {w.addable.map((a) => <NativeSelectOption key={a.wine.id} value={a.wine.id}>{a.wine.producer} {a.wine.name} (engine {a.score}%)</NativeSelectOption>)}
                  </NativeSelect>
                </label>
                <label className="grid gap-1.5 text-sm"><span className="font-medium">Role</span>
                  <NativeSelect name="role" defaultValue="alternative">
                    <NativeSelectOption value="alternative">Alternative</NativeSelectOption>
                    <NativeSelectOption value="primary">Primary recommendation</NativeSelectOption>
                    <NativeSelectOption value="best_value">Best value</NativeSelectOption>
                  </NativeSelect>
                </label>
                <label className="grid gap-1.5 text-sm"><span className="font-medium">Note for guests (optional)</span>
                  <Input name="comment" maxLength={140} placeholder="Why it works, in your words" />
                </label>
                <div className="sm:col-span-2"><Button type="submit">Add pairing</Button></div>
              </form>
            </CardContent>
          </Card>
          )}

          {w.rejected.length > 0 && (
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-4"><CardTitle>Rejected</CardTitle><CardDescription>Never recommended with this dish once published.</CardDescription></CardHeader>
              <CardContent className="px-0">
                {w.rejected.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-4 border-b px-6 py-3 text-sm last:border-b-0">
                    <span className="font-medium">{p.wine ? `${p.wine.producer} ${p.wine.name}` : 'Wine removed'}</span>
                    {decide && <ActionButton action={restorePairing} fields={pair(p)}>Restore as suggestion</ActionButton>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>History</CardTitle><CardDescription>The latest decisions on this dish. The trail is kept even when a pairing is deleted.</CardDescription></CardHeader>
            <CardContent>
              {w.history.length === 0 ? <p className="text-sm text-muted-foreground">No decisions yet.</p> : (
                <ul className="grid gap-2 text-sm">
                  {w.history.map((h) => (
                    <li key={h.id} className="flex flex-wrap justify-between gap-x-4 text-muted-foreground">
                      <span><b className="font-medium text-foreground">{h.actor}</b> {ACTION_LABEL[h.action] ?? h.action} {h.wineName}</span>
                      <time dateTime={h.at}>{formatDateTime(h.at)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="order-2 content-start xl:order-none">
          <CardHeader><CardTitle>What guests see now</CardTitle><CardDescription>The published version, no filters.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            {w.hasUnpublishedChanges && (
              <Alert className="border-brass/40 bg-brass-soft text-brass">
                <AlertDescription className="text-brass">This dish has changes guests don’t see yet. <Link className="font-medium underline" href={`/admin/${slug}/publish`}>Publish</Link> to show them.</AlertDescription>
              </Alert>
            )}
            {guestItems.length === 0 && <p className="text-sm text-muted-foreground">Not shown to guests: the dish is not published or nothing passes the threshold.</p>}
            {guestItems.map((i, k) => (
              <div key={i.wine.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <span className="w-4 text-muted-foreground tabular-nums">{k + 1}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{i.wine.producer} {i.wine.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {i.sommelier && <Badge className="border-transparent bg-brass-soft text-brass">Sommelier</Badge>}
                    {i.bestValue && <Badge className="border-transparent bg-sage-soft text-sage">Best value</Badge>}
                  </div>
                </div>
                <div className="grid justify-items-center text-muted-foreground">
                  <MatchGlass score={i.matchScore} colour={i.wine.colour} size={28} />
                  <span className="text-xs font-semibold text-foreground tabular-nums">{i.matchScore}%</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
