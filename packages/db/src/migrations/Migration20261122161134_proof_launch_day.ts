import { Migration } from '@mikro-orm/migrations';

/**
 * Spec 2026-11-18-owner-proof-report (R5): the append-only launch day log of the results report. Additive: one new table,
 * nothing else changes, no backfill. The table refuses a second row without a reason (blank counts as none), a repeated `(restaurant_id, seq)` and a role outside the four of `membership.role`.
 * `down` drops the table (dev and test only, like every `down`; in production a rollback is the previous image).
 */
export class Migration20261122161134_proof_launch_day extends Migration {

  override name = 'Migration20261122161134_proof_launch_day';

  override up(): void | Promise<void> {
    this.addSql(`create table "proof_launch_day" ("id" uuid not null, "restaurant_id" uuid not null, "seq" int not null, "launch_day" date not null, "reason" varchar(200) null, "set_by_role" text not null, "set_by_membership_id" uuid null, "set_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "proof_launch_day_restaurant_id_set_at_index" on "proof_launch_day" ("restaurant_id", "set_at");`);
    this.addSql(`alter table "proof_launch_day" add constraint "proof_launch_day_restaurant_id_seq_unique" unique ("restaurant_id", "seq");`);

    this.addSql(`alter table "proof_launch_day" add constraint "proof_launch_day_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);
    this.addSql(`alter table "proof_launch_day" add constraint "proof_launch_day_reason_check" check (seq = 1 or (reason is not null and char_length(btrim(reason)) > 0));`);
    this.addSql(`alter table "proof_launch_day" add constraint "proof_launch_day_seq_check" check (seq >= 1);`);
    this.addSql(`alter table "proof_launch_day" add constraint "proof_launch_day_set_by_role_check" check ("set_by_role" in ('owner', 'manager', 'sommelier', 'waiter'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "proof_launch_day" cascade;`);
  }

}
