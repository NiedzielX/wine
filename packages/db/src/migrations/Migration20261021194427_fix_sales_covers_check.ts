import { Migration } from '@mikro-orm/migrations';

/**
 * Aligns `sales_record_covers_check` with the entity (`covers >= 0 and covers <= 999`). The database already stores the
 * same rule, but it normalises `between` to `>=` / `<=`, so the schema snapshots no longer matched the entity and
 * `schema:check` reported changes. The constraint is replaced, not added, so the rule is unchanged for existing rows.
 * `down` restores the original `between` form.
 */
export class Migration20261021194427_fix_sales_covers_check extends Migration {

  override name = 'Migration20261021194427_fix_sales_covers_check';

  override up(): void | Promise<void> {
    this.addSql(`alter table "sales_record" drop constraint "sales_record_covers_check";`);
    this.addSql(`alter table "sales_record" add constraint "sales_record_covers_check" check (covers >= 0 and covers <= 999);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "sales_record" drop constraint "sales_record_covers_check";`);
    this.addSql(`alter table "sales_record" add constraint "sales_record_covers_check" check (covers between 0 and 999);`);
  }

}
