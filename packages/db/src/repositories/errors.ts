import { ForeignKeyConstraintViolationException, OptimisticLockError, UniqueConstraintViolationException } from '@mikro-orm/core';
import { InvariantError, NotFoundError, VersionConflictError } from '@wine-match/core';

/** Translates database errors into the domain errors the services and the UI understand. */
export function translate(e: unknown): unknown {
  if (e instanceof OptimisticLockError) return new VersionConflictError();
  if (e instanceof UniqueConstraintViolationException) {
    const c = (e as { constraint?: string }).constraint ?? '';
    if (c.includes('one_primary')) return new InvariantError('multiple_primary', 'A dish can have only one primary pairing.');
    return new InvariantError('duplicate_pairing', 'A dish and a wine can be paired only once.');
  }
  if (e instanceof ForeignKeyConstraintViolationException) return new NotFoundError('Dish or wine');
  return e;
}
