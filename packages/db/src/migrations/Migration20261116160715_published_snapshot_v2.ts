import { Migration } from '@mikro-orm/migrations';

const scale = (alias: string, columns: string[]) => columns.map((c) => `'${c}', ${alias}.profile_${c}`).join(', ');

/** The profile of every non-deleted dish of the restaurant, as `buildSnapshot` writes it. */
const DISH_PROFILES = `coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'profile', jsonb_build_object(${scale('d', ['intensity', 'fat', 'salt', 'sweetness', 'acidity', 'spice', 'umami', 'smoke', 'creaminess', 'protein', 'cooking'])})) order by d.id)
  from "dish" d where d.restaurant_id = l.restaurant_id and d.deleted_at is null), '[]'::jsonb)`;
const WINE_PROFILES = `coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'profile', jsonb_build_object(${scale('w', ['sweetness', 'acidity', 'tannin', 'body', 'alcohol', 'fruitiness', 'oak', 'aromatic', 'freshness', 'style', 'adventurous'])})) order by w.id)
  from "wine" w where w.restaurant_id = l.restaurant_id and w.deleted_at is null), '[]'::jsonb)`;
/** The dishes guests could reach at the time of the migration: published and hidden (a hidden dish stays switchable). */
const MENU = `coalesce((select jsonb_agg(d.id order by d.id) from "dish" d where d.restaurant_id = l.restaurant_id and d.deleted_at is null and d.status in ('published', 'hidden')), '[]'::jsonb)`;

/**
 * Spec 2026-11-04-panel-completion, F1 (R1, AC4): published snapshot v2. Data only, no schema change.
 *
 * Until now guests read the profiles and the visibility of dishes from the current rows; from F1 they read them from the
 * latest published version. So that nothing changes for guests at deploy time, the LATEST version of every restaurant
 * gets `schema: 2`, `profiles` and `menu.dishIds` built from the current columns, i.e. exactly what guests see right
 * now. This is the only edit of an existing row of an immutable version (approved deviation, owner's delegation
 * 2026-11-04, plan "Decyzje podjęte"): it adds keys, it never changes `pairings` or `content`. Older versions stay as
 * they are and read as "no data in this version". A version that already has `schema` is left alone.
 *
 * `down` removes the three keys from every version (dev and test only, like every `down`).
 */
export class Migration20261116160715_published_snapshot_v2 extends Migration {

  override name = 'Migration20261116160715_published_snapshot_v2';

  override up(): void | Promise<void> {
    this.addSql(`with l as (select distinct on (restaurant_id) id, restaurant_id from "published_version" order by restaurant_id, number desc)
      update "published_version" pv
      set snapshot = pv.snapshot || jsonb_build_object('schema', 2, 'profiles', jsonb_build_object('dishes', ${DISH_PROFILES}, 'wines', ${WINE_PROFILES}), 'menu', jsonb_build_object('dishIds', ${MENU}))
      from l where pv.id = l.id and pv.snapshot -> 'schema' is null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`update "published_version" set snapshot = snapshot - 'schema' - 'profiles' - 'menu' where snapshot -> 'schema' is not null;`);
  }

}
