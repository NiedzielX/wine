/** Time and identity come from outside, so core stays deterministic and testable. */
export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  uuid(): string;
}

/**
 * Whether the data store answers (spec 2026-10-15-production-deployment, R3). Not a tenant repository: it reads no restaurant
 * data, so it is the one port without `restaurantId` and has no case in `repositoryContract`. `skipped` = there is no store to ask
 * (the in-memory demo data source); `unreachable` = no answer in time, for whatever reason (the reason is never part of the answer).
 */
export type DatabaseHealth = 'ok' | 'skipped' | 'unreachable';

export interface SystemHealth {
  database(): Promise<DatabaseHealth>;
}
