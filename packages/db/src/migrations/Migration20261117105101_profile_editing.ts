import { Migration } from '@mikro-orm/migrations';

export class Migration20261117105101_profile_editing extends Migration {

  override name = 'Migration20261117105101_profile_editing';

  override up(): void | Promise<void> {
    this.addSql(`create table "profile_edit" ("id" uuid not null, "restaurant_id" uuid not null, "kind" text not null, "subject_id" uuid not null, "actor" varchar(255) not null, "actor_id" uuid null, "before" jsonb not null, "after" jsonb not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "profile_edit_restaurant_id_created_at_index" on "profile_edit" ("restaurant_id", "created_at");`);

    this.addSql(`alter table "dish" add "profile_confirmed_by" varchar(255) null;`);

    this.addSql(`alter table "wine" add "profile_confirmed_at" timestamptz null, add "profile_confirmed_by" varchar(255) null;`);

    this.addSql(`alter table "profile_edit" add constraint "profile_edit_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);
    this.addSql(`alter table "profile_edit" add constraint "profile_edit_kind_check" check ("kind" in ('dish', 'wine'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "profile_edit" cascade;`);

    this.addSql(`alter table "dish" drop column "profile_confirmed_by";`);

    this.addSql(`alter table "wine" drop column "profile_confirmed_at", drop column "profile_confirmed_by";`);
  }

}
