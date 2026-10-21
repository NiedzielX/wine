import { Migrator } from '@mikro-orm/migrations';
import { MikroORM } from '@mikro-orm/postgresql';
import {
  AdminService, AuthService, RecommendationCodeService, DEFAULT_AUTH_CONFIG, DEMO_PASSWORD, DEFAULT_PREFS, ImportService, OpportunityService, RestaurantService, TranslationService, authContract, translationsVersion, importContract, RecommendationService, PublishService, SommelierService, VersionConflictError, buildDemoDataset,
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
import { PairingEntity } from '../src/entities';
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
async function freshDatabase(): Promise<MikroORM> {
  const url = new URL(await createDatabase(baseUrl, 'winematch_db_test'));
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
  await orm.em.getConnection().execute('truncate table sales_record, session, membership, app_user, opportunity_dismissal, recommendation_code, sommelier_decision, published_version, pairing, wine, dish, guest_interaction, import_job, restaurant restart identity cascade');
  await new DemoSeeder().run(orm.em.fork());
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
    salesRepository: new PgSalesRepository({ em })
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
});
