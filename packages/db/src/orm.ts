import { MikroORM, type Options } from '@mikro-orm/postgresql';
import { ormConfig } from './config';

/**
 * One ORM (and one connection pool) per process. In Next.js dev mode modules are re-evaluated
 * on every change, so the instance is cached on globalThis to avoid leaking pools.
 */
const globalForOrm = globalThis as unknown as { __wineMatchOrm?: Promise<MikroORM> };

export function getOrm(overrides: Partial<Options> = {}): Promise<MikroORM> {
  const pending = (globalForOrm.__wineMatchOrm ??= MikroORM.init(ormConfig(overrides)));
  // an init that failed is not remembered: the next call tries again (the database may be back)
  pending.catch(() => {
    if (globalForOrm.__wineMatchOrm === pending) delete globalForOrm.__wineMatchOrm;
  });
  return pending;
}

export async function closeOrm(): Promise<void> {
  const orm = await globalForOrm.__wineMatchOrm;
  delete globalForOrm.__wineMatchOrm;
  await orm?.close(true);
}
