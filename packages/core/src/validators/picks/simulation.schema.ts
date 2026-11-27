import { z } from 'zod';
import { PICKS_MAX } from '../../ranking/restaurant-picks';

/**
 * The query of `GET /restaurants/{slug}/picks/simulation` (spec 2026-11-18-restaurant-picks, R13, R14): `picks` is the
 * set to try (at most `PICKS_MAX` ids; absent = the working set, present but empty = no picks) and `dish` limits the
 * answer to one dish. The ids are only text here: an id that is not one of the restaurant's wines gets the same answer
 * as an id that does not exist (R15), so nothing is looked up by it in a way that tells them apart.
 */
const id = z.string().min(1).max(80);

export const simulationQuerySchema = z.strictObject({
  picks: z.array(id).max(PICKS_MAX).optional(),
  dish: id.optional()
});

export type SimulationQuery = z.output<typeof simulationQuerySchema>;

/**
 * The query as a URL carries it (`?picks=a,b&dish=d`, or `picks=a&picks=b`; no JavaScript needed): only these two names
 * are read, so `?__proto__=x` is never looked at. Repeats of an id count once.
 */
export function simulationQueryFromSearch(getAll: (k: string) => string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const picks = getAll('picks');
  if (picks.length > 0) {
    const ids = picks.flatMap((v) => v.split(',')).map((v) => v.trim()).filter((v) => v !== '');
    out.picks = [...new Set(ids)];
  }
  const dish = getAll('dish')[0];
  if (dish !== undefined && dish.trim() !== '') out.dish = dish.trim();
  return out;
}
