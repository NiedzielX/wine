import { Migration } from '@mikro-orm/migrations';

/**
 * Recommendation codes (spec 2026-10-16-recommendation-code, phase 1). A new table only, so the change is additive
 * (BACKWARD_COMPATIBILITY §3). `down` drops the table and is meant for development and tests only: in production with
 * data the rollback is the previous image, the schema stays (as E03 Q19).
 */
export class Migration20261018125821_recommendation_code extends Migration {

  override name = 'Migration20261018125821_recommendation_code';

  override up(): void | Promise<void> {
    this.addSql(`create table "recommendation_code" ("id" uuid not null, "restaurant_id" uuid not null, "service_day" date not null, "code" varchar(4) not null, "session_id" uuid not null, "source" text not null, "context" text not null, "wine_id" uuid not null, "dish_ids" jsonb not null, "serving" text not null, "menu_version" timestamptz null, "tier" text null, "engine_version" varchar(40) not null, "issued_at" timestamptz not null, "confirmed_at" timestamptz null, "confirmed_by" varchar(20) null, primary key ("id"));`);
    this.addSql(`create index "recommendation_code_restaurant_id_issued_at_index" on "recommendation_code" ("restaurant_id", "issued_at");`);
    this.addSql(`create unique index recommendation_code_choice_unique on recommendation_code (restaurant_id, service_day, session_id, wine_id, serving, dish_ids);`);
    this.addSql(`alter table "recommendation_code" add constraint "recommendation_code_restaurant_id_service_day_code_unique" unique ("restaurant_id", "service_day", "code");`);

    this.addSql(`alter table "recommendation_code" add constraint "recommendation_code_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);
    this.addSql(`alter table "recommendation_code" add constraint "recommendation_code_wine_id_foreign" foreign key ("wine_id") references "wine" ("id");`);
    this.addSql(`alter table "recommendation_code" add constraint "recommendation_code_source_check" check ("source" in ('guest', 'staff'));`);
    this.addSql(`alter table "recommendation_code" add constraint "recommendation_code_context_check" check ("context" in ('dish', 'table', 'direct'));`);
    this.addSql(`alter table "recommendation_code" add constraint "recommendation_code_serving_check" check ("serving" in ('glass', 'bottle'));`);
    this.addSql(`alter table "recommendation_code" add constraint "recommendation_code_tier_check" check ("tier" in ('sommelier_primary', 'sommelier', 'engine'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "recommendation_code" cascade;`);
  }

}
