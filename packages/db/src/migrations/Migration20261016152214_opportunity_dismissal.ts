import { Migration } from '@mikro-orm/migrations';

/**
 * Ignored opportunities (spec 2026-10-16-sommelier-opportunities, phase 1). A new table only, so the change is additive
 * (BACKWARD_COMPATIBILITY §3). `down` drops it: dismissals are not business data, the opportunities simply come back.
 */
export class Migration20261016152214_opportunity_dismissal extends Migration {

  override name = 'Migration20261016152214_opportunity_dismissal';

  override up(): void | Promise<void> {
    this.addSql(`create table "opportunity_dismissal" ("id" uuid not null, "restaurant_id" uuid not null, "opportunity_key" text not null, "rule" text not null, "dish_id" uuid null, "wine_id" uuid null, "dismissed_by" text not null, "dismissed_by_id" uuid null, "dismissed_at" timestamptz not null, "expires_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "opportunity_dismissal" add constraint "opportunity_dismissal_restaurant_id_opportunity_key_unique" unique ("restaurant_id", "opportunity_key");`);

    this.addSql(`alter table "opportunity_dismissal" add constraint "opportunity_dismissal_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);
    this.addSql(`alter table "opportunity_dismissal" add constraint "opportunity_dismissal_rule_check" check ("rule" in ('dish_no_primary', 'ordered_not_reviewed', 'glass_match_unpaired', 'wine_unpaired', 'shown_rarely_chosen'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "opportunity_dismissal" cascade;`);
  }

}
