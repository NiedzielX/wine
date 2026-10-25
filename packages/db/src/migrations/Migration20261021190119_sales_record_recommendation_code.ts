import { Migration } from '@mikro-orm/migrations';

/**
 * Recommendation code on a POS line (spec 2026-10-16-recommendation-code, phase 3, #49). One nullable column and a partial
 * index: additive, the previous code ignores it (BACKWARD_COMPATIBILITY §3). Existing lines keep null. `down` drops the
 * column WITH every code written by an import: development and tests only. In production, after a sales file with codes
 * was imported, never run `down`; the rollback is the previous application image, the schema stays.
 */
export class Migration20261021190119_sales_record_recommendation_code extends Migration {

  override name = 'Migration20261021190119_sales_record_recommendation_code';

  override up(): void | Promise<void> {
    this.addSql(`alter table "sales_record" add "recommendation_code" varchar(4) null;`);
    this.addSql(`create index sales_record_recommendation_code_idx on sales_record (restaurant_id, business_date, recommendation_code) where recommendation_code is not null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "sales_record_recommendation_code_idx";`);
    this.addSql(`alter table "sales_record" drop column "recommendation_code";`);
  }

}
