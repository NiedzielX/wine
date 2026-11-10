import { Migration } from '@mikro-orm/migrations';

/**
 * Spec E21 F3 (R7): the counters of the request limits, shared by every instance. Additive: a new table, nothing else changes.
 * No tenant column (the key is a hashed client, never an IP). `down` drops the table (dev and test only, like every `down`).
 */
export class Migration20261110205126_rate_limit_bucket extends Migration {

  override name = 'Migration20261110205126_rate_limit_bucket';

  override up(): void | Promise<void> {
    this.addSql(`create table "rate_limit_bucket" ("key" varchar(32) not null, "rule" varchar(30) not null, "window_start" timestamptz not null, "count" int not null, primary key ("key", "rule", "window_start"));`);
    this.addSql(`create index "rate_limit_bucket_window_start_index" on "rate_limit_bucket" ("window_start");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "rate_limit_bucket" cascade;`);
  }

}
