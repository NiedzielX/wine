import { Migration } from '@mikro-orm/migrations';

/**
 * Spec 2026-11-18-restaurant-picks (R1, R3): the working set of a restaurant's picks and the append-only history of its
 * changes. Additive: two new tables, nothing else changes, no backfill (a published version of schema 2 has no picks).
 * `down` drops the tables (dev and test only, like every `down`; in production a rollback is the previous image).
 */
export class Migration20261119092849_restaurant_picks extends Migration {

  override name = 'Migration20261119092849_restaurant_picks';

  override up(): void | Promise<void> {
    this.addSql(`create table "pick_edit" ("id" uuid not null, "restaurant_id" uuid not null, "wine_id" uuid not null, "enabled" boolean not null, "actor" varchar(255) not null, "actor_id" uuid null, "before" jsonb not null, "after" jsonb not null, "at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "pick_edit_restaurant_id_at_index" on "pick_edit" ("restaurant_id", "at");`);

    this.addSql(`create table "restaurant_pick" ("id" uuid not null, "restaurant_id" uuid not null, "wine_id" uuid not null, "set_at" timestamptz not null, "set_by" varchar(255) not null, "set_by_id" uuid null, primary key ("id"));`);
    this.addSql(`create index "restaurant_pick_wine_id_index" on "restaurant_pick" ("wine_id");`);
    this.addSql(`alter table "restaurant_pick" add constraint "restaurant_pick_restaurant_id_wine_id_unique" unique ("restaurant_id", "wine_id");`);

    this.addSql(`alter table "pick_edit" add constraint "pick_edit_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);

    this.addSql(`alter table "restaurant_pick" add constraint "restaurant_pick_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);
    this.addSql(`alter table "restaurant_pick" add constraint "restaurant_pick_wine_id_foreign" foreign key ("wine_id") references "wine" ("id") on delete cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "pick_edit" cascade;`);
    this.addSql(`drop table if exists "restaurant_pick" cascade;`);
  }

}
