import { Migration } from '@mikro-orm/migrations';

export class Migration20261014171432_published_versions_and_decision_history extends Migration {

  override name = 'Migration20261014171432_published_versions_and_decision_history';

  override up(): void | Promise<void> {
    this.addSql(`create table "published_version" ("id" uuid not null, "restaurant_id" uuid not null, "number" int not null, "snapshot" jsonb not null, "changes_count" int not null default 0, "published_by" varchar(255) not null, "published_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "published_version" add constraint "published_version_restaurant_id_number_unique" unique ("restaurant_id", "number");`);

    this.addSql(`alter table "sommelier_decision" drop constraint "sommelier_decision_pairing_id_foreign";`);

    this.addSql(`alter table "sommelier_decision" add "restaurant_id" uuid not null, add "dish_id" uuid not null, add "wine_id" uuid not null;`);
    this.addSql(`alter table "sommelier_decision" add constraint "sommelier_decision_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);
    this.addSql(`create index "sommelier_decision_restaurant_id_created_at_index" on "sommelier_decision" ("restaurant_id", "created_at");`);
    this.addSql(`create index "sommelier_decision_pairing_id_index" on "sommelier_decision" ("pairing_id");`);
    this.addSql(`create index "sommelier_decision_dish_id_index" on "sommelier_decision" ("dish_id");`);

    this.addSql(`alter table "published_version" add constraint "published_version_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "published_version" cascade;`);

    this.addSql(`alter table "sommelier_decision" drop constraint "sommelier_decision_restaurant_id_foreign";`);

    this.addSql(`drop index "sommelier_decision_restaurant_id_created_at_index";`);
    this.addSql(`drop index "sommelier_decision_pairing_id_index";`);
    this.addSql(`drop index "sommelier_decision_dish_id_index";`);
    this.addSql(`alter table "sommelier_decision" drop column "restaurant_id", drop column "dish_id", drop column "wine_id";`);
    this.addSql(`alter table "sommelier_decision" add constraint "sommelier_decision_pairing_id_foreign" foreign key ("pairing_id") references "pairing" ("id") on delete cascade;`);
  }

}
