import { describe, expect, inject, it } from 'vitest';

/**
 * An identifier in the address that is not a UUID is an unknown dish or wine: 404, never a 500 (docs/API_SPECIFICATION.md,
 * lesson 2026-11-05-url-ids-vs-uuid-columns). On PostgreSQL such a value used to reach a uuid column and fail with 22P02.
 * Plain HTTP requests, as a browser without JavaScript would send them; nothing is written.
 */

const get = (path: string) => fetch(`${inject('e2e').baseUrl}${path}`, { redirect: 'manual' });

describe('an id that is not a UUID is an unknown id', () => {
  it('answers 404 on the guest pages and the public API for a dish or wine id that is not a UUID', async () => {
    for (const path of [
      '/r/halka/wine/abc',
      '/r/halka/dish/abc/wines',
      '/r/halka/selected/abc',
      '/api/v1/dishes/abc/recommendations?restaurant=halka'
    ]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });
});
