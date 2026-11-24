import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { pairingScore } from '../src/engine/scoring';
import { can } from '../src/auth/permissions';
import { NotFoundError, ValidationError, VersionConflictError } from '../src/errors';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { CatalogEditService } from '../src/services/catalog/catalog-edit-service';
import { dishFieldsOf, dishFieldsVersion, dishVisibilityVersion, wineFieldsOf, wineFieldsVersion } from '../src/services/catalog/catalog-edit-rules';
import { PublishService } from '../src/services/publishing/publish-service';
import { SommelierService } from '../src/services/pairings/sommelier-service';
import { loadPublishedView } from '../src/services/publishing/published-view';
import { ImportService } from '../src/import/import-service';
import type { ImportFileParser, ParsedFile } from '../src/import/types';
import { draftDishProfile, draftWineProfile } from '../src/engine/drafts';
import { AdminService } from '../src/services/dashboard/admin-service';

/** Spec 2026-11-16-catalog-field-editing, C1a: CatalogEditService (R1 to R6, R9, R10, R15; AC1 to AC6, AC20, AC21). */

const ds = buildDemoDataset({ ids: 'uuid' });
const RID = ds.restaurant.id;
const ACTOR = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Marta Wierzbicka' };
const OTHER_ID = '00000000-0000-4000-8000-00000000dead';
let seq = 0;

function setup(now = '2026-11-17T09:00:00.000Z') {
  const store = MemoryStore.from(buildDemoDataset({ ids: 'uuid' }));
  const repos = createMemoryRepositories(store);
  let tick = Date.parse(now);
  const clock = { now: () => new Date((tick += 1000)) };
  const idGenerator = { uuid: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}` };
  return {
    store, repos,
    svc: new CatalogEditService({ ...repos, clock, idGenerator }),
    som: new SommelierService({ ...repos, clock, idGenerator }),
    publish: new PublishService({ ...repos, clock, idGenerator }),
    dish: (name: string) => store.dishes.get(RID)!.find((d) => d.name === name)!,
    wine: (id: string) => store.wines.get(RID)!.find((w) => w.id === id)!
  };
}

const halibut = () => ds.dishes.find((d) => d.name === 'Duck breast')!;
const fieldsOf = async (p: Promise<unknown>): Promise<Record<string, string>> => {
  try { await p; } catch (e) { return (e as ValidationError).fields ?? { thrown: String(e) }; }
  return {};
};

describe('permission (R9)', () => {
  it('belongs to owner, manager and sommelier, not to a waiter', () => {
    expect(['owner', 'manager', 'sommelier'].map((r) => can(r as 'owner', 'catalog.edit'))).toEqual([true, true, true]);
    expect(can('waiter', 'catalog.edit')).toBe(false);
  });
});

describe('updateDish (R1, R3, R10, AC1, AC5)', () => {
  it('saves the fields, returns the new fingerprint and writes one audit row with only the changed fields', async () => {
    const t = setup();
    const d = halibut();
    const version = dishFieldsVersion(dishFieldsOf(d));
    const r = await t.svc.updateDish('halka', d.id, { price: 99.5, description: '  New   text ' }, ACTOR, version);
    expect(r).toMatchObject({ changed: true, fields: { price: 99.5, description: 'New text', name: d.name } });
    expect(r.version).toBe(dishFieldsVersion(dishFieldsOf(t.dish(d.name))));
    expect(r.version).not.toBe(version);
    const rows = await t.repos.catalogEditRepository.list(RID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'dish', subjectId: d.id, action: 'update', actor: ACTOR.name, actorId: ACTOR.id, identity: false,
      before: { description: d.description, price: d.price }, after: { description: 'New text', price: 99.5 }
    });
    expect(rows[0].at).toBe('2026-11-17T09:00:01.000Z');
  });

  it('writes nothing when nothing differs after cleaning, and still refuses a stale fingerprint', async () => {
    const t = setup();
    const d = halibut();
    const version = dishFieldsVersion(dishFieldsOf(d));
    const same = await t.svc.updateDish('halka', d.id, { name: ` ${d.name} `, price: d.price }, ACTOR, version);
    expect(same).toMatchObject({ changed: false, version });
    expect(await t.repos.catalogEditRepository.list(RID)).toEqual([]);
    await expect(t.svc.updateDish('halka', d.id, { price: d.price }, ACTOR, '00000000-1')).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('reports every wrong field, writes nothing and refuses extra fields and an empty body (AC1)', async () => {
    const t = setup();
    const d = halibut();
    expect(await fieldsOf(t.svc.updateDish('halka', d.id, { name: '', price: 0, description: 'x'.repeat(1001) }, ACTOR))).toEqual({ name: 'required', price: 'not_positive', description: 'too_long' });
    // a value of the wrong type is refused first, before anything is looked up or any content rule is applied
    expect(await fieldsOf(t.svc.updateDish('halka', d.id, { category: 'Snacks', price: 'ten' }, ACTOR))).toEqual({ category: 'invalid', price: 'invalid' });
    expect(await fieldsOf(t.svc.updateDish('halka', d.id, { price: 12.345 }, ACTOR))).toEqual({ price: 'too_many_decimals' });
    expect(await fieldsOf(t.svc.updateDish('halka', d.id, { profile: {}, status: 'hidden' }, ACTOR))).toMatchObject({ profile: 'unknown_field', status: 'unknown_field' });
    expect(await fieldsOf(t.svc.updateDish('halka', d.id, {}, ACTOR))).toEqual({ body: 'required' });
    expect(await fieldsOf(t.svc.updateDish('halka', d.id, 'x', ACTOR))).toMatchObject({ body: 'invalid' });
    expect(t.dish(d.name)).toMatchObject({ name: d.name, price: d.price });
    expect(await t.repos.catalogEditRepository.list(RID)).toEqual([]);
  });

  it('is not found for an unknown id, another restaurant\'s id and a restaurant that does not exist', async () => {
    const t = setup();
    await expect(t.svc.updateDish('halka', OTHER_ID, { price: 5 }, ACTOR)).rejects.toBeInstanceOf(NotFoundError);
    await expect(t.svc.updateDish('halka', 'not-a-uuid', { price: 5 }, ACTOR)).rejects.toBeInstanceOf(NotFoundError);
    await expect(t.svc.updateDish('nowhere', halibut().id, { price: 5 }, ACTOR)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a duplicate name of any dish, also a draft or hidden one; a stored duplicate does not block a price (AC3, N3)', async () => {
    const t = setup();
    const draft = ds.dishes.find((d) => d.status === 'draft')!;
    const duck = halibut();
    expect(await fieldsOf(t.svc.updateDish('halka', duck.id, { name: draft.name.toUpperCase() + '!' }, ACTOR))).toEqual({ name: 'duplicate' });
    const other = ds.dishes.find((d) => d.id !== duck.id && d.status === 'published')!;
    t.dish(other.name).status = 'hidden';
    expect(await fieldsOf(t.svc.updateDish('halka', duck.id, { name: ` ${other.name} ` }, ACTOR))).toEqual({ name: 'duplicate' });
    // the same name in another restaurant is no problem: only this restaurant's dishes are compared
    t.dish(other.name).name = duck.name;
    expect(await fieldsOf(t.svc.updateDish('halka', duck.id, { price: 77 }, ACTOR))).toEqual({});
    expect(t.dish(duck.name)).toBeTruthy();
  });

  it('keeps a stored value that breaks the new rules from blocking another field (R1)', async () => {
    const t = setup();
    const d = halibut();
    t.dish(d.name).description = 'x'.repeat(1500);
    const r = await t.svc.updateDish('halka', d.id, { description: 'x'.repeat(1500), price: 61 }, ACTOR);
    expect(r.changed).toBe(true);
    expect(t.dish(d.name)).toMatchObject({ price: 61, description: 'x'.repeat(1500) });
    expect(await fieldsOf(t.svc.updateDish('halka', d.id, { description: 'y'.repeat(1500) }, ACTOR))).toEqual({ description: 'too_long' });
  });
});

describe('updateWine (R2, AC2, AC3)', () => {
  const wine = () => ds.wines.find((w) => w.glassPrice !== null && w.listNumber !== undefined)!;

  it('switches the glass off to null, on with a price, and changes the other fields', async () => {
    const t = setup();
    const w = wine();
    const off = await t.svc.updateWine('halka', w.id, { pouredByGlass: false, region: ' Mosel ' }, ACTOR);
    expect(off.fields).toMatchObject({ glassPrice: null, region: 'Mosel' });
    expect(t.wine(w.id).glassPrice).toBeNull();
    const on = await t.svc.updateWine('halka', w.id, { pouredByGlass: true, glassPrice: 12.5 }, ACTOR, off.version);
    expect(on.fields.glassPrice).toBe(12.5);
    expect(await fieldsOf(t.svc.updateWine('halka', w.id, { pouredByGlass: false, glassPrice: 12 }, ACTOR))).toEqual({ glassPrice: 'not_allowed' });
  });

  it('judges the glass against the bottle on the merged state, and the vintage by the clock', async () => {
    const t = setup('2026-11-17T09:00:00.000Z');
    const w = wine();
    expect(await fieldsOf(t.svc.updateWine('halka', w.id, { bottlePrice: w.glassPrice! - 1 }, ACTOR))).toEqual({ bottlePrice: 'glass_not_below_bottle' });
    expect(await fieldsOf(t.svc.updateWine('halka', w.id, { glassPrice: w.bottlePrice }, ACTOR))).toEqual({ glassPrice: 'glass_not_below_bottle' });
    expect(await fieldsOf(t.svc.updateWine('halka', w.id, { vintage: 2028 }, ACTOR))).toEqual({ vintage: 'out_of_range' });
    expect(await fieldsOf(t.svc.updateWine('halka', w.id, { vintage: 1899 }, ACTOR))).toEqual({ vintage: 'out_of_range' });
    expect(await fieldsOf(t.svc.updateWine('halka', w.id, { vintage: 'nv' }, ACTOR))).toEqual({ vintage: 'invalid' });
    expect((await t.svc.updateWine('halka', w.id, { vintage: 2027 }, ACTOR)).fields.vintage).toBe(2027);
    expect((await t.svc.updateWine('halka', w.id, { vintage: 'NV' }, ACTOR)).fields.vintage).toBe('NV');
  });

  it('refuses a taken list number and a taken key, but not a taken number that stays (AC2, AC3)', async () => {
    const t = setup();
    const [a, b] = ds.wines.filter((w) => w.listNumber !== undefined);
    expect(await fieldsOf(t.svc.updateWine('halka', a.id, { listNumber: b.listNumber }, ACTOR))).toEqual({ listNumber: 'duplicate' });
    expect(await fieldsOf(t.svc.updateWine('halka', a.id, { producer: ` ${b.producer.toUpperCase()} `, name: `${b.name}!`, vintage: b.vintage }, ACTOR))).toEqual({ name: 'duplicate' });
    t.wine(a.id).listNumber = b.listNumber;
    expect((await t.svc.updateWine('halka', a.id, { bottlePrice: a.bottlePrice + 1 }, ACTOR)).changed).toBe(true);
    expect((await t.svc.updateWine('halka', a.id, { listNumber: null }, ACTOR)).fields.listNumber).toBeNull();
  });

  it('is a conflict with a stale fingerprint and unaffected by a parallel change of availability or translations (R4)', async () => {
    const t = setup();
    const w = wine();
    const version = wineFieldsVersion(wineFieldsOf(w));
    await t.repos.wineWriteRepository.setActive(RID, w.id, false);
    await t.repos.contentWriteRepository.setWineTranslations(RID, w.id, { en: { region: 'Elsewhere' } });
    expect((await t.svc.updateWine('halka', w.id, { bottlePrice: w.bottlePrice + 5 }, ACTOR, version)).changed).toBe(true);
    await expect(t.svc.updateWine('halka', w.id, { bottlePrice: w.bottlePrice + 6 }, ACTOR, version)).rejects.toBeInstanceOf(VersionConflictError);
    expect(t.wine(w.id).bottlePrice).toBe(w.bottlePrice + 5);
  });
});

describe('the fields never change the engine (R6, AC6)', () => {
  it('leaves pairingScore of every dish and wine and the stored model scores as they were, field by field and all together', async () => {
    const t = setup();
    const baseline = new Map<string, unknown>();
    const snapshot = async () => {
      const dishes = await t.repos.dishRepository.listByRestaurant(RID);
      const wines = await t.repos.wineRepository.listByRestaurant(RID);
      const scores = new Map<string, unknown>();
      for (const d of dishes) for (const w of wines) { const s = pairingScore(d, w); scores.set(`${d.id}:${w.id}`, { score: s.score, factors: s.factors }); }
      const models = (await t.repos.pairingRepository.listByRestaurant(RID)).map((p) => `${p.id}:${p.modelScore}`).sort();
      return { scores, models };
    };
    const before = await snapshot();
    for (const [k, v] of before.scores) baseline.set(k, v);
    const dishEdits: Array<Record<string, unknown>> = [{ name: 'Renamed dish' }, { description: 'Something else entirely' }, { category: 'Desserts' }, { price: 12.34 }, { name: 'All at once', description: 'D', category: 'Starters', price: 321 }];
    for (const d of ds.dishes) {
      for (const [i, edit] of dishEdits.entries()) {
        const current = t.store.dishes.get(RID)!.find((x) => x.id === d.id)!;
        const input = i === 0 || i === 4 ? { ...edit, name: `${String(edit.name)} ${d.id.slice(-4)}` } : edit;
        await t.svc.updateDish('halka', d.id, input, ACTOR, dishFieldsVersion(dishFieldsOf(current)));
        const after = await snapshot();
        expect(after.scores, `${d.name} ${JSON.stringify(edit)}`).toEqual(before.scores);
        expect(after.models).toEqual(before.models);
      }
    }
    const wineEdits: Array<Record<string, unknown>> = [
      { producer: 'Another Producer' }, { name: 'Another name' }, { vintage: 'NV' }, { region: 'Elsewhere' }, { country: 'Nowhere' }, { tastingNote: 'Fresh note' },
      { listNumber: 7777 }, { bottlePrice: 4321 }, { pouredByGlass: false }, { pouredByGlass: true, glassPrice: 11.11 },
      { producer: 'P2', name: 'N2', vintage: 2001, region: 'R2', country: 'C2', tastingNote: 'T2', listNumber: 7778, bottlePrice: 999, pouredByGlass: true, glassPrice: 5 }
    ];
    for (const w of ds.wines) {
      for (const [i, edit] of wineEdits.entries()) {
        const unique = i === 6 ? { listNumber: 8000 + ds.wines.indexOf(w) } : i === 10 ? { name: `N2 ${w.id.slice(-4)}`, listNumber: 9000 + ds.wines.indexOf(w) } : i === 1 ? { name: `Another ${w.id.slice(-4)}` } : {};
        await t.svc.updateWine('halka', w.id, { ...edit, ...unique }, ACTOR);
        const after = await snapshot();
        expect(after.scores, `${w.name} ${JSON.stringify(edit)}`).toEqual(before.scores);
        expect(after.models).toEqual(before.models);
      }
    }
  });
});

describe('stale translations (R11, N2, AC21)', () => {
  it('names the languages whose published translation belongs to the changed field', async () => {
    const t = setup();
    const d = halibut();
    await t.repos.contentWriteRepository.setDishTranslations(RID, d.id, { en: { name: 'Duck' } });
    await t.publish.publish('halka', ACTOR);
    const renamed = await t.svc.updateDish('halka', d.id, { name: 'Duck breast with plums' }, ACTOR);
    expect(renamed.staleLocales).toEqual(['en']);
    expect((await t.svc.updateDish('halka', d.id, { price: 70 }, ACTOR)).staleLocales).toEqual([]);
  });
});

describe('a rename of something with sommelier pairings (R15, AC20)', () => {
  it('flags the audit row as identity and, for a form that asks for it, wants a confirmation first', async () => {
    const t = setup();
    const d = halibut();
    const approved = (await t.repos.pairingRepository.listByDish(RID, d.id)).filter((p) => p.status === 'approved' || p.status === 'modified');
    expect(approved.length).toBeGreaterThan(0);
    expect(await fieldsOf(t.svc.updateDish('halka', d.id, { name: 'Duck breast v2' }, ACTOR, undefined, { identityConfirmed: false }))).toEqual({ name: 'identity_unconfirmed' });
    expect(t.dish(d.name)).toBeTruthy();
    // a price change needs no confirmation, the API (no options) needs none either
    expect((await t.svc.updateDish('halka', d.id, { price: 70 }, ACTOR, undefined, { identityConfirmed: false })).changed).toBe(true);
    expect((await t.svc.updateDish('halka', d.id, { name: 'Duck breast v2' }, ACTOR, undefined, { identityConfirmed: true })).changed).toBe(true);
    const rows = await t.repos.catalogEditRepository.list(RID);
    expect(rows.map((r) => r.identity)).toEqual([true, false]);
    expect((await t.repos.catalogEditRepository.list(RID, { identityOnly: true })).map((r) => r.after)).toEqual([{ name: 'Duck breast v2' }]);
  });

  it('applies to a wine producer, name or vintage with approved pairings', async () => {
    const t = setup();
    const approved = (await t.repos.pairingRepository.listByRestaurant(RID)).find((p) => p.status === 'approved')!;
    const wineId = approved.wineId;
    expect(await fieldsOf(t.svc.updateWine('halka', wineId, { vintage: 1999 }, ACTOR, undefined, { identityConfirmed: false }))).toEqual({ name: 'identity_unconfirmed' });
    expect((await t.svc.updateWine('halka', wineId, { region: 'Elsewhere' }, ACTOR, undefined, { identityConfirmed: false })).changed).toBe(true);
    expect((await t.svc.updateWine('halka', wineId, { vintage: 1999 }, ACTOR, undefined, { identityConfirmed: true })).changed).toBe(true);
    expect((await t.repos.catalogEditRepository.latest(RID, 'wine', wineId))!.identity).toBe(true);
  });
});

describe('what A3, A5 and the review queue show after an edit (R10, R11, R15, AC20, AC21)', () => {
  it('marks the pairings of a renamed dish until each has a newer decision, and lists it in the review queue', async () => {
    const t = setup();
    const admin = new AdminService(t.repos);
    const d = halibut();
    const approved = (await t.repos.pairingRepository.listByDish(RID, d.id)).filter((p) => p.status === 'approved' || p.status === 'modified');
    expect((await admin.dishDetail('halka', d.id))!.pairsToCheck).toBe(0);
    await t.svc.updateDish('halka', d.id, { price: 70 }, ACTOR);
    expect((await admin.dishDetail('halka', d.id))!.pairsToCheck).toBe(0);
    expect((await admin.reviewQueue('halka'))!.renamed).toEqual([]);
    await t.svc.updateDish('halka', d.id, { name: 'Duck breast, new name' }, ACTOR);
    const after = (await admin.dishDetail('halka', d.id))!;
    expect(after.pairsToCheck).toBe(approved.length);
    expect(after.lastEdit).toMatchObject({ actor: ACTOR.name });
    expect((await admin.reviewQueue('halka'))!.renamed).toMatchObject([{ kind: 'dish', id: d.id, name: 'Duck breast, new name', pairs: approved.length }]);
    // a decision on one pair after the rename clears its mark
    const first = (await t.repos.pairingRepository.listByDish(RID, d.id)).find((p) => p.id === approved[0].id)!;
    await t.som.setComment('halka', first.id, 'Checked after the rename', ACTOR, first.version);
    expect((await admin.dishDetail('halka', d.id))!.pairsToCheck).toBe(approved.length - 1);
    // the wine side: each approved pair of a renamed wine is marked, the others are not
    const pair = approved[1] ?? approved[0];
    const wineId = pair.wineId;
    await t.svc.updateWine('halka', wineId, { vintage: 1999 }, ACTOR);
    const wd = (await admin.wineDetail('halka', wineId))!;
    expect(wd.approvedFor.some((x) => x.checkAfterRename)).toBe(true);
    expect(wd.pairsToCheck).toBe(wd.approvedFor.filter((x) => x.checkAfterRename).length);
  });

  it('names the stale translation languages until the next publish, only for the fields the last edit changed', async () => {
    const t = setup();
    const admin = new AdminService(t.repos);
    const d = halibut();
    await t.repos.contentWriteRepository.setDishTranslations(RID, d.id, { en: { name: 'Duck' } });
    await t.publish.publish('halka', ACTOR);
    await t.svc.updateDish('halka', d.id, { price: 71 }, ACTOR);
    expect((await admin.dishDetail('halka', d.id))!.staleLocales).toEqual([]);
    await t.svc.updateDish('halka', d.id, { name: 'Duck breast, new name' }, ACTOR);
    expect((await admin.dishDetail('halka', d.id))!.staleLocales).toEqual(['en']);
    await t.repos.publishRepository.publish(RID, { actor: ACTOR.name, at: '2026-12-01T10:00:00.000Z', id: '00000000-0000-4000-8000-0000000000bb' });
    expect((await admin.dishDetail('halka', d.id))!.staleLocales).toEqual([]);
  });
});

describe('setDishHidden (R7, R10, AC14, AC15)', () => {
  const visibility = (t: ReturnType<typeof setup>, name: string) => dishVisibilityVersion(t.dish(name));

  it('hides a published dish from guests at once and shows it again without a publish, with one audit row each', async () => {
    const t = setup();
    const d = halibut();
    const before = await loadPublishedView(t.repos, ds.restaurant);
    expect(before.dish(d.id)).not.toBeNull();
    const hide = await t.svc.setDishHidden('halka', d.id, true, ACTOR, visibility(t, d.name));
    expect(hide).toMatchObject({ status: 'hidden', suggestions: 0 });
    expect(hide.version).toBe(visibility(t, d.name));
    expect(t.dish(d.name).status).toBe('hidden');
    const view = await loadPublishedView(t.repos, ds.restaurant);
    expect(view.dish(d.id)).toBeNull();
    expect(view.dishes.map((x) => x.id)).not.toContain(d.id);
    const show = await t.svc.setDishHidden('halka', d.id, false, ACTOR, hide.version);
    expect(show.status).toBe('published');
    expect((await loadPublishedView(t.repos, ds.restaurant)).dish(d.id)).not.toBeNull();
    const rows = await t.repos.catalogEditRepository.list(RID, { subjectId: d.id });
    expect(rows.map((r) => [r.action, r.before, r.after, r.actor, r.actorId, r.identity])).toEqual([
      ['shown', { status: 'hidden' }, { status: 'published' }, ACTOR.name, ACTOR.id, false],
      ['hidden', { status: 'published' }, { status: 'hidden' }, ACTOR.name, ACTOR.id, false]
    ]);
  });

  it('does not touch the published version, the fields or the profile of the dish', async () => {
    const t = setup();
    const d = halibut();
    const pending = (await t.publish.preview('halka')).pendingChanges;
    await t.svc.setDishHidden('halka', d.id, true, ACTOR);
    await t.svc.setDishHidden('halka', d.id, false, ACTOR);
    expect(t.dish(d.name)).toMatchObject({ name: d.name, description: d.description, price: d.price, category: d.category, profile: d.profile });
    expect((await t.publish.preview('halka')).pendingChanges).toBe(pending);
  });

  it('refuses a draft dish and a dish already in the wanted state with status: transition, and writes nothing', async () => {
    const t = setup();
    const draft = ds.dishes.find((d) => d.status === 'draft')!;
    expect(await fieldsOf(t.svc.setDishHidden('halka', draft.id, true, ACTOR))).toEqual({ status: 'transition' });
    expect(await fieldsOf(t.svc.setDishHidden('halka', draft.id, false, ACTOR))).toEqual({ status: 'transition' });
    expect(await fieldsOf(t.svc.setDishHidden('halka', halibut().id, false, ACTOR))).toEqual({ status: 'transition' });
    expect(t.dish(draft.name).status).toBe('draft');
    expect(await t.repos.catalogEditRepository.list(RID)).toEqual([]);
  });

  it('is a conflict with a stale fingerprint (also one that only the fields changed), unknown ids and another restaurant', async () => {
    const t = setup();
    const d = halibut();
    const stale = visibility(t, d.name);
    await t.svc.updateDish('halka', d.id, { price: 123 }, ACTOR);
    await expect(t.svc.setDishHidden('halka', d.id, true, ACTOR, stale)).rejects.toBeInstanceOf(VersionConflictError);
    expect(t.dish(d.name).status).toBe('published');
    await expect(t.svc.setDishHidden('halka', OTHER_ID, true, ACTOR)).rejects.toBeInstanceOf(NotFoundError);
    await expect(t.svc.setDishHidden('no-such-restaurant', d.id, true, ACTOR)).rejects.toBeInstanceOf(NotFoundError);
    expect((await t.repos.catalogEditRepository.list(RID)).filter((r) => r.action === 'hidden')).toEqual([]);
  });

  it('asks the engine for the pairs a dish missed while it was hidden when it is shown again (N4)', async () => {
    const t = setup();
    const d = halibut();
    await t.svc.setDishHidden('halka', d.id, true, ACTOR);
    // while hidden the dish takes no part in suggestions: drop its suggested pairs, as if a wine came in meanwhile
    const list = t.store.pairings.get(RID)!;
    const mine = list.filter((p) => p.dishId === d.id);
    const dropped = mine.filter((p) => p.status === 'suggested');
    t.store.pairings.set(RID, list.filter((p) => !(p.dishId === d.id && p.status === 'suggested')));
    expect(dropped.length).toBeGreaterThan(0);
    const shown = await t.svc.setDishHidden('halka', d.id, false, ACTOR);
    expect(shown.suggestions).toBeGreaterThan(0);
    const now = t.store.pairings.get(RID)!.filter((p) => p.dishId === d.id);
    expect(now.length).toBe(mine.length - dropped.length + shown.suggestions);
    expect(now.filter((p) => p.status === 'suggested' && p.source === 'engine').length).toBe(shown.suggestions);
    // the pairs that already existed (decided ones) stay as they were
    expect(now.filter((p) => p.status !== 'suggested')).toEqual(mine.filter((p) => p.status !== 'suggested'));
  });
});

describe('createDish and createWine (R8, R10, AC16, AC17)', () => {
  const oneRow = (kind: 'menu' | 'wines', row: string[]): ImportFileParser => ({
    parse: async (): Promise<ParsedFile> => ({
      parser: 'csv',
      rows: kind === 'menu' ? [['Category', 'Name', 'Description', 'Price'], row] : [['Producer', 'Wine', 'Vintage', 'Region', 'Grape', 'Style', 'Glass price', 'Bottle price'], row]
    })
  });
  const importer = (t: ReturnType<typeof setup>, kind: 'menu' | 'wines', row: string[]) => {
    let n = 0;
    const clock = { now: () => new Date('2026-11-22T09:00:00.000Z') };
    return new ImportService({ ...t.repos, importFileParser: oneRow(kind, row), clock, idGenerator: { uuid: () => `00000000-0000-4000-8000-${String(900000 + ++n).padStart(12, '0')}` } });
  };
  const key = (ps: Array<{ dishId: string; wineId: string; modelScore: number }>, by: 'dishId' | 'wineId') => ps.map((p) => [p[by === 'dishId' ? 'wineId' : 'dishId'], p.modelScore] as const).sort((a, b) => (a[0] < b[0] ? -1 : 1));

  it('creates a draft dish with the draft profile and the suggestions an import of the same row makes (AC16)', async () => {
    const a = setup();
    const b = setup();
    const row = ['Desserts', 'Plum soufflé', 'Baked plum, vanilla cream', '42'];
    const made = await a.svc.createDish('halka', { name: ' Plum soufflé ', description: 'Baked plum, vanilla cream', category: 'Desserts', price: 42 }, ACTOR);
    const dish = a.dish('Plum soufflé');
    expect(dish).toMatchObject({ id: made.id, status: 'draft', price: 42, category: 'Desserts', translations: {} });
    expect(dish.profile).toEqual(draftDishProfile('Plum soufflé', 'Baked plum, vanilla cream', 'Desserts'));
    expect(made.version).toBe(dishFieldsVersion(dishFieldsOf(dish)));
    // the import of the same single row gives the same dish and the same suggestions
    const imp = importer(b, 'menu', row);
    const job = await imp.upload('halka', 'menu', { name: 'menu.csv', bytes: new Uint8Array() }, ACTOR);
    await imp.confirm('halka', job.id, ACTOR);
    const imported = b.dish('Plum soufflé');
    expect({ ...dish, id: '' }).toEqual({ ...imported, id: '' });
    const mine = a.store.pairings.get(RID)!.filter((p) => p.dishId === dish.id);
    const theirs = b.store.pairings.get(RID)!.filter((p) => p.dishId === imported.id);
    expect(mine.length).toBe(made.suggestions);
    expect(mine.length).toBeGreaterThan(0);
    expect(key(mine, 'dishId')).toEqual(key(theirs, 'dishId'));
    expect(mine.every((p) => p.status === 'suggested' && p.source === 'engine' && !p.dirty)).toBe(true);
    const rows = await a.repos.catalogEditRepository.list(RID, { subjectId: dish.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'dish', action: 'create', before: null, actor: ACTOR.name, actorId: ACTOR.id, identity: false, after: { name: 'Plum soufflé', price: 42, category: 'Desserts' } });
  });

  it('refuses a duplicate name (any status, any case or punctuation) and reports every missing or wrong field, creating nothing', async () => {
    const t = setup();
    const before = t.store.dishes.get(RID)!.length;
    const draft = ds.dishes.find((d) => d.status === 'draft')!;
    expect(await fieldsOf(t.svc.createDish('halka', { name: draft.name.toUpperCase() + '!', category: 'Mains', price: 10 }, ACTOR))).toEqual({ name: 'duplicate' });
    expect(await fieldsOf(t.svc.createDish('halka', {}, ACTOR))).toEqual({ name: 'required', category: 'required', price: 'required' });
    expect(await fieldsOf(t.svc.createDish('halka', { name: ' ', category: 'Snacks', price: 0, status: 'published', profile: {} }, ACTOR))).toMatchObject({ name: 'required', category: 'invalid', price: 'not_positive', status: 'unknown_field', profile: 'unknown_field' });
    expect(await fieldsOf(t.svc.createDish('halka', { name: 'X', category: 'Mains', price: 12.345 }, ACTOR))).toEqual({ price: 'too_many_decimals' });
    await expect(t.svc.createDish('no-such-restaurant', { name: 'X', category: 'Mains', price: 1 }, ACTOR)).rejects.toBeInstanceOf(NotFoundError);
    expect(t.store.dishes.get(RID)!.length).toBe(before);
    expect(await t.repos.catalogEditRepository.list(RID)).toEqual([]);
  });

  it('creates an active wine with the draft profile, colour, the next free list number and suggestions, as an import of the same row would (AC17)', async () => {
    const a = setup();
    const b = setup();
    const made = await a.svc.createWine('halka', { producer: 'Weingut Test', name: 'Riesling trocken', vintage: 2022, region: 'Pfalz', country: 'Germany', bottlePrice: 240, style: 'white', grape: 'Riesling', pouredByGlass: true, glassPrice: 52 }, ACTOR);
    const wine = a.wine(made.id);
    const highest = Math.max(100, ...ds.wines.map((w) => w.listNumber ?? 0));
    expect(wine).toMatchObject({ producer: 'Weingut Test', vintage: 2022, active: true, listNumber: highest + 1, glassPrice: 52, bottlePrice: 240, grapes: ['Riesling'], bottleSize: 750, translations: {} });
    expect(made.listNumber).toBe(highest + 1);
    expect(wine.profile).toEqual(draftWineProfile('Riesling', 'white'));
    const imp = importer(b, 'wines', ['Weingut Test', 'Riesling trocken', '2022', 'Pfalz', 'Riesling', 'White', '52', '240']);
    const job = await imp.upload('halka', 'wines', { name: 'wines.csv', bytes: new Uint8Array() }, ACTOR);
    await imp.confirm('halka', job.id, ACTOR);
    const imported = b.store.wines.get(RID)!.find((w) => w.producer === 'Weingut Test')!;
    expect({ ...wine, id: '', region: '', country: '' }).toEqual({ ...imported, id: '', region: '', country: '' });
    const mine = a.store.pairings.get(RID)!.filter((p) => p.wineId === wine.id);
    expect(mine.length).toBe(made.suggestions);
    expect(key(mine, 'wineId')).toEqual(key(b.store.pairings.get(RID)!.filter((p) => p.wineId === imported.id), 'wineId'));
    expect(await a.repos.catalogEditRepository.latest(RID, 'wine', wine.id)).toMatchObject({ action: 'create', before: null, after: { producer: 'Weingut Test', style: 'white', grape: 'Riesling', listNumber: highest + 1 } });
    // a second wine without a number gets the next one; an explicit free number is kept; a taken one is refused
    const second = await a.svc.createWine('halka', { producer: 'Another', name: 'Red', vintage: 'NV', bottlePrice: 100, style: 'red' }, ACTOR);
    expect(second.listNumber).toBe(highest + 2);
    expect((await a.svc.createWine('halka', { producer: 'Third', name: 'Rose', vintage: 2023, bottlePrice: 100, style: 'rose', listNumber: 7777 }, ACTOR)).listNumber).toBe(7777);
    expect(await fieldsOf(a.svc.createWine('halka', { producer: 'Fourth', name: 'Rose', vintage: 2023, bottlePrice: 100, style: 'rose', listNumber: 7777 }, ACTOR))).toEqual({ listNumber: 'duplicate' });
  });

  it('judges the wine by the same rules as an edit: the key, the glass, the vintage by the clock; every problem together; nothing is created', async () => {
    const t = setup();
    const w = ds.wines[0];
    const before = t.store.wines.get(RID)!.length;
    expect(await fieldsOf(t.svc.createWine('halka', { producer: w.producer.toUpperCase(), name: ` ${w.name}! `, vintage: w.vintage, bottlePrice: 99, style: 'red' }, ACTOR))).toEqual({ name: 'duplicate' });
    expect(await fieldsOf(t.svc.createWine('halka', { producer: 'P', name: 'N', vintage: 2099, bottlePrice: 50, style: 'red', pouredByGlass: true, glassPrice: 50 }, ACTOR))).toEqual({ vintage: 'out_of_range', glassPrice: 'glass_not_below_bottle' });
    expect(await fieldsOf(t.svc.createWine('halka', { producer: 'P', name: 'N', vintage: 2020, bottlePrice: 50, style: 'red', pouredByGlass: true }, ACTOR))).toEqual({ glassPrice: 'required' });
    expect(await fieldsOf(t.svc.createWine('halka', { producer: 'P', name: 'N', vintage: 2020, bottlePrice: 50, style: 'red', glassPrice: 10 }, ACTOR))).toEqual({ glassPrice: 'not_allowed' });
    expect(await fieldsOf(t.svc.createWine('halka', {}, ACTOR))).toEqual({ producer: 'required', name: 'required', vintage: 'required', bottlePrice: 'required', style: 'required' });
    expect(await fieldsOf(t.svc.createWine('halka', { producer: 'P', name: 'N', vintage: 'nv', bottlePrice: 50, style: 'fizzy', active: false }, ACTOR))).toMatchObject({ vintage: 'invalid', style: 'invalid', active: 'unknown_field' });
    expect(t.store.wines.get(RID)!.length).toBe(before);
    expect(await t.repos.catalogEditRepository.list(RID)).toEqual([]);
  });

  it('a new wine has no profile in the published version, so guests do not see it until a publish; a new dish is a draft (Q5, E13 F1)', async () => {
    const t = setup();
    const made = await t.svc.createWine('halka', { producer: 'Late', name: 'Arrival', vintage: 2021, bottlePrice: 150, style: 'white' }, ACTOR);
    const dish = await t.svc.createDish('halka', { name: 'Brand new dish', category: 'Mains', price: 70 }, ACTOR);
    let view = await loadPublishedView(t.repos, ds.restaurant);
    expect(view.wine(made.id)).toBeNull();
    expect(view.dish(dish.id)).toBeNull();
    await t.publish.publish('halka', ACTOR);
    view = await loadPublishedView(t.repos, ds.restaurant);
    expect(view.wine(made.id)).not.toBeNull();
    expect(view.dish(dish.id)).not.toBeNull();
  });
});
