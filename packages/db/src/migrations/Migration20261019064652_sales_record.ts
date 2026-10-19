import { Migration } from '@mikro-orm/migrations';

/**
 * Sales lines from the POS (spec 2026-10-15-pos-sales-import-attach-rate, phase 1, #17). A new table only, so the change
 * is additive (BACKWARD_COMPATIBILITY §3). `down` drops the table WITH its data: development and tests only. In
 * production, once a sales file was imported, never run `down` (Q19): the rollback is the previous application image,
 * the schema stays (the previous code does not touch this table).
 */
export class Migration20261019064652_sales_record extends Migration {

  override name = 'Migration20261019064652_sales_record';

  override up(): void | Promise<void> {
    this.addSql(`create table "sales_record" ("id" uuid not null, "restaurant_id" uuid not null, "import_job_id" uuid not null, "business_date" date not null, "check_id" varchar(64) not null, "covers" smallint null, "item_type" text not null, "quantity" numeric(10,3) not null, "net_amount" numeric(12,2) not null, "replaced_at" timestamptz null, "replaced_by_job_id" uuid null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "sales_record_restaurant_id_business_date_check_id_index" on "sales_record" ("restaurant_id", "business_date", "check_id");`);

    this.addSql(`alter table "sales_record" add constraint "sales_record_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);
    this.addSql(`alter table "sales_record" add constraint "sales_record_import_job_id_foreign" foreign key ("import_job_id") references "import_job" ("id");`);
    this.addSql(`alter table "sales_record" add constraint "sales_record_replaced_by_job_id_foreign" foreign key ("replaced_by_job_id") references "import_job" ("id") on delete set null;`);
    this.addSql(`alter table "sales_record" add constraint "sales_record_covers_check" check (covers between 0 and 999);`);
    this.addSql(`alter table "sales_record" add constraint "sales_record_quantity_check" check (quantity <> 0);`);
    this.addSql(`alter table "sales_record" add constraint "sales_record_item_type_check" check ("item_type" in ('food', 'wine_glass', 'wine_bottle', 'other'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "sales_record" cascade;`);
  }

}
