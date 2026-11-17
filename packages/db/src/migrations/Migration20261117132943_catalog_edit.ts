import { Migration } from '@mikro-orm/migrations';

export class Migration20261117132943_catalog_edit extends Migration {

  override name = 'Migration20261117132943_catalog_edit';

  override up(): void | Promise<void> {
    this.addSql(`create table "catalog_edit" ("id" uuid not null, "restaurant_id" uuid not null, "kind" text not null, "subject_id" uuid not null, "action" text not null, "actor" varchar(255) not null, "actor_id" uuid null, "before" jsonb null, "after" jsonb not null, "identity" boolean not null default false, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "catalog_edit_restaurant_id_kind_subject_id_created_at_index" on "catalog_edit" ("restaurant_id", "kind", "subject_id", "created_at");`);

    this.addSql(`alter table "catalog_edit" add constraint "catalog_edit_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);
    this.addSql(`alter table "catalog_edit" add constraint "catalog_edit_kind_check" check ("kind" in ('dish', 'wine'));`);
    this.addSql(`alter table "catalog_edit" add constraint "catalog_edit_action_check" check ("action" in ('create', 'update', 'hidden', 'shown'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "catalog_edit" cascade;`);
  }

}
