import type { MikroORM } from '@mikro-orm/postgresql';
import {
  CatalogEditService, wineFieldsOf, wineFieldsVersion, ImportService, InvitationService, MAX_CODES_PER_SESSION_DAY, PICKS_MAX, picksVersion, ProfileService, profileVersion, dishScales, PublishService, RecommendationCodeService, SECOND_RESTAURANT, SommelierService, TeamService, buildDemoDataset, type SecondRestaurant
} from '@wine-match/core';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { NodeImportFileParser } from '../src/import';
import { NodeSessionTokens } from '../src/auth';
import { PgAuthRepository } from '../src/repositories/auth';
import { freshDatabase, fulfilled, pgRepos, race, rejected, resetData, seedSecondRestaurant } from './support/pg';

/**
 * Concurrency on real PostgreSQL, one scenario per shared resource. Every contender is its own "request" (its own EntityManager fork,
 * so its own connection) and all start behind one gate (`race`), no sleeps. Each scenario repeats ROUNDS times from a clean state and
 * asserts the FINAL DATABASE STATE, not only the statuses of the answers. Related, older tests live in repositories.integration.test.ts.
 */
const ROUNDS = 10;
const baseUrl = inject('databaseUrl');
const ds = buildDemoDataset({ ids: 'uuid' });
const MARTA = { id: ds.users.find((u) => u.key === 'marta')!.id, name: 'Marta Wierzbicka' };
const TOMASZ = { id: ds.users.find((u) => u.key === 'tomasz')!.id, name: 'Tomasz Lis' };
const fixture = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))) });

describe('concurrency on PostgreSQL', () => {
  let orm: MikroORM;
  beforeAll(async () => { orm = await freshDatabase(baseUrl, 'winematch_concurrency_test'); }, 120_000);
  afterAll(async () => { await orm?.close(true); });
  beforeEach(async () => { await resetData(orm); });

  const sql = <T>(query: string, params: unknown[] = []) => orm.em.getConnection().execute<T[]>(query, params);
  const tokens = new NodeSessionTokens();
  let seq = 0;
  const uuid = () => `5ec0d000-0000-4000-8000-${String(900_000_000_000 + ++seq)}`;

  /** The services over a fresh connection each, like one request. */
  const invitationsOf = () => {
    const repos = pgRepos(orm);
    return new InvitationService({
      ...repos, authRepository: new PgAuthRepository({ em: orm.em.fork() }), passwordHasher: { hash: async (p) => `scrypt$test-only$${p.length}` }, sessionTokens: tokens,
      clock: { now: () => new Date() }, idGenerator: { uuid }
    });
  };
  const teamOf = () => new TeamService({ ...pgRepos(orm), clock: { now: () => new Date() }, idGenerator: { uuid } });
  const sommelierOf = () => new SommelierService({ ...pgRepos(orm), clock: { now: () => new Date() }, idGenerator: { uuid: () => randomUUID() } });
  const importOf = () => new ImportService({ ...pgRepos(orm), importFileParser: new NodeImportFileParser(), clock: { now: () => new Date() }, idGenerator: { uuid: () => randomUUID() } });
  const NOW = new Date('2026-10-16T18:00:00.000Z');
  const codesOf = () => new RecommendationCodeService({ ...pgRepos(orm), clock: { now: () => NOW }, idGenerator: { uuid: () => randomUUID() }, logger: { warn: () => {} } });
  const owner = (second: SecondRestaurant, which: 1 | 2 = 1) => { const o = which === 1 ? second.owner1 : second.owner2; return { id: o.userId, name: o.name }; };
  const slug = SECOND_RESTAURANT.slug;

  it('two accepts of one invitation: exactly one succeeds, the other gets the dead-link answer, one user, one membership, one event', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const second = await seedSecondRestaurant(orm);
      const email = `accept${round}@example.test`;
      const issued = await invitationsOf().invite(slug, { email, role: 'sommelier' }, owner(second));
      const results = await race(
        () => invitationsOf().accept({ token: issued.token, name: 'First', password: 'a-long-enough-passphrase' }, null),
        () => invitationsOf().accept({ token: issued.token, name: 'Second', password: 'a-long-enough-passphrase' }, null)
      );
      expect(fulfilled(results), `round ${round}`).toHaveLength(1);
      // dead link (the winner had not committed at the loser's lock) or sign_in_required (the account the winner made is already there at the loser's pre-check): no second account either way
      expect(rejected(results)[0].reason, `round ${round}`).toMatchObject({ code: expect.stringMatching(/^(invalid_token|sign_in_required)$/) });
      expect(await sql('select 1 from app_user where lower(email) = ?', [email])).toHaveLength(1);
      expect(await sql('select 1 from membership m join app_user u on u.id = m.user_id where lower(u.email) = ?', [email])).toHaveLength(1);
      expect(await sql("select 1 from auth_event where type = 'invite_accepted' and meta->>'invitation_id' = ?", [issued.invitation.id])).toHaveLength(1);
      expect(await sql('select used_at from auth_token where id = ? and used_at is not null', [issued.invitation.id])).toHaveLength(1);
    }
  });

  it('parallel invitations to one e-mail: never two live tokens; the loser either replaced the winner or got invitation_conflict, and a dead token cannot be used', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const second = await seedSecondRestaurant(orm);
      const email = `dup${round}@example.test`;
      const results = await race(
        () => invitationsOf().invite(slug, { email, role: 'sommelier' }, owner(second, 1)),
        () => invitationsOf().invite(slug, { email, role: 'manager' }, owner(second, 2)),
        () => invitationsOf().invite(slug, { email, role: 'sommelier' }, owner(second, 1))
      );
      const won = fulfilled(results);
      expect(won.length, `round ${round}`).toBeGreaterThanOrEqual(1);
      for (const r of rejected(results)) expect(r.reason, `round ${round}`).toMatchObject({ code: 'invitation_conflict' });
      const live = await sql<{ id: string; role: string }>("select id, role from auth_token where kind = 'invite' and lower(email) = ? and used_at is null and revoked_at is null", [email]);
      expect(live, `round ${round}: exactly one live token`).toHaveLength(1);
      // the live one is the last committed of the fulfilled; every other fulfilled one is revoked, none is lost
      expect(won.map((w) => w.value.invitation.id)).toContain(live[0].id);
      const all = await sql<{ id: string; revoked_at: Date | null }>("select id, revoked_at from auth_token where kind = 'invite' and lower(email) = ?", [email]);
      expect(all.map((a) => a.id).sort()).toEqual(won.map((w) => w.value.invitation.id).sort());
      expect(all.filter((a) => a.revoked_at === null)).toHaveLength(1);
      // a revoked link is dead, the live one works
      for (const w of won) {
        const accept = invitationsOf().accept({ token: w.value.token, name: 'Someone', password: 'a-long-enough-passphrase' }, null);
        if (w.value.invitation.id === live[0].id) await expect(accept).resolves.toMatchObject({ role: live[0].role });
        else await expect(accept).rejects.toMatchObject({ code: 'invalid_token' });
      }
      expect(await sql('select 1 from membership m join app_user u on u.id = m.user_id where lower(u.email) = ?', [email])).toHaveLength(1);
    }
  });

  it('two role changes with the same expectedVersion: one succeeds, one gets version_conflict, version 2, one role_changed event that matches the stored role', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const second = await seedSecondRestaurant(orm);
      const results = await race(
        () => teamOf().changeRole(slug, second.sommelier.membershipId, 'waiter', owner(second, 1), 1),
        () => teamOf().changeRole(slug, second.sommelier.membershipId, 'manager', owner(second, 2), 1)
      );
      expect(fulfilled(results), `round ${round}`).toHaveLength(1);
      expect(rejected(results)[0].reason, `round ${round}`).toMatchObject({ code: 'version_conflict' });
      const row = (await sql<{ role: string; version: number }>('select role, version from membership where id = ?', [second.sommelier.membershipId]))[0];
      expect(row.version).toBe(2);
      expect(row.role).toBe(fulfilled(results)[0].value.role);
      const events = await sql<{ meta: { to: string } }>("select meta from auth_event where type = 'role_changed'");
      expect(events).toHaveLength(1);
      expect(events[0].meta.to).toBe(row.role);
    }
  });

  it('owners removing each other at the same moment: exactly one removal wins, the loser is refused (forbidden or last_owner), the winning actor stays the only active owner, one event', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const second = await seedSecondRestaurant(orm);
      const results = await race(
        () => teamOf().deactivate(slug, second.owner2.membershipId, owner(second, 1), 1),
        () => teamOf().deactivate(slug, second.owner1.membershipId, owner(second, 2), 1)
      );
      const active = await sql<{ id: string }>("select id from membership where restaurant_id = ? and role = 'owner' and status = 'active'", [second.restaurantId]);
      expect(active.length, `round ${round}: never zero owners`).toBeGreaterThanOrEqual(1);
      expect(fulfilled(results), `round ${round}`).toHaveLength(1);
      // the loser is refused either by the actor check (the winner had already removed it: forbidden) or by the last-owner rule (the winner's
      // change was still pending when it locked the rows: last_owner); never anything else, and in both cases the loser's change is not applied
      expect(rejected(results)[0].reason, `round ${round}`).toMatchObject({ code: expect.stringMatching(/^(forbidden|last_owner)$/) });
      const [winner, loser] = results[0].status === 'fulfilled' ? [second.owner1, second.owner2] : [second.owner2, second.owner1];
      const state = await sql<{ id: string; status: string; version: number }>('select id, status, version from membership where id in (?, ?)', [winner.membershipId, loser.membershipId]);
      expect(state.find((m) => m.id === winner.membershipId), `round ${round}: the winner's actor stays an active owner`).toMatchObject({ status: 'active', version: 1 });
      expect(state.find((m) => m.id === loser.membershipId), `round ${round}: the loser was removed by the winner`).toMatchObject({ status: 'deactivated', version: 2 });
      expect(await sql("select 1 from auth_event where type = 'member_deactivated'")).toHaveLength(1);
      expect(active).toHaveLength(1);
    }
  });

  it('two people confirming the same import job (and three): imported once, one closed job, the rest get job_closed', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const job = await importOf().upload('halka', 'menu', fixture('menu-bom.csv'), MARTA);
      const before = Number((await sql<{ n: string }>('select count(*)::text as n from dish'))[0].n);
      const results = await race(
        () => importOf().confirm('halka', job.id, MARTA),
        () => importOf().confirm('halka', job.id, TOMASZ),
        () => importOf().confirm('halka', job.id, MARTA)
      );
      expect(fulfilled(results), `round ${round}`).toHaveLength(1);
      for (const r of rejected(results)) expect(r.reason).toMatchObject({ code: 'job_closed' });
      expect(Number((await sql<{ n: string }>('select count(*)::text as n from dish'))[0].n)).toBe(before + 1);    // "Tartare" is new, "Duck breast" an update
      expect(await sql("select 1 from dish where name = 'Tartare, hand-cut'")).toHaveLength(1);
      expect(await sql("select status from import_job where id = ?", [job.id])).toEqual([{ status: 'confirmed' }]);
    }
  });

  it('pairing decisions on the same version (If-Match): one wins, the others get a version conflict, one version step, one history row, the stored state is the winner\'s', async () => {
    const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const seen = (await pgRepos(orm).pairingRepository.listByDish(ds.restaurant.id, duck.id)).find((p) => p.status === 'suggested')!;
      const results = await race(
        () => sommelierOf().approve('halka', seen.id, MARTA, seen.version),
        () => sommelierOf().reject('halka', seen.id, TOMASZ, seen.version),
        () => sommelierOf().setComment('halka', seen.id, 'a late comment', MARTA, seen.version)
      );
      expect(fulfilled(results), `round ${round}`).toHaveLength(1);
      for (const r of rejected(results)) expect(r.reason, `round ${round}`).toMatchObject({ name: 'VersionConflictError' });
      const now = (await pgRepos(orm).pairingRepository.findById(ds.restaurant.id, seen.id))!;
      expect(now.version, `round ${round}`).toBe(seen.version! + 1);
      const history = await pgRepos(orm).pairingRepository.listDecisions(ds.restaurant.id, { pairingId: seen.id });
      expect(history, `round ${round}: one decision, not one per attempt`).toHaveLength(1);
      // the stored state is the one the single winner wrote: its status or its comment, never a mix
      const winnerIs = history[0].action;
      if (winnerIs === 'approve') expect(['approved', 'modified']).toContain(now.status);
      if (winnerIs === 'reject') expect(now.status).toBe('rejected');
      if (winnerIs !== 'approve' && winnerIs !== 'reject') expect(now.comment).toBe('a late comment');
      const primaries = await sql("select 1 from pairing where dish_id = ? and role = 'primary'", [duck.id]);
      expect(primaries.length).toBeLessThanOrEqual(1);
    }
  });

  it('recommendation codes: the same choice from parallel requests gets one code and one row; different choices get distinct codes; confirm and undo never leave a half state', async () => {
    const dish = ds.dishes.find((d) => d.status === 'published')!;
    const wines = ds.wines.filter((w) => w.active && w.glassPrice !== null).slice(0, 4);
    const SID = '3f2b8c1a-9d4e-4a5b-8c6d-7e8f9a0b1c2d';
    const choice = (wineId: string, serving: 'glass' | 'bottle' = 'glass') => ({ session: { id: SID, isNew: false, source: 'link' as const }, source: 'guest' as const, wineId, serving, dishIds: [dish.id], tier: 'engine' as const });
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const same = await race(...[0, 1, 2, 3].map(() => () => codesOf().issue('halka', choice(wines[0].id))));
      expect(fulfilled(same)).toHaveLength(4);
      expect(new Set(fulfilled(same).map((r) => r.value!.code)).size, `round ${round}`).toBe(1);
      expect(await sql('select 1 from recommendation_code')).toHaveLength(1);

      const different = await race(...wines.slice(1).map((w) => () => codesOf().issue('halka', choice(w.id))));
      const codes = fulfilled(different).map((r) => r.value!.code);
      expect(new Set([...codes, fulfilled(same)[0].value!.code]).size, `round ${round}: codes are unique per day`).toBe(4);
      expect(await sql('select 1 from recommendation_code')).toHaveLength(4);

      const code = fulfilled(same)[0].value!.code;
      const marks = await race(
        () => codesOf().confirm('halka', code, 'staff_view'), () => codesOf().confirm('halka', code, 'staff_view'),
        () => codesOf().undo('halka', code, 'staff_view'), () => codesOf().confirm('halka', code, 'staff_view')
      );
      expect(fulfilled(marks)).toHaveLength(4);
      const row = (await sql<{ confirmed_at: Date | null; confirmed_by: string | null }>('select confirmed_at, confirmed_by from recommendation_code where code = ?', [code]))[0];
      expect(row.confirmed_at === null, `round ${round}: confirmed_at and confirmed_by are set or cleared together`).toBe(row.confirmed_by === null);
    }
  });

  it('the per-session cap on codes (R13) holds for parallel requests: with one place left, exactly one of eight distinct choices gets a code and the rest get null', async () => {
    const dish = ds.dishes.find((d) => d.status === 'published')!;
    const wine = ds.wines.find((w) => w.active && w.glassPrice !== null)!;
    const SID = '3f2b8c1a-9d4e-4a5b-8c6d-7e8f9a0b1c2e';
    const other = ds.dishes.filter((d) => d.status === 'published' && d.id !== dish.id);
    const choices = [...other.map((d) => [d.id]), ...other.flatMap((a, i) => other.slice(i + 1).map((b) => [a.id, b.id]))];
    const ask = (dishIds: string[], serving: 'glass' | 'bottle') => codesOf().issue('halka', { session: { id: SID, isNew: false, source: 'link' }, source: 'guest', wineId: wine.id, serving, dishIds, tier: null });
    // the first MAX - 1 choices by the glass, then eight different ones by the bottle (distinct choices: serving differs), all at once
    const plan = choices.flatMap((c) => [c, [...c, dish.id]]).slice(0, MAX_CODES_PER_SESSION_DAY - 1);
    expect(plan.length).toBe(MAX_CODES_PER_SESSION_DAY - 1);
    const burst = [[dish.id], ...choices.slice(0, 7).map((c) => [...c, dish.id].slice(0, 3))];
    expect(new Set(burst.map((c) => c.join())).size).toBe(8);
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      for (const c of plan) expect(await ask(c, 'glass'), `round ${round}: filling`).not.toBeNull();
      const results = await race(...burst.map((c) => () => ask(c, 'bottle')));
      expect(fulfilled(results), `round ${round}: no request failed`).toHaveLength(burst.length);
      const issued = fulfilled(results).filter((r) => r.value !== null);
      expect(issued, `round ${round}: exactly one place was left`).toHaveLength(1);
      const total = Number((await sql<{ n: string }>('select count(*)::text as n from recommendation_code where session_id = ?', [SID]))[0].n);
      expect(total, `round ${round}: exactly the cap, not above, not below`).toBe(MAX_CODES_PER_SESSION_DAY);
    }
  });

  it('two publishes from the same screen (expectedLatest): one creates the next version, the other gets a version conflict; numbers without gaps or duplicates (spec 2026-11-04-panel-completion, AC5)', async () => {
    const publishOf = () => new PublishService({ ...pgRepos(orm), clock: { now: () => new Date() }, idGenerator: { uuid: () => randomUUID() } });
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const seen = (await pgRepos(orm).publishRepository.latest(ds.restaurant.id))!.number;
      const results = await race(
        () => publishOf().publish('halka', MARTA, { expectedLatest: seen }),
        () => publishOf().publish('halka', TOMASZ, { expectedLatest: seen })
      );
      expect(fulfilled(results), `round ${round}`).toHaveLength(1);
      // the loser either waited for the winner's lock (stale expectedLatest) or already saw nothing left to publish
      for (const r of rejected(results)) expect(['VersionConflictError', 'ValidationError'], `round ${round}`).toContain((r.reason as Error).name);
      const numbers = (await sql<{ number: number }>('select number from published_version where restaurant_id = ? order by number', [ds.restaurant.id])).map((r) => r.number);
      expect(numbers, `round ${round}`).toEqual([1, 2]);
    }
  });

  const catalogOf = () => new CatalogEditService({ ...pgRepos(orm), clock: { now: () => new Date('2026-11-17T09:00:00.000Z') }, idGenerator: { uuid: () => randomUUID() } });

  it('two editors save the same wine from the same screen (expectedVersion): one wins, the other gets a version conflict, one audit row, the stored fields are the winner\'s (spec 2026-11-16-catalog-field-editing, AC4)', async () => {
    const wine = ds.wines.find((w) => w.listNumber !== undefined)!;
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const expectedVersion = wineFieldsVersion(wineFieldsOf((await pgRepos(orm).wineRepository.findById(ds.restaurant.id, wine.id))!));
      const results = await race(
        () => catalogOf().updateWine('halka', wine.id, { bottlePrice: 501 }, MARTA, expectedVersion),
        () => catalogOf().updateWine('halka', wine.id, { bottlePrice: 502 }, TOMASZ, expectedVersion)
      );
      expect(fulfilled(results), `round ${round}`).toHaveLength(1);
      for (const r of rejected(results)) expect((r.reason as Error).name, `round ${round}`).toBe('VersionConflictError');
      const edits = await sql<{ actor: string; after: { bottlePrice: number } }>('select actor, after from catalog_edit where restaurant_id = ?', [ds.restaurant.id]);
      expect(edits, `round ${round}: one audit row`).toHaveLength(1);
      const stored = (await sql<{ bottle_price: string }>('select bottle_price from wine where id = ?', [wine.id]))[0];
      expect(Number(stored.bottle_price), `round ${round}: the stored price is the winner's`).toBe(edits[0].after.bottlePrice);
    }
  });

  it('two different dishes renamed to one name at once: one rename wins, the other is a duplicate, never two dishes with one name', async () => {
    const [a, b] = ds.dishes.filter((d) => d.status === 'published');
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const results = await race(
        () => catalogOf().updateDish('halka', a.id, { name: 'Brand new name' }, MARTA),
        () => catalogOf().updateDish('halka', b.id, { name: 'BRAND NEW NAME!' }, TOMASZ)
      );
      expect(fulfilled(results), `round ${round}`).toHaveLength(1);
      for (const r of rejected(results)) expect(r.reason).toMatchObject({ fields: { name: 'duplicate' } });
      expect(await sql("select 1 from dish where lower(regexp_replace(name, '[^A-Za-z]', '', 'g')) = 'brandnewname'"), `round ${round}`).toHaveLength(1);
      expect(await sql('select 1 from catalog_edit where restaurant_id = ?', [ds.restaurant.id])).toHaveLength(1);
    }
  });

  it('a rename racing an import that creates a dish of that name: never two dishes with one key, whichever takes the lock first', async () => {
    const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const job = await importOf().upload('halka', 'menu', fixture('menu-bom.csv'), MARTA);
      const results = await race(
        async (): Promise<unknown> => catalogOf().updateDish('halka', duck.id, { name: 'Tartare, hand-cut' }, MARTA),
        () => importOf().confirm('halka', job.id, TOMASZ)
      );
      expect(results.filter((r) => r.status === 'fulfilled').length, `round ${round}`).toBeGreaterThanOrEqual(1);
      expect(await sql("select 1 from dish where name = 'Tartare, hand-cut'"), `round ${round}`).toHaveLength(1);
      for (const r of rejected(results)) expect((r.reason as { code?: string }).code, `round ${round}`).toMatch(/duplicate|validation_failed|catalog_conflict/);
    }
  });

  it('two editors save the same dish profile from the same screen (expectedVersion): one wins, the other gets a version conflict, one audit row (spec 2026-11-04-panel-completion, AC8)', async () => {
    const profilesOf = () => new ProfileService({ ...pgRepos(orm), clock: { now: () => new Date() }, idGenerator: { uuid: () => randomUUID() } });
    const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const expectedVersion = profileVersion((await pgRepos(orm).dishRepository.findById(ds.restaurant.id, duck.id))!.profile);
      const scales = dishScales(duck.profile);
      const results = await race(
        () => profilesOf().setDishProfile('halka', duck.id, { ...scales, intensity: 5 }, MARTA, { confirm: true, expectedVersion }),
        () => profilesOf().setDishProfile('halka', duck.id, { ...scales, intensity: 0 }, TOMASZ, { confirm: true, expectedVersion })
      );
      expect(fulfilled(results), `round ${round}`).toHaveLength(1);
      for (const r of rejected(results)) expect((r.reason as Error).name, `round ${round}`).toBe('VersionConflictError');
      const edits = await sql<{ actor: string; after: { intensity: number } }>('select actor, after from profile_edit where restaurant_id = ?', [ds.restaurant.id]);
      expect(edits, `round ${round}: one audit row`).toHaveLength(1);
      const stored = (await sql<{ profile_intensity: number; profile_confirmed_by: string }>('select profile_intensity, profile_confirmed_by from dish where id = ?', [duck.id]))[0];
      expect(stored.profile_intensity, `round ${round}: the stored profile is the winner's`).toBe(edits[0].after.intensity);
      expect(stored.profile_confirmed_by).toBe(edits[0].actor);
    }
  });

  /* ---------- the restaurant's picks (spec 2026-11-18-restaurant-picks, AC5) ---------- */
  const rid = () => ds.restaurant.id;
  const activeWineIds = () => ds.wines.filter((w) => w.active).map((w) => w.id).sort();
  const markInput = (wineId: string, enabled = true, over: object = {}) =>
    ({ wineId, enabled, editId: randomUUID(), actor: 'Marta', actorId: MARTA.id, at: new Date().toISOString(), max: PICKS_MAX, ...over });

  it('parallel picks of different wines never leave more than the limit: the free places are taken, the rest get too_many_picks, one history row per accepted pick', async () => {
    const ids = activeWineIds();
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const first = ids.slice(0, 3);
      for (const id of first) await pgRepos(orm).picksRepository.set(rid(), markInput(id));
      const results = await race(...ids.slice(3, 11).map((id) => () => pgRepos(orm).picksRepository.set(rid(), markInput(id))));
      expect(fulfilled(results), `round ${round}: exactly the two free places`).toHaveLength(PICKS_MAX - first.length);
      for (const r of rejected(results)) expect(r.reason, `round ${round}`).toMatchObject({ code: 'too_many_picks' });
      const rows = await sql<{ n: string }>('select count(*)::text as n from restaurant_pick where restaurant_id = ?', [rid()]);
      expect(Number(rows[0].n), `round ${round}: exactly the limit`).toBe(PICKS_MAX);
      const edits = await sql<{ n: string }>('select count(*)::text as n from pick_edit where restaurant_id = ?', [rid()]);
      expect(Number(edits[0].n), `round ${round}: one history row per pick`).toBe(PICKS_MAX);
    }
  });

  it('a pick of a wine that is being reactivated counts all the time: the limit holds whether the wine is on or off (B3)', async () => {
    const ids = activeWineIds();
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      for (const id of ids.slice(0, PICKS_MAX)) await pgRepos(orm).picksRepository.set(rid(), markInput(id));
      await pgRepos(orm).wineWriteRepository.setActive(rid(), ids[0], false);
      const results = await race<unknown>(
        () => pgRepos(orm).wineWriteRepository.setActive(rid(), ids[0], true),
        ...ids.slice(PICKS_MAX, PICKS_MAX + 4).map((id) => () => pgRepos(orm).picksRepository.set(rid(), markInput(id)))
      );
      expect(results.filter((r) => r.status === 'rejected' && (r.reason as { code?: string }).code !== 'too_many_picks'), `round ${round}: only the limit refuses`).toHaveLength(0);
      const active = await sql<{ n: string }>('select count(*)::text as n from restaurant_pick p join wine w on w.id = p.wine_id where p.restaurant_id = ? and w.active', [rid()]);
      const all = await sql<{ n: string }>('select count(*)::text as n from restaurant_pick where restaurant_id = ?', [rid()]);
      expect(Number(all[0].n), `round ${round}: the set stays at the limit`).toBe(PICKS_MAX);
      expect(Number(active[0].n), `round ${round}: never more than the limit active`).toBeLessThanOrEqual(PICKS_MAX);
    }
  });

  it('two writes of the same wine from the same screen (expectedVersion): one wins, the other a version conflict; one row, one history row', async () => {
    const [wine] = activeWineIds();
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const expectedVersion = picksVersion([]);
      const results = await race(
        () => pgRepos(orm).picksRepository.set(rid(), markInput(wine, true, { expectedVersion })),
        () => pgRepos(orm).picksRepository.set(rid(), markInput(wine, true, { expectedVersion }))
      );
      expect(fulfilled(results), `round ${round}`).toHaveLength(1);
      for (const r of rejected(results)) expect((r.reason as Error).name, `round ${round}`).toBe('VersionConflictError');
      expect(await sql('select 1 from restaurant_pick where restaurant_id = ?', [rid()]), `round ${round}`).toHaveLength(1);
      expect(await sql('select 1 from pick_edit where restaurant_id = ?', [rid()]), `round ${round}`).toHaveLength(1);
    }
  });

  it('a publish and a pick at the same time: the version holds the set wholly before or wholly after the change, never half of it', async () => {
    const ids = activeWineIds();
    const publishOf = () => new PublishService({ ...pgRepos(orm), clock: { now: () => new Date() }, idGenerator: { uuid: () => randomUUID() } });
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      // the first pick is unpublished: the publish has something to do, whatever the second pick does
      await pgRepos(orm).picksRepository.set(rid(), markInput(ids[0]));
      const results = await race<unknown>(
        () => publishOf().publish('halka', MARTA),
        () => pgRepos(orm).picksRepository.set(rid(), markInput(ids[1]))
      );
      expect(fulfilled(results), `round ${round}: both succeed`).toHaveLength(2);
      const versions = await sql<{ number: number; snapshot: { picks: { wineIds: string[] } }; changes_count: number }>('select number, snapshot, changes_count from published_version where restaurant_id = ? order by number', [rid()]);
      const published = versions[versions.length - 1].snapshot.picks.wineIds;
      expect([[ids[0]], [ids[0], ids[1]].sort()], `round ${round}`).toContainEqual(published);
      const working = await sql<{ wine_id: string }>('select wine_id from restaurant_pick where restaurant_id = ?', [rid()]);
      expect(working.map((r) => r.wine_id).sort(), `round ${round}`).toEqual([ids[0], ids[1]].sort());
    }
  });

  /* ---------- the launch day log of the results report (spec 2026-11-18-owner-proof-report, R5, AC19) ---------- */
  const launchInput = (launchDay: string, expectedCurrent: string | null, reason: string | null) =>
    ({ id: randomUUID(), launchDay, reason, setByRole: 'owner', setByMembershipId: null, at: new Date().toISOString(), expectedCurrent });
  const launchRows = () => sql<{ seq: number; reason: string | null }>('select seq, reason from proof_launch_day where restaurant_id = ? order by seq', [rid()]);

  it('two parallel first launch days: one becomes entry 1, the other a version conflict; no second row, so none without a reason', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const results = await race(...[0, 1, 2, 3].map((i) => () => pgRepos(orm).proofLaunchRepository.append(rid(), launchInput(`2033-01-1${i}`, null, null))));
      expect(fulfilled(results), `round ${round}: one winner`).toHaveLength(1);
      for (const r of rejected(results)) expect(r.reason, `round ${round}`).toMatchObject({ name: 'VersionConflictError' });
      expect((await launchRows()).map((r) => r.seq), `round ${round}: one row`).toEqual([1]);
    }
  });

  it('two parallel changes of the launch day from the same screen: one wins as entry 2 with its reason, the other a version conflict', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await resetData(orm);
      const first = await pgRepos(orm).proofLaunchRepository.append(rid(), launchInput('2033-01-10', null, null));
      const results = await race(...[0, 1, 2].map((i) => () => pgRepos(orm).proofLaunchRepository.append(rid(), launchInput(`2033-01-2${i}`, first.id, `reason ${i}`))));
      expect(fulfilled(results), `round ${round}: one winner`).toHaveLength(1);
      for (const r of rejected(results)) expect(r.reason, `round ${round}`).toMatchObject({ name: 'VersionConflictError' });
      const rows = await launchRows();
      expect(rows.map((r) => r.seq), `round ${round}`).toEqual([1, 2]);
      expect(rows.filter((r) => r.seq > 1).every((r) => r.reason), `round ${round}: every later row has a reason`).toBe(true);
    }
  });
});
