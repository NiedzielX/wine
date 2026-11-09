import { Migrator } from '@mikro-orm/migrations';
import { MikroORM } from '@mikro-orm/postgresql';
import { SECOND_RESTAURANT, type Repositories, type SecondRestaurant } from '@wine-match/core';
import { createDatabase } from '@wine-match/testkit';
import { fileURLToPath } from 'node:url';
import { MembershipEntity, RestaurantEntity, UserEntity } from '../../src/entities';
import { ormConfig } from '../../src/config';
import {
  PgContentWriteRepository, PgDishRepository, PgGuestInteractionRepository, PgOpportunityDismissalRepository, PgPairingRepository, PgPairingWriteRepository, PgPublishRepository,
  PgRecommendationCodeRepository, PgRestaurantRepository, PgRestaurantWriteRepository, PgSalesRepository, PgWineRepository, PgWineWriteRepository
} from '../../src/repositories';
import { PgImportRepository } from '../../src/repositories/import';
import { PgInvitationRepository } from '../../src/repositories/invitations';
import { PgAuthAuditRepository, PgTeamRepository } from '../../src/repositories/team';
import { DemoSeeder } from '../../src/seeders/DemoSeeder';

const migrationsPath = fileURLToPath(new URL('../../src/migrations', import.meta.url));

/** A fresh database named `name` on the test server, the real migrations applied, the demo data seeded. */
export async function freshDatabase(baseUrl: string, name: string): Promise<MikroORM> {
  const orm = await MikroORM.init(ormConfig({
    clientUrl: await createDatabase(baseUrl, name),
    extensions: [Migrator],
    migrations: { path: migrationsPath, transactional: true, allOrNothing: true, snapshot: false }
  }));
  await orm.migrator.up();
  await new DemoSeeder().run(orm.em.fork());
  return orm;
}

/** Empties every table and loads the demo data again. */
export async function resetData(orm: MikroORM): Promise<void> {
  await orm.em.getConnection().execute('truncate table auth_event, auth_token, sales_record, session, membership, app_user, opportunity_dismissal, recommendation_code, sommelier_decision, published_version, pairing, wine, dish, guest_interaction, import_job, restaurant restart identity cascade');
  await new DemoSeeder().run(orm.em.fork());
}

/** The second restaurant of the team contract: two owners, a manager and a sommelier. */
export async function seedSecondRestaurant(orm: MikroORM): Promise<SecondRestaurant> {
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

/** Repositories over a fresh EntityManager fork, as the DI container builds them per request: every call is its own "request". */
export function pgRepos(orm: MikroORM): Repositories {
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

/**
 * Start gate: every contender is created first and waits on the same promise, then all are released in one tick. Together with
 * one connection (one EntityManager fork) per contender, the statements reach PostgreSQL at the same moment, and nothing
 * depends on sleeps. Returns the settled results in the order given.
 */
export async function race<T>(...contenders: Array<() => Promise<T>>): Promise<Array<PromiseSettledResult<T>>> {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => { open = resolve; });
  const running = contenders.map((c) => gate.then(c));
  open();
  return Promise.allSettled(running);
}

export const fulfilled = <T>(rs: Array<PromiseSettledResult<T>>) => rs.filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled');
export const rejected = (rs: Array<PromiseSettledResult<unknown>>) => rs.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
