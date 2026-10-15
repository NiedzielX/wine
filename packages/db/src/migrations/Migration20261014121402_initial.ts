import { Migration } from '@mikro-orm/migrations';

export class Migration20261014121402_initial extends Migration {

  override name = 'Migration20261014121402_initial';

  override up(): void | Promise<void> {
    this.addSql(`create table "restaurant" ("id" uuid not null, "slug" varchar(40) not null, "name" varchar(255) not null, "tagline" varchar(255) not null default '', "address" varchar(255) not null default '', "city" varchar(255) not null default '', "currency" varchar(3) not null default 'PLN', "wine_director" varchar(255) not null, "settings" jsonb not null, "status" text not null default 'onboarding', "published_at" timestamptz null, "external_refs" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "restaurant" add constraint "restaurant_slug_unique" unique ("slug");`);
    this.addSql(`alter table "restaurant" add constraint "restaurant_status_check" check ("status" in ('onboarding', 'active', 'paused', 'archived'));`);

    this.addSql(`create table "import_job" ("id" uuid not null, "restaurant_id" uuid not null, "kind" text not null, "file_name" varchar(255) not null, "file_type" varchar(20) not null, "file_size" int not null, "storage_key" varchar(255) null, "status" text not null default 'uploaded', "parser" varchar(30) null, "rows" jsonb null, "error" text null, "created_by" varchar(255) not null, "created_at" timestamptz not null, "confirmed_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "import_job" add constraint "import_job_kind_check" check ("kind" in ('menu', 'wines', 'sales'));`);
    this.addSql(`alter table "import_job" add constraint "import_job_status_check" check ("status" in ('uploaded', 'parsing', 'preview_ready', 'confirmed', 'failed', 'cancelled'));`);

    this.addSql(`create table "guest_interaction" ("id" bigserial primary key, "restaurant_id" uuid not null, "session_id" uuid not null, "name" varchar(60) not null, "dish_id" uuid null, "wine_id" uuid null, "props" jsonb null, "engine_version" varchar(40) null, "created_at" timestamptz not null);`);
    this.addSql(`create index "guest_interaction_restaurant_id_created_at_index" on "guest_interaction" ("restaurant_id", "created_at");`);
    this.addSql(`create index "guest_interaction_restaurant_id_name_index" on "guest_interaction" ("restaurant_id", "name");`);

    this.addSql(`create table "dish" ("id" uuid not null, "restaurant_id" uuid not null, "name" varchar(255) not null, "description" text not null default '', "category" varchar(40) not null, "price" numeric(10,2) not null, "status" text not null default 'draft', "sort_order" int not null default 0, "profile_intensity" smallint not null, "profile_fat" smallint not null, "profile_salt" smallint not null, "profile_sweetness" smallint not null, "profile_acidity" smallint not null, "profile_spice" smallint not null, "profile_umami" smallint not null, "profile_smoke" smallint not null, "profile_creaminess" smallint not null, "profile_protein" text not null, "profile_cooking" text not null, "profile_source" text not null default 'draft', "profile_drafted_by" varchar(255) null, "profile_confirmed_at" timestamptz null, "external_ref" varchar(255) null, "deleted_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "dish_restaurant_id_status_index" on "dish" ("restaurant_id", "status");`);
    this.addSql(`alter table "dish" add constraint "dish_status_check" check ("status" in ('draft', 'published', 'hidden'));`);
    this.addSql(`alter table "dish" add constraint "dish_profile_protein_check" check ("profile_protein" in ('beef', 'game', 'poultry', 'pork', 'fish', 'shellfish', 'vegetable', 'mushroom', 'dairy', 'dessert'));`);
    this.addSql(`alter table "dish" add constraint "dish_profile_cooking_check" check ("profile_cooking" in ('raw', 'cured', 'poached', 'seared', 'roasted', 'grilled', 'braised', 'fried', 'baked', 'none'));`);
    this.addSql(`alter table "dish" add constraint "dish_profile_source_check" check ("profile_source" in ('draft', 'confirmed'));`);

    this.addSql(`create table "wine" ("id" uuid not null, "restaurant_id" uuid not null, "catalog_wine_id" uuid null, "producer" varchar(255) not null, "name" varchar(255) not null, "vintage" smallint null, "region" varchar(255) not null default '', "country" varchar(255) not null default '', "grapes" text[] not null, "list_number" int null, "glass_price" numeric(10,2) null, "glass_pour_ml" smallint not null default 150, "bottle_price" numeric(10,2) not null, "bottle_size_ml" smallint not null default 750, "active" boolean not null default true, "colour_hex" varchar(7) not null, "tasting_note" text not null default '', "stock_qty" int null, "profile_sweetness" smallint not null, "profile_acidity" smallint not null, "profile_tannin" smallint not null, "profile_body" smallint not null, "profile_alcohol" numeric(3,1) not null, "profile_fruitiness" smallint not null, "profile_oak" smallint not null, "profile_aromatic" smallint not null, "profile_freshness" smallint not null, "profile_style" text not null, "profile_adventurous" boolean not null default false, "profile_source" text not null default 'confirmed', "external_ref" varchar(255) null, "deleted_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "wine_restaurant_id_active_index" on "wine" ("restaurant_id", "active");`);
    this.addSql(`alter table "wine" add constraint "wine_profile_style_check" check ("profile_style" in ('sparkling', 'white', 'rose', 'orange', 'red', 'sweet'));`);
    this.addSql(`alter table "wine" add constraint "wine_profile_source_check" check ("profile_source" in ('grape_defaults', 'catalog', 'confirmed'));`);

    this.addSql(`create table "pairing" ("id" uuid not null, "restaurant_id" uuid not null, "dish_id" uuid not null, "wine_id" uuid not null, "status" text not null default 'suggested', "role" text null, "rank" smallint null, "comment" varchar(140) null, "model_score" smallint not null, "factors" jsonb null, "engine_version" varchar(40) not null, "source" text not null, "dirty" boolean not null default false, "updated_by" varchar(255) not null, "version" int not null default 1, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "pairing_restaurant_id_status_index" on "pairing" ("restaurant_id", "status");`);
    this.addSql(`create unique index pairing_one_primary_per_dish on pairing (dish_id) where role = 'primary' and status in ('approved', 'modified');`);
    this.addSql(`alter table "pairing" add constraint "pairing_dish_id_wine_id_unique" unique ("dish_id", "wine_id");`);
    this.addSql(`alter table "pairing" add constraint "pairing_status_check" check ("status" in ('suggested', 'approved', 'modified', 'rejected'));`);
    this.addSql(`alter table "pairing" add constraint "pairing_role_check" check ("role" in ('primary', 'alternative', 'best_value'));`);
    this.addSql(`alter table "pairing" add constraint "pairing_source_check" check ("source" in ('engine', 'sommelier'));`);

    this.addSql(`create table "sommelier_decision" ("id" uuid not null, "pairing_id" uuid not null, "actor" varchar(255) not null, "action" text not null, "before" jsonb null, "after" jsonb null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "sommelier_decision" add constraint "sommelier_decision_action_check" check ("action" in ('approve', 'modify', 'reject', 'restore', 'set_role', 'reorder', 'comment', 'create', 'delete'));`);

    this.addSql(`alter table "import_job" add constraint "import_job_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);

    this.addSql(`alter table "guest_interaction" add constraint "guest_interaction_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);

    this.addSql(`alter table "dish" add constraint "dish_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);

    this.addSql(`alter table "wine" add constraint "wine_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);

    this.addSql(`alter table "pairing" add constraint "pairing_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);
    this.addSql(`alter table "pairing" add constraint "pairing_dish_id_foreign" foreign key ("dish_id") references "dish" ("id");`);
    this.addSql(`alter table "pairing" add constraint "pairing_wine_id_foreign" foreign key ("wine_id") references "wine" ("id");`);

    this.addSql(`alter table "sommelier_decision" add constraint "sommelier_decision_pairing_id_foreign" foreign key ("pairing_id") references "pairing" ("id") on delete cascade;`);
  }

}
