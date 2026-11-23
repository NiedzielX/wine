import {
  PICKS_PROMOTED_MAX, PICK_MIN_SCORE, PICK_WINDOW, simulationQueryFromSearch,
  type DishSimulation, type PickSimulation, type PicksSimulation, type SimulatedItem
} from '@wine-match/core';
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorMessage, Input, NativeSelect, NativeSelectOption, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../_components/admin-shell';
import { PanelExplain } from '../../_components/explain';
import { Flash, ReadOnlyNotice } from '../../_components/flash';
import { first, vintageLabel } from '../../_components/format';
import { PickBadge, PickToggle, pickMarks } from '../../_components/pick-marks';
import { isDomainError } from '@/server/domain-errors';
import { requireAccess } from '@/server/auth';
import { getI18n } from '@/server/i18n';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.picks };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const all = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const FACTS = { minScore: PICK_MIN_SCORE, window: PICK_WINDOW, promoted: PICKS_PROMOTED_MAX };

/**
 * A27 — the restaurant's picks (spec 2026-11-18-restaurant-picks, R17): the wines with a switch, what each pick does, the
 * "before / after" simulator. Plain forms: the switch posts `setRestaurantPick`, the simulator is a `GET` form with the
 * tried wines in the URL, so everything works without JavaScript. The Wine Director sees all of it and changes nothing:
 * the controls are disabled with a notice, and the action refuses a forged post (never only a hidden button).
 */
export default async function PicksPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireAccess(slug);
  const canEdit = access.can('picks.edit');
  const { locale, t } = await getI18n();
  const m = t.admin.picks;
  const c = (await getRequestScope()).cradle;
  const q = first(sp.q);
  const path = `/admin/${slug}/picks`;

  const query = simulationQueryFromSearch((k) => (k === 'picks' ? all(sp.picks) : k === 'dish' ? all(sp.dish) : []));
  const custom = query.picks !== undefined || query.dish !== undefined;

  const read = await Promise.all([
    c.picksService.list(slug),
    c.publishService.preview(slug),
    c.adminService.wines(slug, { q: q || undefined }, locale),
    c.picksSimulationService.simulate(slug, { locale })
  ]).catch((e: unknown) => {
    if (isDomainError(e, 'not_found')) return null;
    throw e; // a real failure (database down, …) must surface as an error, not as a 404
  });
  if (!read || !read[2]) notFound();
  const [state, preview, list, working] = read;

  // the tried set: the working set unless the URL names another (the form always sends `picks`, empty = none)
  let sim: PicksSimulation | null = working;
  let invalid = false;
  if (custom) {
    try {
      sim = await c.picksSimulationService.simulate(slug, { picks: query.picks as string[] | undefined, dishId: query.dish as string | undefined, locale });
    } catch (e) {
      if (!isDomainError(e, 'validation_failed') && !isDomainError(e, 'not_found')) throw e;
      sim = null;
      invalid = true;
    }
  }

  const mark = pickMarks(state);
  const effects = new Map(working.picks.map((p) => [p.wineId, p]));
  const back = `${path}${q ? `?${new URLSearchParams({ q })}` : ''}`;
  const tried = new Set(sim?.tried ?? state.picks.map((p) => p.wineId));
  const wineLabel = (w: { producer: string; name: string }) => `${w.producer} ${w.name}`;

  return (
    <Page>
      <PageHeader title={m.title} description={m.description(state.picks.length, state.max)} />
      <Flash saved={first(sp.saved)} error={first(sp.error)} />
      {!canEdit && <ReadOnlyNotice>{m.readOnly}</ReadOnlyNotice>}
      {preview.pendingPicks > 0 && (
        <Alert className="mb-5" role="status">
          <AlertTitle>{m.waiting(preview.pendingPicksAdded, preview.pendingPicksRemoved)}</AlertTitle>
          <AlertDescription><Link href={`/admin/${slug}/publish`} className="underline underline-offset-4">{m.goPublish}</Link></AlertDescription>
        </Alert>
      )}
      {state.picks.length > 0 && !preview.settings.showUnreviewed && (
        <Alert className="mb-5" role="note"><AlertDescription>{m.unreviewedHidden}</AlertDescription></Alert>
      )}
      <PanelExplain id="picks" className="-mt-3 mb-5" summary={m.howTitle} points={m.howPoints(FACTS)} />

      <Card className="mb-6 gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>{m.title}</CardTitle>
          <form action={path} method="get" className="mt-2 flex flex-wrap items-center gap-2">
            <Input name="q" type="search" defaultValue={q} placeholder={m.search} aria-label={m.searchLabel} className="max-w-xs" />
            <Button type="submit" variant="secondary">{t.admin.common.filter}</Button>
            {q && <Button asChild variant="ghost"><Link href={path}>{t.admin.common.clear}</Link></Button>}
          </form>
        </CardHeader>
        {list.rows.length === 0 ? (
          <EmptyState title={m.noneTitle} description={list.total === 0 ? m.noneEmpty : m.noneFiltered} action={list.total === 0 ? <Button asChild><Link href={`/admin/${slug}/import/wines`}>{m.importWines}</Link></Button> : undefined} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.wine}</TableHead><TableHead>{m.status}</TableHead><TableHead>{m.effect}</TableHead><TableHead className="w-44"><span className="sr-only">{m.action}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map(({ wine: w }) => {
                const mk = mark(w.id);
                const e = effects.get(w.id);
                return (
                  <TableRow key={w.id}>
                    <TableCell className="min-w-48">
                      <Link href={`/admin/${slug}/wines/${w.id}`} className="font-medium underline-offset-4 hover:underline">{w.producer}</Link>
                      <div className="text-xs text-muted-foreground">{w.name}, {vintageLabel(w, locale)}</div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {mk === 'none' ? <span className="text-muted-foreground">{m.notPick}</span> : <PickBadge mark={mk} t={t} />}
                      {mk === 'inactive' && <div className="mt-1 text-xs text-muted-foreground">{m.inactivePick}</div>}
                      {mk === 'removed' && <div className="mt-1 text-xs text-muted-foreground">{m.unmarkedWaiting}</div>}
                    </TableCell>
                    <TableCell className="min-w-56 whitespace-normal text-sm">
                      {!e || mk === 'none' || mk === 'removed' ? <span className="text-muted-foreground">{mk === 'none' || mk === 'removed' ? m.notPick : m.effectUnknown}</span> : <EffectText p={e} t={t} />}
                    </TableCell>
                    <TableCell className="text-right">
                      <PickToggle slug={slug} back={back} wineId={w.id} wineLabel={wineLabel(w)} mark={mk} state={state} canEdit={canEdit} active={w.active} t={t} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.simTitle}</CardTitle>
          <CardDescription>{m.simText}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <form action={path} method="get" className="grid gap-4">
            {q && <input type="hidden" name="q" value={q} />}
            {/* always sent: an empty value is "no picks", so un-ticking everything is not read as "the working set" */}
            <input type="hidden" name="picks" value="" />
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{m.simWines}</legend>
              <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                {list.rows.map(({ wine: w }) => (
                  <label key={w.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
                    <input type="checkbox" name="picks" value={w.id} defaultChecked={tried.has(w.id)} className="size-4 accent-primary" />
                    <span className="min-w-0 truncate">{wineLabel(w)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1.5 text-sm"><span className="font-medium">{m.simDish}</span>
                <NativeSelect name="dish" defaultValue={query.dish as string | undefined ?? ''} className="w-auto max-w-full">
                  <NativeSelectOption value="">{m.allDishes}</NativeSelectOption>
                  {working.dishes.map((d) => <NativeSelectOption key={d.dishId} value={d.dishId}>{d.dishName}</NativeSelectOption>)}
                </NativeSelect>
              </label>
              <Button type="submit">{m.simulate}</Button>
              {custom && <Button asChild variant="ghost"><Link href={back}>{m.simReset}</Link></Button>}
            </div>
          </form>

          {invalid || !sim ? (
            <ErrorMessage compact title={m.simTitle} message={m.simInvalid} />
          ) : (
            <Simulation sim={sim} t={t} slug={slug} />
          )}
        </CardContent>
      </Card>
    </Page>
  );
}

type T = Awaited<ReturnType<typeof getI18n>>['t'];

/** What a pick does: moves up, only a label, or nothing (with the reason, in words). */
function EffectText({ p, t }: { p: PickSimulation; t: T }) {
  const m = t.admin.picks;
  if (p.effect === 'moved') return <>{m.effectMoved(p.dishesMoved)}{p.dishesLabelled > 0 && <span className="block text-xs text-muted-foreground">{m.effectLabel(p.dishesLabelled)}</span>}</>;
  if (p.effect === 'label_only') return <>{m.effectLabel(p.dishesLabelled)}</>;
  return <><b className="font-medium">{m.effectNone}</b>{p.reason && <span className="block text-xs text-muted-foreground">{m.noEffect(p.reason, FACTS)}</span>}</>;
}

function List({ items, dish, side, t }: { items: SimulatedItem[]; dish: DishSimulation; side: 'before' | 'after'; t: T }) {
  const m = t.admin.picks;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{m.emptyList}</p>;
  return (
    <ol className="grid gap-2 text-sm">
      {items.map((i, n) => {
        const mv = dish.moves.find((x) => x.wineId === i.wineId);
        const note = !mv ? null : side === 'before'
          ? (mv.to === null ? m.left : null)
          : mv.from === null ? m.entered : mv.to !== null && mv.to < mv.from ? m.up(mv.from - mv.to) : mv.to !== null ? m.down(mv.to - mv.from) : null;
        return (
          <li key={i.wineId} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-baseline gap-2">
            <span className="text-muted-foreground tabular-nums">{n + 1}.</span>
            <span className="min-w-0">
              {i.producer} {i.name}
              <span className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                {i.sommelierPair ? <span>{m.sommelierPair}</span> : i.restaurantPick ? <Badge variant="outline">{t.admin.badges.pick}</Badge> : <span>{m.engineList}</span>}
                {note && <b className="font-medium text-foreground">{note}</b>}
              </span>
            </span>
            <span className="tabular-nums">{i.matchScore}%</span>
          </li>
        );
      })}
    </ol>
  );
}

function Simulation({ sim, t, slug }: { sim: PicksSimulation; t: T; slug: string }) {
  const m = t.admin.picks;
  const changed = sim.dishes.filter((d) => d.reordered);
  return (
    <div className="grid gap-4" aria-live="polite">
      {!sim.published && <Alert role="note"><AlertDescription>{m.simNotPublished}</AlertDescription></Alert>}
      {sim.tried.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.simNone}</p>
      ) : (
        <>
          <p className="font-medium">{m.simSummary(sim.summary.dishesReordered, sim.summary.dishes, sim.summary.picksWithoutEffect)}</p>
          <div>
            <h3 className="mb-2 text-sm font-medium">{m.simPicks}</h3>
            <ul className="grid gap-2 text-sm">
              {sim.picks.map((p) => (
                <li key={p.wineId} className="grid gap-0.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
                  <span className="font-medium">{p.name ?? m.notPick}</span>
                  <span><EffectText p={p} t={t} /></span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      {changed.length > 0 && (
        <div className="grid gap-4">
          <h3 className="text-sm font-medium">{m.simDishes}</h3>
          {changed.map((d) => (
            <section key={d.dishId} className="rounded-lg border p-4" aria-label={d.dishName}>
              <h4 className="mb-3 font-medium"><Link href={`/admin/${slug}/pairings/${d.dishId}`} className="underline-offset-4 hover:underline">{d.dishName}</Link></h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div><h5 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.before}</h5><List items={d.before} dish={d} side="before" t={t} /></div>
                <div><h5 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.after}</h5><List items={d.after} dish={d} side="after" t={t} /></div>
              </div>
            </section>
          ))}
        </div>
      )}
      {sim.dishes.length > changed.length && <p className="text-sm text-muted-foreground">{m.simUnchanged(sim.dishes.length - changed.length)}</p>}
    </div>
  );
}
