import { Migrator } from '@mikro-orm/migrations';
import { MikroORM } from '@mikro-orm/postgresql';
import {
  AdminService, AuthService, RecommendationCodeService, DEFAULT_AUTH_CONFIG, DEMO_PASSWORD, DEFAULT_PREFS, ImportService, OpportunityService, RestaurantService, TranslationService, authContract, translationsVersion, importContract, RecommendationService, PublishService, SommelierService, VersionConflictError, buildDemoDataset, teamContract, invitationContract, InvitationService, SECOND_RESTAURANT, TeamService, type SecondRestaurant, type AuthEvent,
  createMemoryRepositories, MemoryStore, recommendForDish, repositoryContract, writeContract, type Repositories
} from '@wine-match/core';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '@wine-match/testkit';
import { inject } from 'vitest';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ormConfig } from '../src/config';
import { Migration20261015140000_bilingual_content } from '../src/migrations/Migration20261015140000_bilingual_content';
import { Migration20261018125821_recommendation_code } from '../src/migrations/Migration20261018125821_recommendation_code';
import { Migration20261016152214_opportunity_dismissal } from '../src/migrations/Migration20261016152214_opportunity_dismissal';
import { Migration20261019064652_sales_record } from '../src/migrations/Migration20261019064652_sales_record';
import { Migration20261021190119_sales_record_recommendation_code } from '../src/migrations/Migration20261021190119_sales_record_recommendation_code';
import { Migration20261105160730_team_status_and_auth_event } from '../src/migrations/Migration20261105160730_team_status_and_auth_event';
import { MembershipEntity, PairingEntity, UserEntity } from '../src/entities';
import { PgAuthAuditRepository, PgTeamRepository } from '../src/repositories/team';
import { PgInvitationRepository } from '../src/repositories/invitations';
import { Migration20261106114659_auth_token } from '../src/migrations/Migration20261106114659_auth_token';
import { PgAuthRepository } from '../src/repositories/auth';
import { PgImportRepository } from '../src/repositories/import';
import { NodeImportFileParser } from '../src/import';
import { NodeSessionTokens, ScryptPasswordHasher, hashPassword, verifyPassword } from '../src/auth';
import { RestaurantEntity } from '../src/entities';
import { readFileSync } from 'node:fs';
import {
  PgContentWriteRepository, PgDishRepository, PgGuestInteractionRepository, PgRecommendationCodeRepository, PgOpportunityDismissalRepository, PgPairingRepository, PgPairingWriteRepository, PgPublishRepository, PgRestaurantRepository,
  PgRestaurantWriteRepository, PgSalesRepository, PgWineRepository, PgWineWriteRepository
} from '../src/repositories';
import { DemoSeeder } from '../src/seeders/DemoSeeder';

const baseUrl = inject('databaseUrl');
const ds = buildDemoDataset({ ids: 'uuid' });
const actor = (key: string, name: string) => ({ id: ds.users.find((u) => u.key === key)!.id, name });
const MARTA = actor('marta', 'Marta Wierzbicka');
const TOMASZ = actor('tomasz', 'Tomasz Lis');

/** Creates a fresh test database, applies the real migrations and seeds the demo data. */
async function freshDatabase(name = 'winematch_db_test'): Promise<MikroORM> {
  const url = new URL(await createDatabase(baseUrl, name));
  const orm = await MikroORM.init(ormConfig({
    clientUrl: url.toString(),
    extensions: [Migrator],
    migrations: { path: fileURLToPath(new URL('../src/migrations', import.meta.url)), transactional: true, allOrNothing: true }
  }));
  await orm.migrator.up();
  await new DemoSeeder().run(orm.em.fork());
  return orm;
}

/** Empties every table and loads the demo data again: each write test starts from the same state. */
async function resetData(orm: MikroORM): Promise<void> {
  await orm.em.getConnection().execute('truncate table auth_event, auth_token, sales_record, session, membership, app_user, opportunity_dismissal, recommendation_code, sommelier_decision, published_version, pairing, wine, dish, guest_interaction, import_job, restaurant restart identity cascade');
  await new DemoSeeder().run(orm.em.fork());
}

/** The second restaurant of the team contract: two owners, a manager and a sommelier (the memory setup adds the same people). */
async function seedSecondRestaurant(orm: MikroORM): Promise<SecondRestaurant> {
  const em = orm.em.fork();
  const r = em.create(RestaurantEntity, { id: SECOND_RESTAURANT.id, slug: SECOND_RESTAURANT.slug, name: SECOND_RESTAURANT.name, tagline: '', address: 'x', city: 'y', wineDirector: 'z', status: 'active', settings: { showUnreviewed: true, showScores: true } });
  let i = 0;
  for (const m of SECOND_RESTAURANT.members) {
    const user = em.create(UserEntity, { id: m.userId, email: m.email, name: m.name, passwordHash: 'scrypt$unused' });
    em.create(MembershipEntity, { id: m.membershipId, user, restaurant: r, role: m.role, createdAt: new Date(Date.parse('2026-10-02T08:00:00.000Z') + ++i * 1000) });
  }
  await em.flush();
  const [owner1, owner2, manager, sommelier] = SECOND_RESTAURANT.members;
  return { restaurantId: SECOND_RESTAURANT.id, owner1, owner2, manager, sommelier };
}

/** Repositories over a fresh EntityManager fork, as the DI container builds them per request. */
function pgRepos(orm: MikroORM): Repositories {
  const em = orm.em.fork();
  return {
    restaurantRepository: new PgRestaurantRepository({ em }),
    dishRepository: new PgDishRepository({ em }),
    wineRepository: new PgWineRepository({ em }),
    pairingRepository: new PgPairingRepository({ em }),
    pairingWriteRepository: new PgPairingWriteRepository({ em }),
    wineWriteRepository: new PgWineWriteRepository({ em }),
    restaurantWriteRepository: new PgRestaurantWriteRepository({ em }),
    publishRepository: new PgPublishRepository({ em }),
    contentWriteRepository: new PgContentWriteRepository({ em }),
    importRepository: new PgImportRepository({ em }),
    opportunityDismissalRepository: new PgOpportunityDismissalRepository({ em }),
    guestInteractionRepository: new PgGuestInteractionRepository({ em }),
    recommendationCodeRepository: new PgRecommendationCodeRepository({ em }),
    salesRepository: new PgSalesRepository({ em }),
    teamRepository: new PgTeamRepository({ em }),
    authAuditRepository: new PgAuthAuditRepository({ em }),
    invitationRepository: new PgInvitationRepository({ em })
  };
}

function services(repos: Repositories) {
  let seq = 0;
  const clock = { now: () => new Date(Date.parse('2026-10-14T10:00:00.000Z') + ++seq * 1000) };
  const idGenerator = { uuid: () => randomUUID() };
  return {
    som: new SommelierService({ ...repos, clock, idGenerator }),
    publish: new PublishService({ ...repos, clock, idGenerator }),
    rec: new RecommendationService(repos),
    admin: new AdminService(repos),
    imp: new ImportService({ ...repos, importFileParser: new NodeImportFileParser(), clock, idGenerator }),
    restaurantSvc: new RestaurantService(repos),
    tr: new TranslationService(repos)
  };
}

const run = describe;

run('PostgreSQL', () => {
  let orm: MikroORM;
  beforeAll(async () => { orm = await freshDatabase(); });
  afterAll(async () => { await orm?.close(true); });

  repositoryContract('postgres', async () => ({ repos: pgRepos(orm), dataset: ds }), { describe, it, expect, beforeAll, afterAll });

  it('gives the same recommendations as the engine on the demo data', async () => {
    const { rec } = services(pgRepos(orm));
    for (const dish of ds.dishes.filter((d) => d.status === 'published')) {
      const out = await rec.forDish('halka', dish.id, { serving: 'glass' });
      const direct = recommendForDish(dish, ds.wines.filter((w) => w.active), ds.pairings.filter((p) => p.dishId === dish.id && p.status !== 'suggested'), { ...DEFAULT_PREFS, serving: 'glass' });
      expect(out!.result.items.map((i) => `${i.wine.id}:${i.matchScore}:${i.tier}`)).toEqual(direct.items.map((i) => `${i.wine.id}:${i.matchScore}:${i.tier}`));
    }
  });

  it('seeds the demo restaurant as published version 1', async () => {
    const v = await pgRepos(orm).publishRepository.latest(ds.restaurant.id);
    expect(v).toMatchObject({ number: 1, changesCount: 0, publishedBy: 'Marta Wierzbicka' });
  });

  it('the database rejects a second primary pairing for a dish and a duplicate pair, even without the service', async () => {
    const em = orm.em.fork();
    const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
    const second = await em.findOneOrFail(PairingEntity, { dish: duck.id, role: null, status: 'suggested' });
    second.role = 'primary';
    second.status = 'approved';
    await expect(em.flush()).rejects.toThrow(/pairing_one_primary_per_dish/);

    const em2 = orm.em.fork();
    const existing = await em2.findOneOrFail(PairingEntity, { status: 'approved' });
    em2.create(PairingEntity, {
      id: '11111111-1111-4111-8111-111111111111', restaurant: existing.restaurant, dish: existing.dish, wine: existing.wine,
      modelScore: 80, engineVersion: 'test', source: 'sommelier', updatedBy: 'test'
    });
    await expect(em2.flush()).rejects.toThrow(/pairing_dish_id_wine_id_unique/);
  });

  authContract('postgres', async () => { await resetData(orm); return { repo: new PgAuthRepository({ em: orm.em.fork() }), dataset: ds }; }, { describe, it, expect, beforeEach });

  it('stores the session token only as a hash, and passwords only as scrypt hashes', async () => {
    const em = orm.em.fork();
    const repo = new PgAuthRepository({ em });
    await repo.createSession({ id: '77777777-7777-4777-8777-777777777777', userId: ds.users[0].id, tokenHash: 'a'.repeat(64), csrfToken: 'b'.repeat(64), createdAt: '2026-10-14T10:00:00.000Z', expiresAt: '2026-10-14T22:00:00.000Z' });
    const raw = await orm.em.getConnection().execute<Array<{ token_hash: string }>>("select token_hash from session where id = '77777777-7777-4777-8777-777777777777'");
    expect(raw[0].token_hash).toBe('a'.repeat(64));
    const hashes = await orm.em.getConnection().execute<Array<{ password_hash: string }>>('select password_hash from app_user');
    expect(hashes.length).toBe(3);
    expect(hashes.every((h) => h.password_hash.startsWith('scrypt$'))).toBe(true);
  });

  // The next contracts reset the data before every test, so they come after the read-only checks.
  importContract('postgres', async () => { await resetData(orm); return { repos: pgRepos(orm), dataset: ds }; }, { describe, it, expect, beforeEach });

  teamContract('postgres', async () => {
    await resetData(orm);
    const second = await seedSecondRestaurant(orm);
    const em = orm.em.fork();
    return { team: new PgTeamRepository({ em }), audit: new PgAuthAuditRepository({ em }), auth: new PgAuthRepository({ em }), dataset: ds, second };
  }, { describe, it, expect, beforeEach });

  invitationContract('postgres', async () => {
    await resetData(orm);
    const second = await seedSecondRestaurant(orm);
    const em = orm.em.fork();
    return { invites: new PgInvitationRepository({ em }), team: new PgTeamRepository({ em }), audit: new PgAuthAuditRepository({ em }), auth: new PgAuthRepository({ em }), dataset: ds, second };
  }, { describe, it, expect, beforeEach });

  // Write contract last: it resets the data before every test.
  writeContract('postgres', async () => { await resetData(orm); return { repos: pgRepos(orm), dataset: ds }; }, { describe, it, expect, beforeEach });

  describe('with real concurrency and the services', () => {
    beforeEach(async () => { await resetData(orm); });

    it('two sessions edit the same pairing: the second one gets a version conflict and the first change survives', async () => {
      const a = services(pgRepos(orm));
      const b = services(pgRepos(orm));
      const saw = (await pgRepos(orm).pairingRepository.listByDish(ds.restaurant.id, ds.dishes.find((d) => d.name === 'Duck breast')!.id)).find((p) => p.role === 'best_value')!;
      await a.som.setComment('halka', saw.id, 'From the first session', MARTA, saw.version);
      await expect(b.som.setComment('halka', saw.id, 'From the second session', TOMASZ, saw.version)).rejects.toBeInstanceOf(VersionConflictError);
      expect((await pgRepos(orm).pairingRepository.findById(ds.restaurant.id, saw.id))!.comment).toBe('From the first session');
    });

    it('records who made each change, by name and by account id', async () => {
      const a = services(pgRepos(orm));
      const s = (await pgRepos(orm).pairingRepository.listByDish(ds.restaurant.id, ds.dishes.find((d) => d.name === 'Duck breast')!.id)).find((p) => p.status === 'suggested')!;
      await a.som.approve('halka', s.id, MARTA);
      const trail = await pgRepos(orm).pairingRepository.listDecisions(ds.restaurant.id, { pairingId: s.id });
      expect(trail[0]).toMatchObject({ actor: 'Marta Wierzbicka', actorId: MARTA.id, action: 'approve' });
      expect((await pgRepos(orm).pairingRepository.findById(ds.restaurant.id, s.id))!.updatedBy).toBe('Marta Wierzbicka');
    });

    it('behaves exactly like the in-memory store: same commands, same guest view before and after publish', async () => {
      const mem = createMemoryRepositories(MemoryStore.from(buildDemoDataset({ ids: 'uuid' })));
      const stores = [{ name: 'memory', s: services(mem) }, { name: 'postgres', s: services(pgRepos(orm)) }];
      const results: Record<string, string[][]> = {};
      for (const { name, s } of stores) {
        const pork = ds.dishes.find((d) => d.name === 'Glazed pork belly')!;
        const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
        const guest = async () => (await s.rec.forDish('halka', pork.id))!.result.items.map((i) => `${i.wine.name}:${i.tier}:${i.sommelier?.role ?? '-'}`);
        const before = await guest();
        await s.som.approveAll('halka', MARTA, pork.id);
        const unpublished = await guest();
        const mine = (await s.admin.dishDetail('halka', duck.id))!.topMatches.find((m) => !['Savigny-lès-Beaune', 'Morgon'].includes(m.wine.name))!;
        await s.som.addManual('halka', { dishId: duck.id, wineId: mine.wine.id, role: 'primary', comment: 'Mine' }, MARTA);
        const v = await s.publish.publish('halka', MARTA);
        const after = await guest();
        const duckAfter = (await s.rec.forDish('halka', duck.id))!.result.items.map((i) => `${i.wine.name}:${i.tier}:${i.sommelier?.role ?? '-'}`);
        results[name] = [before, unpublished, after, duckAfter, [String(v.number), String(v.changesCount)]];
      }
      expect(results.postgres).toEqual(results.memory);
      expect(results.postgres[0]).toEqual(results.postgres[1]);       // guests saw nothing before publish
      expect(results.postgres[1]).not.toEqual(results.postgres[2]);   // and the new state after it
    });
  });

  describe('password hashes on PostgreSQL', () => {
    beforeEach(async () => { await resetData(orm); });

    it('a account with an old, weaker scrypt hash signs in and gets today\'s parameters stored', async () => {
      const em = orm.em.fork();
      const repo = new PgAuthRepository({ em });
      const marta = ds.users.find((u) => u.key === 'marta')!;
      await repo.updatePasswordHash(marta.id, await hashPassword(DEMO_PASSWORD, { N: 32768, r: 8, p: 1 }));
      const stored = async () => (await new PgAuthRepository({ em: orm.em.fork() }).findUserByEmail('marta@halka.pl'))!.passwordHash;
      expect(await stored()).toMatch(/^scrypt\$32768\$8\$1\$/);

      const auth = new AuthService({
        authRepository: new PgAuthRepository({ em: orm.em.fork() }), passwordHasher: await ScryptPasswordHasher.create(), sessionTokens: new NodeSessionTokens(),
        clock: { now: () => new Date() }, idGenerator: { uuid: () => randomUUID() }, authConfig: DEFAULT_AUTH_CONFIG
      });
      await auth.login('marta@halka.pl', DEMO_PASSWORD);
      const upgraded = await stored();
      expect(upgraded).toMatch(/^scrypt\$32768\$8\$3\$/);
      expect(await verifyPassword(DEMO_PASSWORD, upgraded)).toBe(true);                 // the same password still works
      await expect(auth.login('marta@halka.pl', 'not-the-password')).rejects.toMatchObject({ code: 'invalid_credentials' });
      expect(await stored()).toBe(upgraded);                                            // a failed login changes nothing
    });
  });

  describe('import on PostgreSQL, with real files and real concurrency', () => {
    beforeEach(async () => { await resetData(orm); });
    const fixture = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))) });

    it('reads a real XLSX, shows the checks, takes the corrections and saves into the database', async () => {
      const s = services(pgRepos(orm));
      const job = await s.imp.upload('halka', 'menu', fixture('menu.xlsx'), MARTA);
      expect(job.rows.map((r) => [r.fields.name, r.include, r.action])).toEqual([
        ['Smoked trout rillettes', true, 'create'], ['Beetroot carpaccio', true, 'create'], ['Roast chicken for two', true, 'create'],
        ['Grilled cauliflower steak', true, 'create'], ['Veal schnitzel', false, 'create'], ['Plum tart', true, 'create'], ['Duck breast', false, 'update']
      ]);
      expect(job.rows[1].fields.price).toBe('38.5');                         // "38,50 zł" read from the cell
      expect(job.rows[4].issues[0]).toMatchObject({ level: 'error', field: 'price' });
      const fresh = services(pgRepos(orm));                                   // a new request: the preview is in the database
      expect((await fresh.imp.get('halka', job.id)).rows).toEqual(job.rows);
      const result = await fresh.imp.confirm('halka', job.id, MARTA, [{ rowNumber: 5, fields: { price: '64' } }]);
      expect(result).toMatchObject({ created: 6, updated: 0, skipped: 1 });
      const dishes = await pgRepos(orm).dishRepository.listByRestaurant(ds.restaurant.id);
      expect(dishes.find((d) => d.name === 'Veal schnitzel')).toMatchObject({ price: 64, status: 'draft', profile: { source: 'draft' } });
      expect(dishes.find((d) => d.name === 'Duck breast')!.price).toBe(112);   // the duplicate was left alone
      const raw = await orm.em.getConnection().execute<Array<{ n: string }>>("select count(*)::text as n from pairing p join dish d on d.id = p.dish_id where d.name = 'Plum tart' and p.status = 'suggested'");
      expect(Number(raw[0].n)).toBeGreaterThan(0);
    });

    it('reads a real wine PDF as text and a Windows-1250 CSV with Polish characters', async () => {
      const s = services(pgRepos(orm));
      const pdf = await s.imp.upload('halka', 'wines', fixture('wines.pdf'), MARTA);
      expect(pdf.parser).toBe('pdf-text');
      expect(pdf.notes[0]).toMatch(/check every row/);
      expect(pdf.rows.map((r) => [r.fields.producer, r.fields.name, r.fields.vintage, r.fields.style, r.fields.glassPrice, r.fields.bottlePrice])).toEqual([
        ['Weingut Keller', 'Riesling trocken', '2022', 'white', '52', '240'], ['Domaine Huet', 'Le Haut-Lieu Sec', '2021', 'white', '', '310'],
        ['Berece & Fils', 'Brut Reserve', 'NV', 'sparkling', '68', '360'], ['Isole e Olena', 'Chianti Classico', '2020', 'red', '46', '220']
      ]);
      const csv = await s.imp.upload('halka', 'menu', fixture('menu-1250.csv'), MARTA);
      expect(csv.rows.map((r) => [r.fields.name, r.fields.category, r.fields.price])).toEqual([['Tatar z jelenia', 'Starters', '74'], ['Sandacz', 'Mains', '98.5'], ['Sernik', 'Desserts', '38']]);
      await s.imp.confirm('halka', csv.id, MARTA);
      expect((await pgRepos(orm).dishRepository.listByRestaurant(ds.restaurant.id)).some((d) => d.name === 'Tatar z jelenia')).toBe(true);
    });

    it('two people pressing "Import" at the same moment import once', async () => {
      const a = services(pgRepos(orm));
      const b = services(pgRepos(orm));
      const job = await a.imp.upload('halka', 'menu', fixture('menu-bom.csv'), MARTA);
      const before = (await pgRepos(orm).dishRepository.listByRestaurant(ds.restaurant.id)).length;
      const results = await Promise.allSettled([a.imp.confirm('halka', job.id, MARTA), b.imp.confirm('halka', job.id, TOMASZ)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect((failed.reason as { code?: string }).code).toBe('job_closed');
      expect((await pgRepos(orm).dishRepository.listByRestaurant(ds.restaurant.id)).length).toBe(before + 1);   // "Tartare" is new, "Duck breast" is an update
    });

    it('another restaurant cannot see or confirm this import, and cannot take over a slug', async () => {
      const s = services(pgRepos(orm));
      const job = await s.imp.upload('halka', 'menu', fixture('menu-bom.csv'), MARTA);
      const em = orm.em.fork();
      em.create(RestaurantEntity, { id: '99999999-9999-4999-8999-999999999999', slug: 'other', name: 'Other', tagline: '', address: 'x', city: 'y', wineDirector: 'z', status: 'active', settings: { showUnreviewed: true, showScores: true } });
      await em.flush();
      const repos = pgRepos(orm);
      expect(await repos.importRepository.find('99999999-9999-4999-8999-999999999999', job.id)).toBeNull();
      await expect(repos.restaurantWriteRepository.updateDetails(ds.restaurant.id, { name: 'Halka', slug: 'other', address: 'a', city: 'c', wineDirector: 'w' })).rejects.toMatchObject({ code: 'slug_taken' });
      await expect(services(pgRepos(orm)).restaurantSvc.updateDetails('halka', { slug: 'other' })).rejects.toMatchObject({ code: 'slug_taken' });
      await em.nativeDelete(RestaurantEntity, { id: '99999999-9999-4999-8999-999999999999' });
    });

    it('does not keep the uploaded file: only what was read from it is in the database', async () => {
      const s = services(pgRepos(orm));
      const job = await s.imp.upload('halka', 'menu', fixture('menu.xlsx'), MARTA);
      const raw = await orm.em.getConnection().execute<Array<{ storage_key: string | null; file_size: number; file_name: string }>>("select storage_key, file_size, file_name from import_job where id = '" + job.id + "'");
      expect(raw[0]).toMatchObject({ storage_key: null, file_name: 'menu.xlsx' });
      expect(raw[0].file_size).toBeGreaterThan(1000);
    });
  });

  describe('bilingual content on PostgreSQL (spec 2026-10-15-bilingual-content)', () => {
    beforeEach(async () => { await resetData(orm); });
    const fixture = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))) });
    const columns = async (table: string) => (await orm.em.getConnection().execute<Array<{ column_name: string; column_default: string | null; is_nullable: string }>>(
      'select column_name, column_default, is_nullable from information_schema.columns where table_name = ? order by column_name', [table]));

    it('the migration adds the columns with their defaults, and down removes them again (AC5)', async () => {
      expect((await columns('dish')).find((c) => c.column_name === 'translations')).toMatchObject({ is_nullable: 'NO', column_default: "'{}'::jsonb" });
      expect((await columns('restaurant')).find((c) => c.column_name === 'content_locale')).toMatchObject({ is_nullable: 'NO', column_default: "'en'::text" });
      expect((await columns('pairing')).some((c) => c.column_name === 'comment_translations')).toBe(true);
      // the real migration class, its SQL run statement by statement
      const migration = new Migration20261015140000_bilingual_content(orm.em.getDriver(), orm.config);
      const run = async (fn: 'up' | 'down') => {
        migration.reset();
        await migration[fn]();
        for (const q of migration.getQueries()) await migration.execute(q);
      };
      await run('down');
      expect((await columns('dish')).some((c) => c.column_name === 'translations')).toBe(false);
      expect((await columns('restaurant')).some((c) => c.column_name === 'content_locale')).toBe(false);
      await run('up');
      expect((await columns('wine')).some((c) => c.column_name === 'translations')).toBe(true);
      await resetData(orm);
    });

    it('the seeder fills the translations of a database seeded before them, once, without overwriting edits', async () => {
      const conn = orm.em.getConnection();
      await conn.execute(`update dish set translations = '{}'; update wine set translations = '{}'; update restaurant set translations = '{}'; update pairing set comment_translations = '{}'`);
      await conn.execute(`update published_version set snapshot = snapshot - 'content'`);
      const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
      await conn.execute(`update dish set translations = '{"pl":{"name":"Kaczka (edytowana)"}}' where id = ?`, [duck.id]);
      expect((await pgRepos(orm).publishRepository.publishedContent(ds.restaurant.id)).dishes.size).toBe(0);   // old snapshot: read as {}
      await new DemoSeeder().run(orm.em.fork());
      await new DemoSeeder().run(orm.em.fork());
      const repos = pgRepos(orm);
      expect((await repos.dishRepository.findById(ds.restaurant.id, duck.id))!.translations).toEqual({ pl: { name: 'Kaczka (edytowana)' } });
      const tartare = ds.dishes.find((d) => d.name === 'Beef tartare')!;
      expect((await repos.dishRepository.findById(ds.restaurant.id, tartare.id))!.translations).toEqual(tartare.translations);
      expect((await repos.restaurantRepository.findBySlug('halka'))!.translations).toEqual(ds.restaurant.translations);
      expect((await repos.publishRepository.publishedContent(ds.restaurant.id)).dishes.get(tartare.id)).toEqual(tartare.translations);
    });

    it('imports a real CSV with translation columns into the database (AC3)', async () => {
      const s = services(pgRepos(orm));
      const job = await s.imp.upload('halka', 'menu', fixture('menu-translations.csv'), MARTA);
      expect(job.rows[0].issues.some((i) => i.code === 'translation_empty')).toBe(true);
      await s.imp.confirm('halka', job.id, MARTA, [{ rowNumber: 2, include: true }]);
      const dishes = await pgRepos(orm).dishRepository.listByRestaurant(ds.restaurant.id);
      expect(dishes.find((d) => d.name === 'Plum tart')!.translations).toEqual({ pl: { name: 'Tarta śliwkowa', description: 'Pieczona tarta ze śliwkami, lody waniliowe' } });
      const duck = dishes.find((d) => d.name === 'Duck breast')!;
      // the empty Polish description cell kept the demo's translation
      expect(duck.translations).toEqual({ pl: { name: 'Pierś z kaczki', description: ds.dishes.find((d) => d.id === duck.id)!.translations.pl!.description }, en: { name: 'Duck breast', description: 'Roasted duck, sour cherry jus' } });
    });

    it('two editors save the same dish translation: the second one gets a version conflict (AC4)', async () => {
      const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
      const seen = translationsVersion(duck.translations);
      await services(pgRepos(orm)).tr.setDishTranslations('halka', duck.id, { pl: { name: 'Kaczka A' } }, MARTA, seen);
      await expect(services(pgRepos(orm)).tr.setDishTranslations('halka', duck.id, { pl: { name: 'Kaczka B' } }, TOMASZ, seen)).rejects.toBeInstanceOf(VersionConflictError);
      expect((await pgRepos(orm).dishRepository.findById(ds.restaurant.id, duck.id))!.translations.pl!.name).toBe('Kaczka A');
      const s = services(pgRepos(orm));
      expect((await s.publish.preview('halka')).pendingContent).toBe(1);
      await s.publish.publish('halka', MARTA);
      expect((await services(pgRepos(orm)).rec.forDish('halka', duck.id, {}, undefined, 'pl'))!.dish.name).toBe('Kaczka A');
    });
  });

  describe('opportunities on PostgreSQL (spec 2026-10-16-sommelier-opportunities)', () => {
    beforeEach(async () => { await resetData(orm); });
    const NOW = Date.parse('2026-10-16T10:00:00.000Z');
    const DAY = 24 * 60 * 60 * 1000;
    const opportunities = (repos: Repositories, at = NOW) => new OpportunityService({ ...repos, clock: { now: () => new Date(at) }, idGenerator: { uuid: () => randomUUID() } });
    const memory = () => opportunities(createMemoryRepositories(MemoryStore.from(ds)));
    const sancerre = `wine_unpaired:${ds.wines.find((w) => w.name === 'Sancerre')!.id}`;
    const keysOf = async (svc: OpportunityService) => (await svc.list('halka', { scope: 'all' }))!.groups.flatMap((g) => g.items.map((o) => o.key));

    it('finds the same opportunities as the memory store on the demo data', async () => {
      const pg = await opportunities(pgRepos(orm)).list('halka', { scope: 'all' }, 'pl');
      const mem = await memory().list('halka', { scope: 'all' }, 'pl');
      expect(pg!.groups.map((g) => [g.dish.id, g.current.map((c) => c.pairingId), g.items])).toEqual(mem!.groups.map((g) => [g.dish.id, g.current.map((c) => c.pairingId), g.items]));
      expect(pg!.groups.length).toBeGreaterThan(0);
    });

    it('ignore, extend and restore through the service; another restaurant sees nothing (AC4, AC5)', async () => {
      await opportunities(pgRepos(orm)).dismiss('halka', sancerre, MARTA);
      expect(await keysOf(opportunities(pgRepos(orm)))).not.toContain(sancerre);
      await opportunities(pgRepos(orm), NOW + 5 * DAY).dismiss('halka', sancerre, TOMASZ);
      const rows = await pgRepos(orm).opportunityDismissalRepository.listActive(ds.restaurant.id, new Date(NOW));
      expect(rows).toEqual([expect.objectContaining({ key: sancerre, dismissedBy: TOMASZ.name, dismissedById: TOMASZ.id, expiresAt: new Date(NOW + 35 * DAY).toISOString() })]);
      expect(await keysOf(opportunities(pgRepos(orm), NOW + 35 * DAY - 1))).not.toContain(sancerre);
      expect(await keysOf(opportunities(pgRepos(orm), NOW + 35 * DAY))).toContain(sancerre);
      expect(await pgRepos(orm).opportunityDismissalRepository.listActive('00000000-0000-4000-8000-000000000000', new Date(NOW))).toEqual([]);
      await opportunities(pgRepos(orm)).restore('halka', sancerre, MARTA);
      expect(await keysOf(opportunities(pgRepos(orm)))).toContain(sancerre);
      await expect(opportunities(pgRepos(orm)).restore('halka', sancerre, MARTA)).rejects.toMatchObject({ code: 'opportunity_not_dismissed' });
      await expect(opportunities(pgRepos(orm)).dismiss('halka', `wine_unpaired:${ds.wines.find((w) => w.name === 'Morgon')!.id}`, MARTA)).rejects.toMatchObject({ code: 'opportunity_stale' });
      expect((await orm.em.getConnection().execute<Array<{ n: string }>>('select count(*)::text as n from opportunity_dismissal'))[0].n).toBe('0');
    });

    it('the database checks the rule name and keeps one row per restaurant and key', async () => {
      const conn = orm.em.getConnection();
      const insert = (id: string, rule: string) => conn.execute(
        'insert into opportunity_dismissal (id, restaurant_id, opportunity_key, rule, dismissed_by, dismissed_at, expires_at) values (?, ?, ?, ?, ?, now(), now())',
        [id, ds.restaurant.id, 'wine_unpaired:x', rule, 'Test']
      );
      await expect(insert(randomUUID(), 'made_up_rule')).rejects.toThrow(/opportunity_dismissal_rule_check/);
      await insert(randomUUID(), 'wine_unpaired');
      await expect(insert(randomUUID(), 'wine_unpaired')).rejects.toThrow(/opportunity_dismissal_restaurant_id_opportunity_key_unique/);
    });

    it('"Add to suggestions" on PostgreSQL ends the opportunity without an unpublished change (AC3)', async () => {
      const s = services(pgRepos(orm));
      const herring = ds.dishes.find((d) => d.name === 'Baltic herring')!;
      const wine = ds.wines.find((w) => w.name === 'Sancerre')!;
      await s.som.addSuggestion('halka', { dishId: herring.id, wineId: wine.id }, MARTA);
      expect((await pgRepos(orm).pairingRepository.listByDish(ds.restaurant.id, herring.id)).find((p) => p.wineId === wine.id)).toMatchObject({ status: 'suggested', updatedBy: MARTA.name, dirty: false });
      expect((await s.publish.preview('halka')).pendingPairings).toBe(0);
      const after = (await opportunities(pgRepos(orm)).list('halka', { scope: 'all' }))!.groups.flatMap((g) => g.items).find((o) => o.key === sancerre);
      expect(after?.dishId).not.toBe(herring.id);
    });

    it('the migration creates the table, and down drops it again (AC6)', async () => {
      const exists = async () => (await orm.em.getConnection().execute<Array<{ n: string }>>("select count(*)::text as n from information_schema.tables where table_name = 'opportunity_dismissal'"))[0].n === '1';
      expect(await exists()).toBe(true);
      const migration = new Migration20261016152214_opportunity_dismissal(orm.em.getDriver(), orm.config);
      const run = async (fn: 'up' | 'down') => {
        migration.reset();
        await migration[fn]();
        for (const q of migration.getQueries()) await migration.execute(q);
      };
      await run('down');
      expect(await exists()).toBe(false);
      await run('up');
      expect(await exists()).toBe(true);
    });
  });
  describe('recommendation codes on PostgreSQL (spec 2026-10-16-recommendation-code, phase 1)', () => {
    beforeEach(async () => { await resetData(orm); });
    const NOW = new Date('2026-10-16T18:00:00.000Z');
    const SID = '3f2b8c1a-9d4e-4a5b-8c6d-7e8f9a0b1c2d';
    const codes = (repos: Repositories, uuid: () => string = () => randomUUID()) =>
      new RecommendationCodeService({ ...repos, clock: { now: () => NOW }, idGenerator: { uuid }, logger: { warn: () => {} } });
    const dish = () => ds.dishes.find((d) => d.status === 'published')!;
    const wine = () => ds.wines.find((w) => w.active && w.glassPrice !== null)!;
    const choice = (over: Record<string, unknown> = {}) =>
      ({ session: { id: SID, isNew: false, source: 'link' as const }, source: 'guest' as const, wineId: wine().id, serving: 'glass' as const, dishIds: [dish().id], tier: 'engine' as const, ...over });
    const count = async () => Number((await orm.em.getConnection().execute<Array<{ n: string }>>('select count(*)::text as n from recommendation_code'))[0].n);

    it('issues one code per choice, also for concurrent requests, and stores the record (AC3, AC5)', async () => {
      const first = await codes(pgRepos(orm)).issue('halka', choice());
      expect(first?.code).toMatch(/^[ACDEFGHJKLMNPRTUVWXY][2-9][ACDEFGHJKLMNPRTUVWXY]$/);
      expect(await codes(pgRepos(orm)).issue('halka', choice())).toEqual(first);
      const [a, b] = await Promise.all([codes(pgRepos(orm)).issue('halka', choice({ serving: 'bottle' })), codes(pgRepos(orm)).issue('halka', choice({ serving: 'bottle' }))]);
      expect(a).toEqual(b);
      expect(await count()).toBe(2);
      const stored = await pgRepos(orm).recommendationCodeRepository.findByCode(ds.restaurant.id, '2026-10-16', first!.code);
      expect(stored).toMatchObject({ sessionId: SID, context: 'dish', dishIds: [dish().id], serving: 'glass', tier: 'engine', menuVersion: expect.any(String), confirmedAt: null });
    });

    it('falls back to four characters when the short code of the day is taken (Q4)', async () => {
      let n = 0;
      const colliding = () => `a1b2c3d4-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`;
      expect((await codes(pgRepos(orm), colliding).issue('halka', choice()))?.code).toBe('C4U');
      expect((await codes(pgRepos(orm), colliding).issue('halka', choice({ serving: 'bottle' })))?.code).toBe('C4U6');
      expect(await codes(pgRepos(orm), colliding).issue('halka', choice({ dishIds: [] }))).toBeNull();
      expect(await count()).toBe(2);
    });

    it('the database checks the enums and keeps one code per restaurant and day', async () => {
      const conn = orm.em.getConnection();
      const insert = (id: string, code: string, session: string, source = 'guest') => conn.execute(
        `insert into recommendation_code (id, restaurant_id, service_day, code, session_id, source, context, wine_id, dish_ids, serving, engine_version, issued_at)
         values (?, ?, '2026-10-16', ?, ?, ?, 'direct', ?, '[]'::jsonb, 'bottle', 'wm-test', now())`,
        [id, ds.restaurant.id, code, session, source, wine().id]
      );
      await expect(insert(randomUUID(), 'W7K', SID, 'waiter')).rejects.toThrow(/recommendation_code_source_check/);
      await insert(randomUUID(), 'W7K', SID);
      await expect(insert(randomUUID(), 'W7K', randomUUID())).rejects.toThrow(/recommendation_code_restaurant_id_service_day_code_unique/);
      await expect(insert(randomUUID(), 'A3C', SID)).rejects.toThrow(/recommendation_code_choice_unique/);
    });

    it('the migration creates the table, and down drops it again (up/down)', async () => {
      const exists = async () => (await orm.em.getConnection().execute<Array<{ n: string }>>("select count(*)::text as n from information_schema.tables where table_name = 'recommendation_code'"))[0].n === '1';
      expect(await exists()).toBe(true);
      const migration = new Migration20261018125821_recommendation_code(orm.em.getDriver(), orm.config);
      const run = async (fn: 'up' | 'down') => {
        migration.reset();
        await migration[fn]();
        for (const q of migration.getQueries()) await migration.execute(q);
      };
      await run('down');
      expect(await exists()).toBe(false);
      await run('up');
      expect(await exists()).toBe(true);
      expect((await codes(pgRepos(orm)).issue('halka', choice()))?.code).toBeTruthy();
    });
  });
  describe('sales import on PostgreSQL (spec 2026-10-15-pos-sales-import-attach-rate, phase 1)', () => {
    beforeEach(async () => { await resetData(orm); });
    const fixture = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))) });
    const TL = actor('tomasz', 'Tomasz Lis');
    const active = async () => Number((await orm.em.getConnection().execute<Array<{ n: string }>>('select count(*)::text as n from sales_record where replaced_at is null'))[0].n);
    const period = { from: '2026-10-01', to: '2026-10-31' };

    it('a real CSV is previewed, confirmed whole checks only, and the same file twice keeps the same active lines (AC1, AC2, AC3)', async () => {
      const s = services(pgRepos(orm));
      const job = await s.imp.upload('halka', 'sales', fixture('sales-pos.csv'), TL);
      expect(job.rows).toHaveLength(13);
      expect(await active()).toBe(0);                                         // nothing before the confirm
      const preview = await services(pgRepos(orm)).imp.salesPreview('halka', job.id);
      expect(preview.summary).toMatchObject({ checks: 6, replacedChecks: 0, from: '2026-10-14', to: '2026-10-15' });
      expect(preview.kpis).toMatchObject({ foodChecks: 5, foodChecksWithWine: 3, attachRate: 0.6 });
      expect(await services(pgRepos(orm)).imp.confirm('halka', job.id, TL)).toEqual({ created: 12, updated: 0, skipped: 1, suggestions: 0, replaced: 0 });
      const repos = pgRepos(orm);
      const before = await repos.salesRepository.checkTotals(ds.restaurant.id, period);
      expect(before).toHaveLength(6);
      expect(await repos.salesRepository.dataRange(ds.restaurant.id)).toEqual({ from: '2026-10-14', to: '2026-10-15' });

      const again = await services(pgRepos(orm)).imp.upload('halka', 'sales', fixture('sales-pos-1250.csv'), TL);
      expect((await services(pgRepos(orm)).imp.salesPreview('halka', again.id)).summary.replacedChecks).toBe(6);
      expect(await services(pgRepos(orm)).imp.confirm('halka', again.id, TL)).toMatchObject({ created: 12, replaced: 6 });
      expect(await active()).toBe(12);
      expect(await pgRepos(orm).salesRepository.checkTotals(ds.restaurant.id, period)).toEqual(before);
      const replaced = await orm.em.getConnection().execute<Array<{ n: string }>>('select count(*)::text as n from sales_record where replaced_by_job_id = ?', [again.id]);
      expect(Number(replaced[0].n)).toBe(12);
    });

    it('nothing from the guest, waiter, payment or item columns reaches the database (AC17, R9)', async () => {
      const s = services(pgRepos(orm));
      const job = await s.imp.upload('halka', 'sales', fixture('sales-pos.xlsx'), TL);
      await s.imp.confirm('halka', job.id, TL, [], [{ field: 'itemType', from: 'Wina białe', to: 'wine_bottle' }]);
      const dump = JSON.stringify(await orm.em.getConnection().execute('select * from sales_record'));
      expect(dump).not.toMatch(/VIP|Ola|Riesling|Danie dnia|Veltliner|130\.14/);
      const jobRows = JSON.stringify(await orm.em.getConnection().execute('select rows, notes from import_job where id = ?', [job.id]));
      expect(jobRows).not.toMatch(/VIP|130\.14/);
      expect(await active()).toBe(61);
    });

    it('two confirms of different jobs with the same checks leave exactly one active set of lines per check (AC12, R8)', async () => {
      const a = services(pgRepos(orm));
      const b = services(pgRepos(orm));
      const ja = await a.imp.upload('halka', 'sales', fixture('sales-pos.csv'), TL);
      const jb = await b.imp.upload('halka', 'sales', fixture('sales-pos.csv'), MARTA);
      const results = await Promise.all([a.imp.confirm('halka', ja.id, TL), b.imp.confirm('halka', jb.id, MARTA)]);
      expect(results.map((r) => r.replaced).sort()).toEqual([0, 6]);
      expect(await active()).toBe(12);
      const perCheck = await orm.em.getConnection().execute<Array<{ jobs: string }>>(
        'select count(distinct import_job_id)::text as jobs from sales_record where replaced_at is null group by business_date, check_id');
      expect(perCheck.every((r) => r.jobs === '1')).toBe(true);
    });

    it('a double click on one job imports once; another restaurant cannot confirm it and sees no sales', async () => {
      const a = services(pgRepos(orm));
      const b = services(pgRepos(orm));
      const job = await a.imp.upload('halka', 'sales', fixture('sales-pos.csv'), TL);
      const results = await Promise.allSettled([a.imp.confirm('halka', job.id, TL), b.imp.confirm('halka', job.id, MARTA)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await active()).toBe(12);
      const other = '99999999-9999-4999-8999-999999999999';
      expect(await pgRepos(orm).salesRepository.checkTotals(other, period)).toEqual([]);
      await expect(pgRepos(orm).importRepository.confirm(other, job.id, { kind: 'sales', records: [], checks: [], result: { created: 0, updated: 0, skipped: 0, suggestions: 0 } }, '2026-10-19T10:00:00.000Z'))
        .rejects.toMatchObject({ code: 'not_found' });
    });

    it('the database checks the item type, a zero quantity and the guests', async () => {
      const s = services(pgRepos(orm));
      const job = await s.imp.upload('halka', 'sales', fixture('sales-pos.csv'), TL);
      const conn = orm.em.getConnection();
      const insert = (itemType: string, quantity: number, covers: number | null) => conn.execute(
        `insert into sales_record (id, restaurant_id, import_job_id, business_date, check_id, covers, item_type, quantity, net_amount, created_at)
         values (?, ?, ?, '2026-10-14', 'x', ?, ?, ?, 10, now())`, [randomUUID(), ds.restaurant.id, job.id, covers, itemType, quantity]);
      await expect(insert('beer', 1, null)).rejects.toThrow(/sales_record_item_type_check/);
      await expect(insert('food', 0, null)).rejects.toThrow(/sales_record_quantity_check/);
      await expect(insert('food', 1, 1000)).rejects.toThrow(/sales_record_covers_check/);
      await insert('food', -1, 0);
    });

    it('the covers check accepts 0 and 999 and rejects -1 and 1000 (sales_record_covers_check)', async () => {
      const s = services(pgRepos(orm));
      const job = await s.imp.upload('halka', 'sales', fixture('sales-pos.csv'), TL);
      const conn = orm.em.getConnection();
      const insert = (covers: number) => conn.execute(
        `insert into sales_record (id, restaurant_id, import_job_id, business_date, check_id, covers, item_type, quantity, net_amount, created_at)
         values (?, ?, ?, '2026-10-14', 'covers', ?, 'food', 1, 10, now())`, [randomUUID(), ds.restaurant.id, job.id, covers]);
      await expect(insert(-1)).rejects.toThrow(/sales_record_covers_check/);
      await expect(insert(1000)).rejects.toThrow(/sales_record_covers_check/);
      await insert(0);
      await insert(999);
      expect(Number((await conn.execute<Array<{ n: string }>>("select count(*)::text as n from sales_record where check_id = 'covers'"))[0].n)).toBe(2);
    });

    it('the migration creates the table with its index, and down drops it again (AC6, up/down)', async () => {
      const exists = async () => (await orm.em.getConnection().execute<Array<{ n: string }>>("select count(*)::text as n from information_schema.tables where table_name = 'sales_record'"))[0].n === '1';
      const index = await orm.em.getConnection().execute<Array<{ indexdef: string }>>("select indexdef from pg_indexes where tablename = 'sales_record' and indexname = 'sales_record_restaurant_id_business_date_check_id_index'");
      expect(index[0].indexdef).toMatch(/\(restaurant_id, business_date, check_id\)/);
      const migration = new Migration20261019064652_sales_record(orm.em.getDriver(), orm.config);
      const run = async (fn: 'up' | 'down') => {
        migration.reset();
        await migration[fn]();
        for (const q of migration.getQueries()) await migration.execute(q);
      };
      await run('down');
      expect(await exists()).toBe(false);
      await run('up');
      expect(await exists()).toBe(true);
      // the later migration (recommendation code on a line) adds its column and index back on top of the table
      const later = new Migration20261021190119_sales_record_recommendation_code(orm.em.getDriver(), orm.config);
      later.reset();
      await later.up();
      for (const q of later.getQueries()) await later.execute(q);
      const s = services(pgRepos(orm));
      const job = await s.imp.upload('halka', 'sales', fixture('sales-pos.csv'), TL);
      expect((await s.imp.confirm('halka', job.id, TL)).created).toBe(12);
    });
  });

  describe('recommendation code on a sales line on PostgreSQL (spec 2026-10-16-recommendation-code, phase 3, migration up/down)', () => {
    // its own database: the migration is run down and up here, which must not touch the shared one
    let own: MikroORM;
    beforeAll(async () => { own = await freshDatabase('winematch_db_recode_test'); });
    afterAll(async () => { await own?.close(true); });

    const TL = actor('tomasz', 'Tomasz Lis');
    const fixture = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))) });
    const period = { from: '2026-10-01', to: '2026-10-31' };
    const column = async () => own.em.getConnection().execute<Array<{ is_nullable: string; column_default: string | null; data_type: string; character_maximum_length: number }>>(
      "select is_nullable, column_default, data_type, character_maximum_length from information_schema.columns where table_name = 'sales_record' and column_name = 'recommendation_code'");
    const index = async () => own.em.getConnection().execute<Array<{ indexdef: string }>>(
      "select indexdef from pg_indexes where tablename = 'sales_record' and indexname = 'sales_record_recommendation_code_idx'");
    const lines = async () => (await own.em.getConnection().execute<Array<{ n: string }>>(
      'select count(*)::text as n from sales_record where replaced_at is null'))[0].n;
    const coded = async () => (await own.em.getConnection().execute<Array<{ n: string }>>(
      'select count(recommendation_code)::text as n from sales_record where replaced_at is null'))[0].n;

    it('up adds a nullable column with no default and a partial index, down removes both, and up keeps the existing lines (up/down)', async () => {
      const migration = new Migration20261021190119_sales_record_recommendation_code(own.em.getDriver(), own.config);
      const run = async (fn: 'up' | 'down') => {
        migration.reset();
        await migration[fn]();
        for (const q of migration.getQueries()) await migration.execute(q);
      };
      const shape = { is_nullable: 'YES', column_default: null, data_type: 'character varying', character_maximum_length: 4 };

      // the database is migrated to the head: the column and the partial index exist
      expect(await column()).toEqual([shape]);
      expect((await index())[0].indexdef).toMatch(/\(restaurant_id, business_date, recommendation_code\) WHERE \(recommendation_code IS NOT NULL\)/i);

      // existing sales lines (the import writes the column, so it is imported while the column is there)
      const s = services(pgRepos(own));
      const job = await s.imp.upload('halka', 'sales', fixture('sales-pos.csv'), TL);
      expect((await s.imp.confirm('halka', job.id, TL)).created).toBe(12);
      const before = await pgRepos(own).salesRepository.checkTotals(ds.restaurant.id, period);
      expect(before).toHaveLength(6);

      // down removes the column and the index; the existing lines stay
      await run('down');
      expect(await column()).toEqual([]);
      expect(await index()).toEqual([]);
      expect(await lines()).toBe('12');

      // up on those rows: the column comes back nullable without a default, the index too, the lines stay as they were
      await run('up');
      expect(await column()).toEqual([shape]);
      expect((await index())[0].indexdef).toMatch(/WHERE \(recommendation_code IS NOT NULL\)/i);
      expect(await lines()).toBe('12');
      expect(await coded()).toBe('0');
      expect(await pgRepos(own).salesRepository.checkTotals(ds.restaurant.id, period)).toEqual(before);

      // and down again removes both once more
      await run('down');
      expect(await column()).toEqual([]);
      expect(await index()).toEqual([]);
      await run('up');
      expect(await column()).toEqual([shape]);
    });
  });
  describe('team on PostgreSQL (spec E12 F1: concurrency, rollback, migration)', () => {
    beforeEach(async () => { await resetData(orm); });
    const teamOf = () => new PgTeamRepository({ em: orm.em.fork() });
    const ev = (second: SecondRestaurant, subject: string, n: number, actor = second.owner1.userId): AuthEvent => ({
      id: `5ec0d000-0000-4000-8000-${String(700_000_000_000 + n)}`, restaurantId: second.restaurantId, actorUserId: actor, subjectUserId: subject, type: 'role_changed', meta: {}, at: '2026-11-05T10:00:00.000Z'
    });
    const activeOwners = async (second: SecondRestaurant) => (await teamOf().list(second.restaurantId)).filter((m) => m.role === 'owner' && m.status === 'active');

    it('two owners demoting each other at the same moment: one succeeds, the other is refused with last_owner, an owner stays (AC23, two connections)', async () => {
      for (let round = 0; round < 8; round++) {
        await resetData(orm);
        const second = await seedSecondRestaurant(orm);
        const a = new PgTeamRepository({ em: orm.em.fork() });
        const b = new PgTeamRepository({ em: orm.em.fork() });
        const results = await Promise.allSettled([
          a.applyChange(second.restaurantId, second.owner1.membershipId, { expectedVersion: 1, set: { role: 'manager' }, actorUserId: second.owner2.userId, at: '2026-11-05T10:00:00.000Z', events: [ev(second, second.owner1.userId, round * 2 + 1, second.owner2.userId)] }),
          b.applyChange(second.restaurantId, second.owner2.membershipId, { expectedVersion: 1, set: round % 2 ? { status: 'deactivated' } : { role: 'sommelier' }, actorUserId: second.owner1.userId, at: '2026-11-05T10:00:00.000Z', events: [ev(second, second.owner2.userId, round * 2 + 2, second.owner1.userId)] })
        ]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
        expect(refused.reason).toMatchObject({ name: 'LastOwnerError', code: 'last_owner' });
        expect(await activeOwners(second)).toHaveLength(1);
        // and exactly one event was written: the refused change left no trace
        expect(await new PgAuthAuditRepository({ em: orm.em.fork() }).list(second.restaurantId)).toHaveLength(1);
      }
    });

    it('two sessions change the same person with the same version: one wins, the other gets version_conflict (AC4)', async () => {
      const second = await seedSecondRestaurant(orm);
      const results = await Promise.allSettled([
        teamOf().applyChange(second.restaurantId, second.sommelier.membershipId, { expectedVersion: 1, set: { role: 'waiter' }, actorUserId: second.owner1.userId, at: '2026-11-05T10:00:00.000Z', events: [ev(second, second.sommelier.userId, 101, second.owner1.userId)] }),
        teamOf().applyChange(second.restaurantId, second.sommelier.membershipId, { expectedVersion: 1, set: { role: 'manager' }, actorUserId: second.owner2.userId, at: '2026-11-05T10:00:00.000Z', events: [ev(second, second.sommelier.userId, 102, second.owner2.userId)] })
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'version_conflict' });
      expect((await teamOf().find(second.restaurantId, second.sommelier.membershipId))!.version).toBe(2);
    });

    it('a second event the database refuses rolls the change back, including the first event: no new role, no new version, no event (AC5)', async () => {
      const second = await seedSecondRestaurant(orm);
      const existing = ev(second, second.manager.userId, 201);
      await new PgAuthAuditRepository({ em: orm.em.fork() }).record(second.restaurantId, existing);
      // two events for one change: the first is fine, the second repeats the id of a stored event, so the table refuses it
      const fresh = ev(second, second.sommelier.userId, 202);
      await expect(teamOf().applyChange(second.restaurantId, second.sommelier.membershipId, { expectedVersion: 1, set: { role: 'waiter' }, actorUserId: second.owner1.userId, at: fresh.at, events: [fresh, { ...existing, subjectUserId: second.sommelier.userId }] })).rejects.toBeInstanceOf(Error);
      expect(await teamOf().find(second.restaurantId, second.sommelier.membershipId)).toMatchObject({ role: 'sommelier', version: 1, status: 'active' });
      const n = await orm.em.getConnection().execute<Array<{ n: string }>>('select count(*)::text as n from auth_event');
      expect(n[0].n).toBe('1');
    });

    it('an actor deactivated while the change waits for the lock is refused inside the transaction, and the change is not applied (TOCTOU, two connections)', async () => {
      for (let round = 0; round < 8; round++) {
        await resetData(orm);
        const second = await seedSecondRestaurant(orm);
        const results = await Promise.allSettled([
          // owner1 removes owner2's access ...
          teamOf().applyChange(second.restaurantId, second.owner2.membershipId, { expectedVersion: 1, set: { status: 'deactivated' }, actorUserId: second.owner1.userId, at: '2026-11-05T10:00:00.000Z', events: [{ ...ev(second, second.owner2.userId, round * 10 + 1), type: 'member_deactivated' }] }),
          // ... while owner2, who passed the service's check a moment ago, removes the sommelier's
          teamOf().applyChange(second.restaurantId, second.sommelier.membershipId, { expectedVersion: 1, set: { status: 'deactivated' }, actorUserId: second.owner2.userId, at: '2026-11-05T10:00:00.000Z', events: [{ ...ev(second, second.sommelier.userId, round * 10 + 2, second.owner2.userId), type: 'member_deactivated' }] })
        ]);
        expect(results[0].status).toBe('fulfilled');
        const sommelier = await teamOf().find(second.restaurantId, second.sommelier.membershipId);
        if (results[1].status === 'rejected') {
          // owner2 lost the race: the refusal is the actor check, and nothing of its change is left
          expect((results[1] as PromiseRejectedResult).reason).toMatchObject({ name: 'ForbiddenError' });
          expect(sommelier).toMatchObject({ status: 'active', version: 1 });
        } else {
          // owner2 won: the sommelier is deactivated by an actor who was still active at that moment
          expect(sommelier).toMatchObject({ status: 'deactivated', version: 2, deactivatedBy: second.owner2.userId });
        }
      }
    });

    it('a deactivated person keeps the session but has no restaurant on the next request, and gets it back after reactivation, through the real services (AC2)', async () => {
      const second = await seedSecondRestaurant(orm);
      const repos = pgRepos(orm);
      const clock = { now: () => new Date('2026-11-05T10:00:00.000Z') };
      let seq = 0;
      const idGenerator = { uuid: () => `5ec0d000-0000-4000-8000-${String(600_000_000_000 + ++seq)}` };
      const team = new TeamService({ ...repos, clock, idGenerator });
      const tokens = new NodeSessionTokens();
      const auth = new AuthService({ authRepository: new PgAuthRepository({ em: orm.em.fork() }), passwordHasher: await ScryptPasswordHasher.create(), sessionTokens: tokens, clock, idGenerator, authConfig: DEFAULT_AUTH_CONFIG });
      const { token, hash } = tokens.generate();
      await new PgAuthRepository({ em: orm.em.fork() }).createSession({ id: idGenerator.uuid(), userId: second.manager.userId, tokenHash: hash, csrfToken: 'd'.repeat(64), createdAt: '2026-11-05T09:00:00.000Z', expiresAt: '2026-11-05T21:00:00.000Z' });
      const roles = async () => (await auth.authenticate(token))!.memberships.map((m) => m.role);
      const owner = { id: second.owner1.userId, name: 'First Owner' };
      expect(await roles()).toEqual(['manager']);
      await team.deactivate(SECOND_RESTAURANT.slug, second.manager.membershipId, owner, 1);
      expect(await roles()).toEqual([]);
      await team.reactivate(SECOND_RESTAURANT.slug, second.manager.membershipId, owner, 2);
      expect(await roles()).toEqual(['manager']);
    });

    it('the migration adds the columns and the table, and down removes them again (AC22 up/down)', async () => {
      const second = await seedSecondRestaurant(orm);
      await teamOf().applyChange(second.restaurantId, second.sommelier.membershipId, { expectedVersion: 1, set: { status: 'deactivated' }, actorUserId: second.owner1.userId, at: '2026-11-05T10:00:00.000Z', events: [ev(second, second.sommelier.userId, 301, second.owner1.userId)] });
      const conn = orm.em.getConnection();
      const columns = async () => (await conn.execute<Array<{ column_name: string }>>("select column_name from information_schema.columns where table_name = 'membership' and column_name in ('status', 'version', 'deactivated_at', 'deactivated_by') order by column_name")).map((c) => c.column_name);
      const tableExists = async () => (await conn.execute<Array<{ n: string }>>("select count(*)::text as n from information_schema.tables where table_name = 'auth_event'"))[0].n === '1';
      expect(await columns()).toEqual(['deactivated_at', 'deactivated_by', 'status', 'version']);
      expect(await tableExists()).toBe(true);
      const migration = new Migration20261105160730_team_status_and_auth_event(orm.em.getDriver(), orm.config);
      const run = async (fn: 'up' | 'down') => {
        migration.reset();
        await migration[fn]();
        for (const q of migration.getQueries()) await migration.execute(q);
      };
      await run('down');
      expect(await columns()).toEqual([]);
      expect(await tableExists()).toBe(false);
      // the memberships stay; up gives them the defaults again (active, version 1)
      await run('up');
      expect(await columns()).toEqual(['deactivated_at', 'deactivated_by', 'status', 'version']);
      expect(await tableExists()).toBe(true);
      const rows = await conn.execute<Array<{ status: string; version: number }>>("select distinct status, version from membership");
      expect(rows).toEqual([{ status: 'active', version: 1 }]);
      // the status check and the type check are back
      await expect(conn.execute("update membership set status = 'gone'")).rejects.toThrow(/membership_status_check/);
      await expect(conn.execute("insert into auth_event (id, type, at) values ('5ec0d000-0000-4000-8000-000000000999', 'nonsense', now())")).rejects.toThrow(/auth_event_type_check/);
    });
  });
  describe('invitations on PostgreSQL (spec E12 F2: hash only, concurrency, constraints, migration)', () => {
    beforeEach(async () => { await resetData(orm); });
    const tokens = new NodeSessionTokens();
    let seq = 0;
    const ids = () => `5ec0d000-0000-4000-8000-${String(500_000_000_000 + ++seq)}`;
    /** The services over a fresh connection each, like two requests; the real token generator, so the hash is the real one. */
    const invitationsOf = () => {
      const em = orm.em.fork();
      const repos = { restaurantRepository: new PgRestaurantRepository({ em }), teamRepository: new PgTeamRepository({ em }), invitationRepository: new PgInvitationRepository({ em }) };
      return new InvitationService({
        ...repos, authRepository: new PgAuthRepository({ em }), passwordHasher: { hash: async (p) => `scrypt$test-only$${p.length}` }, sessionTokens: tokens,
        clock: { now: () => new Date() }, idGenerator: { uuid: ids }
      });
    };
    const owner = (second: SecondRestaurant) => ({ id: second.owner1.userId, name: second.owner1.name });
    const sql = <T>(query: string, params: unknown[] = []) => orm.em.getConnection().execute<T[]>(query, params);

    it('stores only the SHA-256 of the link\'s token, the e-mail in lower case, and nothing the token could be read back from (AC7)', async () => {
      const second = await seedSecondRestaurant(orm);
      const issued = await invitationsOf().invite(SECOND_RESTAURANT.slug, { email: 'Hash.Check@Example.test', role: 'sommelier' }, owner(second));
      const rows = await sql<Record<string, unknown>>('select * from auth_token');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: 'invite', token_hash: tokens.hash(issued.token), email: 'hash.check@example.test', role: 'sommelier', used_at: null, revoked_at: null });
      expect(String(rows[0].token_hash)).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(rows)).not.toContain(issued.token);
      // nor does the audit trail carry the token or the address
      const events = await sql<Record<string, unknown>>("select * from auth_event where type = 'invite_created'");
      expect(JSON.stringify(events)).not.toContain(issued.token);
      expect(JSON.stringify(events)).not.toContain('example.test');
    });

    it('two accepts of one link at the same moment, on two connections: one account and one membership, the other gets the dead-link answer (AC24)', async () => {
      const second = await seedSecondRestaurant(orm);
      for (let round = 0; round < 8; round++) {
        const issued = await invitationsOf().invite(SECOND_RESTAURANT.slug, { email: `race${round}@example.test`, role: 'sommelier' }, owner(second));
        const results = await Promise.allSettled([
          invitationsOf().accept({ token: issued.token, name: 'First', password: 'a-long-enough-passphrase' }, null),
          invitationsOf().accept({ token: issued.token, name: 'Second', password: 'a-long-enough-passphrase' }, null)
        ]);
        expect(results.filter((r) => r.status === 'fulfilled'), `round ${round}`).toHaveLength(1);
        const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
        expect(lost.reason, `round ${round}`).toMatchObject({ name: 'InvalidTokenError', code: 'invalid_token' });
        expect(await sql(`select 1 from app_user where email = 'race${round}@example.test'`)).toHaveLength(1);
        expect(await sql(`select 1 from membership m join app_user u on u.id = m.user_id where u.email = 'race${round}@example.test'`)).toHaveLength(1);
        expect(await sql("select 1 from auth_event where type = 'invite_accepted' and meta->>'invitation_id' = ?", [issued.invitation.id])).toHaveLength(1);
      }
    });

    it('a person who got a membership by other means gets already_member, the transaction rolls back and the link stays unused', async () => {
      const second = await seedSecondRestaurant(orm);
      const marta = ds.users.find((u) => u.key === 'marta')!;
      const issued = await invitationsOf().invite(SECOND_RESTAURANT.slug, { email: marta.email, role: 'manager' }, owner(second));
      await sql(`insert into membership (id, user_id, restaurant_id, role, created_at) values (?, ?, ?, 'waiter', now())`, [ids(), marta.id, second.restaurantId]);
      await expect(invitationsOf().accept({ token: issued.token }, { userId: marta.id, email: marta.email })).rejects.toMatchObject({ name: 'AlreadyMemberError', code: 'already_member' });
      expect(await sql('select used_at from auth_token where id = ?', [issued.invitation.id])).toEqual([{ used_at: null }]);
      expect(await sql("select 1 from auth_event where type = 'invite_accepted'")).toHaveLength(0);
      expect((await sql<{ role: string }>('select role from membership where user_id = ? and restaurant_id = ?', [marta.id, second.restaurantId]))[0].role).toBe('waiter');
    });

    it('an account created for the same e-mail between the page and the post is refused with account_exists and rolls back, link unused', async () => {
      const second = await seedSecondRestaurant(orm);
      const issued = await invitationsOf().invite(SECOND_RESTAURANT.slug, { email: 'twin@example.test', role: 'sommelier' }, owner(second));
      const repo = new PgInvitationRepository({ em: orm.em.fork() });
      await sql(`insert into app_user (id, email, name, password_hash, created_at) values (?, 'twin@example.test', 'Twin', 'scrypt$x', now())`, [ids()]);
      await expect(repo.accept({ tokenHash: tokens.hash(issued.token), now: new Date().toISOString(), membershipId: ids(), eventId: ids(), newAccount: { userId: ids(), name: 'Twin 2', passwordHash: 'scrypt$y' }, existingUserId: null }))
        .rejects.toMatchObject({ code: 'account_exists' });
      expect(await sql('select used_at from auth_token where id = ?', [issued.invitation.id])).toEqual([{ used_at: null }]);
    });

    it('the database itself refuses a second pending invitation for one e-mail, an invitation without a restaurant or for a waiter', async () => {
      const second = await seedSecondRestaurant(orm);
      const insert = (over: { id?: string; hash?: string; restaurant?: string | null; email?: string; role?: string | null; used?: boolean } = {}) => sql(
        `insert into auth_token (id, kind, token_hash, restaurant_id, email, role, created_by, created_at, expires_at, used_at) values (?, 'invite', ?, ?, ?, ?, ?, now(), now() + interval '1 hour', ${over.used ? 'now()' : 'null'})`,
        [over.id ?? ids(), over.hash ?? seq.toString(16).padStart(64, 'a'), over.restaurant === undefined ? second.restaurantId : over.restaurant, over.email ?? 'one@example.test', over.role === undefined ? 'sommelier' : over.role, second.owner1.userId]
      );
      await insert({ hash: '1'.repeat(64) });
      await expect(insert({ hash: '2'.repeat(64) })).rejects.toThrow(/auth_token_pending_invite_unique/);
      await insert({ hash: '3'.repeat(64), used: true });                       // a used one does not count
      await expect(insert({ hash: '4'.repeat(64), email: 'two@example.test', role: 'waiter' })).rejects.toThrow(/auth_token_invite_shape_check/);
      await expect(insert({ hash: '5'.repeat(64), email: 'three@example.test', restaurant: null })).rejects.toThrow(/auth_token_invite_shape_check/);
      await expect(insert({ hash: '1'.repeat(64), email: 'four@example.test' })).rejects.toThrow(/auth_token_token_hash_unique/);
    });

    it('the F2 migration stops with a readable message when a restaurant already has accept, reset or account as its slug, and changes nothing (AC25)', async () => {
      const conn = orm.em.getConnection();
      const tableExists = async () => (await conn.execute<Array<{ n: string }>>("select count(*)::text as n from information_schema.tables where table_name = 'auth_token'"))[0].n === '1';
      const migration = new Migration20261106114659_auth_token(orm.em.getDriver(), orm.config);
      const run = async (fn: 'up' | 'down') => {
        migration.reset();
        await migration[fn]();
        for (const q of migration.getQueries()) await migration.execute(q);
      };
      expect(await tableExists()).toBe(true);
      await run('down');
      expect(await tableExists()).toBe(false);
      try {
        for (const slug of ['accept', 'reset', 'account']) {
          const em = orm.em.fork();
          em.create(RestaurantEntity, { id: ids(), slug, name: `Clash ${slug}`, tagline: '', address: 'x', city: 'y', wineDirector: 'z', status: 'active', settings: { showUnreviewed: true, showScores: true } });
          await em.flush();
          await expect(run('up'), slug).rejects.toThrow(new RegExp(`stopped: a restaurant already uses a slug that is now reserved.*\\(${slug}\\).*Rename it first.*Nothing was changed`));
          expect(await tableExists(), slug).toBe(false);
          await conn.execute('delete from restaurant where slug = ?', [slug]);
        }
        // no clash: the migration applies, the table is back with its constraints
        await run('up');
        expect(await tableExists()).toBe(true);
      } finally {
        await conn.execute("delete from restaurant where slug in ('accept', 'reset', 'account')");
        if (!(await tableExists())) await run('up');
      }
      expect(await tableExists()).toBe(true);
    });
  });
  describe('invitations on PostgreSQL, review fixes (platform flag, re-check at use, races, e-mail case)', () => {
    beforeEach(async () => { await resetData(orm); });
    const tokens = new NodeSessionTokens();
    let seq = 0;
    const ids = () => `5ec0d000-0000-4000-8000-${String(400_000_000_000 + ++seq)}`;
    const invitationsOf = () => {
      const em = orm.em.fork();
      const repos = { restaurantRepository: new PgRestaurantRepository({ em }), teamRepository: new PgTeamRepository({ em }), invitationRepository: new PgInvitationRepository({ em }) };
      return new InvitationService({
        ...repos, authRepository: new PgAuthRepository({ em }), passwordHasher: { hash: async (p) => `scrypt$test-only$${p.length}` }, sessionTokens: tokens,
        clock: { now: () => new Date() }, idGenerator: { uuid: ids }
      });
    };
    const sql = <T>(query: string, params: unknown[] = []) => orm.em.getConnection().execute<T[]>(query, params);
    const platform = { id: '5ec0d000-0000-4000-8000-0000000000aa', name: 'Platform Admin', isStaff: true };
    const PASSWORD = 'a-long-enough-passphrase';
    const accept = (token: string) => invitationsOf().accept({ token, name: 'Someone', password: PASSWORD }, null);

    it('marks only inviteOwner invitations as platform; a regular inviter whose membership row is gone leaves a dead link, a platform invitation stays valid (major 1)', async () => {
      const second = await seedSecondRestaurant(orm);
      const regular = await invitationsOf().invite(SECOND_RESTAURANT.slug, { email: 'gone@example.test', role: 'owner' }, { id: second.owner1.userId, name: 'First Owner' });
      const founder = await invitationsOf().inviteOwner(platform, ds.restaurant.id, 'founder@halka.test');
      expect(await sql('select email, platform from auth_token order by email')).toEqual([{ email: 'founder@halka.test', platform: true }, { email: 'gone@example.test', platform: false }]);
      await sql('delete from membership where id = ?', [second.owner1.membershipId]);
      const repo = new PgInvitationRepository({ em: orm.em.fork() });
      expect(await repo.findUsable(tokens.hash(regular.token), new Date().toISOString())).toBeNull();
      await expect(accept(regular.token)).rejects.toMatchObject({ name: 'InvalidTokenError' });
      expect(await sql("select 1 from app_user where email = 'gone@example.test'")).toHaveLength(0);
      expect(await repo.findUsable(tokens.hash(founder.token), new Date().toISOString())).toMatchObject({ role: 'owner', restaurantSlug: 'halka' });
    });

    it('a platform owner invitation is re-checked at use: dead once the restaurant has an active owner, alive again if that owner is deactivated (major 2)', async () => {
      const issued = await invitationsOf().inviteOwner(platform, ds.restaurant.id, 'late@halka.test');
      const userId = ids(); const membershipId = ids();
      await sql(`insert into app_user (id, email, name, password_hash, created_at) values (?, 'operator@halka.test', 'Op', 'scrypt$x', now())`, [userId]);
      await sql(`insert into membership (id, user_id, restaurant_id, role, created_at) values (?, ?, ?, 'owner', now())`, [membershipId, userId, ds.restaurant.id]);
      const repo = new PgInvitationRepository({ em: orm.em.fork() });
      expect(await repo.findUsable(tokens.hash(issued.token), new Date().toISOString())).toBeNull();
      await expect(accept(issued.token)).rejects.toMatchObject({ name: 'InvalidTokenError', code: 'invalid_token' });
      expect(await sql("select 1 from app_user where email = 'late@halka.test'")).toHaveLength(0);
      await sql("update membership set status = 'deactivated' where id = ?", [membershipId]);
      expect((await accept(issued.token)).role).toBe('owner');
    });

    it('one rule for a platform account that is also a team manager: refused when made and when used (major 2)', async () => {
      const issued = await invitationsOf().inviteOwner(platform, ds.restaurant.id, 'same@halka.test');
      await sql(`insert into app_user (id, email, name, password_hash, created_at) values (?, 'platform@example.test', 'Platform', 'scrypt$x', now())`, [platform.id]);
      await sql(`insert into membership (id, user_id, restaurant_id, role, created_at) values (?, ?, ?, 'manager', now())`, [ids(), platform.id, ds.restaurant.id]);
      await expect(invitationsOf().inviteOwner(platform, ds.restaurant.id, 'other@halka.test')).rejects.toMatchObject({ name: 'ForbiddenError' });
      expect(await new PgInvitationRepository({ em: orm.em.fork() }).findUsable(tokens.hash(issued.token), new Date().toISOString())).toBeNull();
      await expect(accept(issued.token)).rejects.toMatchObject({ name: 'InvalidTokenError' });
    });

    it('two platform links for one restaurant used at the same moment make ONE owner, never two (restaurant row lock)', async () => {
      for (let round = 0; round < 6; round++) {
        await resetData(orm);
        const a = await invitationsOf().inviteOwner(platform, ds.restaurant.id, `a${round}@halka.test`);
        const b = await invitationsOf().inviteOwner(platform, ds.restaurant.id, `b${round}@halka.test`);
        const results = await Promise.allSettled([accept(a.token), accept(b.token)]);
        expect(results.filter((r) => r.status === 'fulfilled'), `round ${round}`).toHaveLength(1);
        expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ name: 'InvalidTokenError' });
        expect(await sql("select 1 from membership where restaurant_id = ? and role = 'owner'", [ds.restaurant.id])).toHaveLength(1);
      }
    });

    it('an accept racing with a revoke: either the account exists and the revoke is "not found", or the link is dead and nothing exists, never both (two connections)', async () => {
      const second = await seedSecondRestaurant(orm);
      const owner = { id: second.owner1.userId, name: 'First Owner' };
      const outcomes = new Set<string>();
      for (let round = 0; round < 12; round++) {
        const issued = await invitationsOf().invite(SECOND_RESTAURANT.slug, { email: `rev${round}@example.test`, role: 'sommelier' }, owner);
        const [accepted, revoked] = await Promise.allSettled([accept(issued.token), invitationsOf().revoke(SECOND_RESTAURANT.slug, issued.invitation.id, owner)]);
        const accounts = (await sql(`select 1 from app_user where email = 'rev${round}@example.test'`)).length;
        if (accepted.status === 'fulfilled') {
          outcomes.add('accepted first');
          expect(accounts).toBe(1);
          expect(revoked.status).toBe('rejected');
          expect((revoked as PromiseRejectedResult).reason).toMatchObject({ name: 'NotFoundError' });
        } else {
          outcomes.add('revoked first');
          expect(accounts).toBe(0);
          expect(revoked.status).toBe('fulfilled');
          expect((accepted as PromiseRejectedResult).reason).toMatchObject({ name: 'InvalidTokenError' });
        }
      }
      expect(outcomes.size).toBeGreaterThan(0);
    });

    it('an accept racing with the inviter\'s deactivation: the link is used before it, or it is dead; a link is never used after the deactivation committed (two connections)', async () => {
      for (let round = 0; round < 12; round++) {
        await resetData(orm);
        const second = await seedSecondRestaurant(orm);
        const manager = { id: second.manager.userId, name: 'The Manager' };
        const issued = await invitationsOf().invite(SECOND_RESTAURANT.slug, { email: `dea${round}@example.test`, role: 'sommelier' }, manager);
        const em = orm.em.fork();
        const deactivate = new PgTeamRepository({ em }).applyChange(second.restaurantId, second.manager.membershipId, {
          expectedVersion: 1, set: { status: 'deactivated' }, actorUserId: second.owner1.userId, at: new Date().toISOString(),
          events: [{ id: ids(), restaurantId: second.restaurantId, actorUserId: second.owner1.userId, subjectUserId: second.manager.userId, type: 'member_deactivated', meta: {}, at: new Date().toISOString() }]
        });
        const [accepted, deactivated] = await Promise.allSettled([accept(issued.token), deactivate]);
        expect(deactivated.status, `round ${round}`).toBe('fulfilled');
        if (accepted.status === 'rejected') expect(accepted.reason).toMatchObject({ name: 'InvalidTokenError' });
        // after both are done the deactivation holds, so the link is dead for anyone still holding it; if the accept won, the account exists exactly once
        const accounts = (await sql(`select 1 from app_user where email = 'dea${round}@example.test'`)).length;
        expect(accounts).toBe(accepted.status === 'fulfilled' ? 1 : 0);
        expect(await new PgInvitationRepository({ em: orm.em.fork() }).findUsable(tokens.hash(issued.token), new Date().toISOString())).toBeNull();
      }
    });

    it('e-mail case: an account stored in mixed case counts as a member and as an existing account, on both sides of the comparison (minor 8)', async () => {
      const second = await seedSecondRestaurant(orm);
      const owner = { id: second.owner1.userId, name: 'First Owner' };
      const memberId = ids(); const otherId = ids();
      await sql(`insert into app_user (id, email, name, password_hash, created_at) values (?, 'Legacy.Member@Example.test', 'L', 'scrypt$x', now()), (?, 'Legacy.Other@Example.test', 'L2', 'scrypt$x', now())`, [memberId, otherId]);
      await sql(`insert into membership (id, user_id, restaurant_id, role, created_at) values (?, ?, ?, 'sommelier', now())`, [ids(), memberId, second.restaurantId]);
      await expect(invitationsOf().invite(SECOND_RESTAURANT.slug, { email: 'legacy.member@example.test', role: 'sommelier' }, owner)).rejects.toMatchObject({ name: 'AlreadyMemberError' });
      const issued = await invitationsOf().invite(SECOND_RESTAURANT.slug, { email: 'legacy.other@example.test', role: 'sommelier' }, owner);
      await expect(accept(issued.token)).rejects.toMatchObject({ code: 'account_exists' });
      expect(await sql("select 1 from app_user where lower(email) = 'legacy.other@example.test'")).toHaveLength(1);
      // the repository, given that user as the existing account, accepts (the comparison lowers the stored side)
      const got = await new PgInvitationRepository({ em: orm.em.fork() }).accept({ tokenHash: tokens.hash(issued.token), now: new Date().toISOString(), membershipId: ids(), eventId: ids(), newAccount: null, existingUserId: otherId });
      expect(got).toMatchObject({ userId: otherId, role: 'sommelier' });
    });
  });
});
