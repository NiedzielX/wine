import { asClass, asFunction, asValue, createContainer, InjectionMode, type AwilixContainer } from 'awilix';
import type { DbCradle } from '@wine-match/db';
import { randomUUID } from 'node:crypto';
import {
  AdminService, AuthService, CatalogService, DEFAULT_AUTH_CONFIG, ImportService, MemoryAuthRepository, RestaurantService, MemoryStore, PublishService, RecommendationService,
  SommelierService, buildDemoDataset, createMemoryRepositories, type AuthConfig, type AuthRepository, type Clock, type IdGenerator, type ImportFileParser,
  type PasswordHasher, type Repositories, type SessionTokens
} from '@wine-match/core';
import { NodeSessionTokens, ScryptPasswordHasher } from '@wine-match/db/auth';
import { env } from './env';

/**
 * Composition root (the only place that knows concrete implementations).
 *
 * Lifetimes:
 *  - singleton: ORM / connection pool, memory store
 *  - scoped:    EntityManager fork, repositories, services — one set per request
 *
 * DATA_SOURCE=memory (default) uses the Halka demo data; DATA_SOURCE=postgres uses @wine-match/db.
 */
export interface Cradle extends Repositories, Partial<DbCradle> {
  clock: Clock;
  idGenerator: IdGenerator;
  authRepository: AuthRepository;
  passwordHasher: PasswordHasher;
  sessionTokens: SessionTokens;
  authConfig: AuthConfig;
  authService: AuthService;
  importFileParser: ImportFileParser;
  importService: ImportService;
  restaurantService: RestaurantService;
  recommendationService: RecommendationService;
  catalogService: CatalogService;
  adminService: AdminService;
  sommelierService: SommelierService;
  publishService: PublishService;
}

export type DataSource = 'memory' | 'postgres';

export function dataSource(): DataSource {
  return env().dataSource;
}

const globalForDi = globalThis as unknown as { __wineMatchContainer?: Promise<AwilixContainer<Cradle>> };

async function buildContainer(): Promise<AwilixContainer<Cradle>> {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY, strict: true });

  container.register({
    recommendationService: asClass(RecommendationService).scoped(),
    catalogService: asClass(CatalogService).scoped(),
    adminService: asClass(AdminService).scoped(),
    sommelierService: asClass(SommelierService).scoped(),
    authService: asClass(AuthService).scoped(),
    importService: asClass(ImportService).scoped(),
    restaurantService: asClass(RestaurantService).scoped(),
    // loaded on first use: the PDF and spreadsheet libraries are not needed by guest pages
    importFileParser: asValue<ImportFileParser>({ parse: async (file) => new (await import('@wine-match/db/import')).NodeImportFileParser().parse(file) }),
    publishService: asClass(PublishService).scoped(),
    // time and identity come from outside so core stays deterministic and testable
    clock: asValue<Clock>({ now: () => new Date() }),
    idGenerator: asValue<IdGenerator>({ uuid: () => randomUUID() }),
    // scrypt hasher (with a dummy hash for unknown accounts, so timing does not reveal them) and session tokens
    passwordHasher: asValue<PasswordHasher>(await ScryptPasswordHasher.create()),
    sessionTokens: asValue<SessionTokens>(new NodeSessionTokens()),
    authConfig: asValue<AuthConfig>(DEFAULT_AUTH_CONFIG)
  });

  if (dataSource() === 'postgres') {
    // Imported lazily so DATA_SOURCE=memory never opens a database pool.
    const db = await import('@wine-match/db');
    const orm = await db.getOrm();
    container.register({
      orm: asValue(orm),
      em: asFunction(() => orm.em.fork()).scoped(),
      restaurantRepository: asClass(db.PgRestaurantRepository).scoped(),
      dishRepository: asClass(db.PgDishRepository).scoped(),
      wineRepository: asClass(db.PgWineRepository).scoped(),
      pairingRepository: asClass(db.PgPairingRepository).scoped(),
      pairingWriteRepository: asClass(db.PgPairingWriteRepository).scoped(),
      wineWriteRepository: asClass(db.PgWineWriteRepository).scoped(),
      restaurantWriteRepository: asClass(db.PgRestaurantWriteRepository).scoped(),
      publishRepository: asClass(db.PgPublishRepository).scoped(),
      authRepository: asClass(db.PgAuthRepository).scoped(),
      importRepository: asClass(db.PgImportRepository).scoped()
    });
  } else {
    const store = MemoryStore.from(buildDemoDataset({ ids: 'uuid' }));
    const repos = createMemoryRepositories(store);
    container.register({
      restaurantRepository: asValue(repos.restaurantRepository),
      dishRepository: asValue(repos.dishRepository),
      wineRepository: asValue(repos.wineRepository),
      pairingRepository: asValue(repos.pairingRepository),
      pairingWriteRepository: asValue(repos.pairingWriteRepository),
      wineWriteRepository: asValue(repos.wineWriteRepository),
      restaurantWriteRepository: asValue(repos.restaurantWriteRepository),
      publishRepository: asValue(repos.publishRepository),
      authRepository: asValue<AuthRepository>(new MemoryAuthRepository(store)),
      importRepository: asValue(repos.importRepository)
    });
  }
  return container;
}

/** Root container, created once per process (cached on globalThis for Next.js dev reloads). */
export function getContainer(): Promise<AwilixContainer<Cradle>> {
  globalForDi.__wineMatchContainer ??= buildContainer();
  return globalForDi.__wineMatchContainer;
}

/** A fresh request scope. Resolve services from it, never from the root container. */
export async function createRequestScope(): Promise<AwilixContainer<Cradle>> {
  return (await getContainer()).createScope();
}
