import { queryDatabase } from '@wine-match/testkit';
import { db } from './boundaries';

/**
 * POS lines for the results report e2e files (spec 2026-11-18-owner-proof-report): the launch day is fixed, both the baseline
 * (2026-01-05 .. 2026-02-01) and window 1 (2026-02-02 .. 2026-03-01) are long over, and every line carries a recognisable check id
 * (`SECRETCHK-…`); some wine lines of the window carry a recommendation code, so a leak of either into an answer is visible.
 */
export const LAUNCH = '2026-02-02';
export const CODE = 'Z9Q';

/** `n` checks with food per period, the first `wines` of them with a bottle, spread over its 28 days; every fifth window bottle carries the code. */
export async function seedSales(slug: string, tag: string, baseline: [n: number, wines: number], window: [n: number, wines: number]): Promise<void> {
  const [{ id: restaurantId }] = await queryDatabase<{ id: string }>(db(), 'select id::text from restaurant where slug = $1', [slug]);
  const job = crypto.randomUUID();
  await queryDatabase(db(), `insert into import_job (id, restaurant_id, kind, file_name, file_type, file_size, status, created_by, created_at, confirmed_at) values ($1, $2, 'sales', 'e2e-proof.csv', 'csv', 1, 'confirmed', 'e2e', now(), now())`, [job, restaurantId]);
  const insert = async (start: string, n: number, wines: number, prefix: string, coded: boolean) => {
    await queryDatabase(db(), `insert into sales_record (id, restaurant_id, import_job_id, business_date, check_id, covers, item_type, quantity, net_amount, recommendation_code, created_at)
      select gen_random_uuid(), $1, $2, ($3::date + (i % 28)), $4::text || '-' || i, 2, 'food', 1, 100, null, now() from generate_series(1, $5::int) i`, [restaurantId, job, start, prefix, n]);
    await queryDatabase(db(), `insert into sales_record (id, restaurant_id, import_job_id, business_date, check_id, covers, item_type, quantity, net_amount, recommendation_code, created_at)
      select gen_random_uuid(), $1, $2, ($3::date + (i % 28)), $4::text || '-' || i, 2, 'wine_bottle', 1, 150, case when $5::boolean and i % 5 = 0 then $6::text else null end, now() from generate_series(1, $7::int) i`, [restaurantId, job, start, prefix, coded, CODE, wines]);
  };
  await insert('2026-01-05', baseline[0], baseline[1], `SECRETCHK-${tag}-B`, false);
  await insert(LAUNCH, window[0], window[1], `SECRETCHK-${tag}-W`, true);
}
