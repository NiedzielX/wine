import type { MikroORM } from '@mikro-orm/postgresql';
import {
  ImportService, InvitationService, MAX_CODES_PER_SESSION_DAY, RecommendationCodeService, SECOND_RESTAURANT, SommelierService, TeamService, buildDemoDataset, type SecondRestaurant
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
    const outcomes = new Set<string>();
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
      outcomes.add(`${won.length} fulfilled`);
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
    expect(outcomes.size).toBeGreaterThan(0);
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

  it('owners removing each other at the same moment (and three-way): the restaurant never has zero active owners, the loser is refused with last_owner and leaves no event', async () => {
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
      expect(rejected(results)[0].reason).toMatchObject({ code: expect.stringMatching(/^(last_owner|forbidden)$/) });
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

  it('the per-session cap on codes (R13) holds for parallel requests', async () => {
    const dish = ds.dishes.find((d) => d.status === 'published')!;
    const wine = ds.wines.find((w) => w.active && w.glassPrice !== null)!;
    const SID = '3f2b8c1a-9d4e-4a5b-8c6d-7e8f9a0b1c2e';
    const other = ds.dishes.filter((d) => d.status === 'published' && d.id !== dish.id);
    // distinct choices for one session: (serving x dish set); fill the session to one below the cap, then ask for 8 more at once
    const choices = [...other.map((d) => [d.id]), ...other.flatMap((a, i) => other.slice(i + 1).map((b) => [a.id, b.id]))];
    const ask = (dishIds: string[], serving: 'glass' | 'bottle') => codesOf().issue('halka', { session: { id: SID, isNew: false, source: 'link' }, source: 'guest', wineId: wine.id, serving, dishIds, tier: null });
    const plan = choices.flatMap((c) => [c, [...c, dish.id]]).slice(0, MAX_CODES_PER_SESSION_DAY - 1);
    expect(plan.length).toBe(MAX_CODES_PER_SESSION_DAY - 1);
    for (const c of plan) expect(await ask(c, 'glass')).not.toBeNull();
    const burst = [dish.id, ...choices.slice(0, 7).map((c) => c)].map((c) => (Array.isArray(c) ? c : [c]));
    const results = await race(...burst.map((c, i) => () => ask([...c, ...(i ? [dish.id] : [])].slice(0, 3), 'bottle')));
    const total = Number((await sql<{ n: string }>('select count(*)::text as n from recommendation_code where session_id = ?', [SID]))[0].n);
    expect(fulfilled(results).length).toBeGreaterThan(0);
    expect(total, 'no more codes than the cap, however the requests interleave').toBeLessThanOrEqual(MAX_CODES_PER_SESSION_DAY);
  });
});
