import { Migration } from '@mikro-orm/migrations';

export class Migration20261014173613_accounts_and_sessions extends Migration {

  override name = 'Migration20261014173613_accounts_and_sessions';

  override up(): void | Promise<void> {
    this.addSql(`create table "app_user" ("id" uuid not null, "email" varchar(255) not null, "name" varchar(255) not null, "password_hash" text not null, "failed_attempts" int not null default 0, "locked_until" timestamptz null, "last_login_at" timestamptz null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "app_user" add constraint "app_user_email_unique" unique ("email");`);

    this.addSql(`create table "session" ("id" uuid not null, "user_id" uuid not null, "token_hash" varchar(64) not null, "csrf_token" varchar(64) not null, "created_at" timestamptz not null, "expires_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "session" add constraint "session_token_hash_unique" unique ("token_hash");`);
    this.addSql(`create index "session_expires_at_index" on "session" ("expires_at");`);

    this.addSql(`create table "membership" ("id" uuid not null, "user_id" uuid not null, "restaurant_id" uuid not null, "role" text not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "membership" add constraint "membership_user_id_restaurant_id_unique" unique ("user_id", "restaurant_id");`);

    this.addSql(`alter table "sommelier_decision" add "actor_id" uuid null;`);

    this.addSql(`alter table "session" add constraint "session_user_id_foreign" foreign key ("user_id") references "app_user" ("id") on delete cascade;`);

    this.addSql(`alter table "membership" add constraint "membership_user_id_foreign" foreign key ("user_id") references "app_user" ("id") on delete cascade;`);
    this.addSql(`alter table "membership" add constraint "membership_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id");`);
    this.addSql(`alter table "membership" add constraint "membership_role_check" check ("role" in ('owner', 'manager', 'sommelier', 'waiter'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "session" drop constraint "session_user_id_foreign";`);
    this.addSql(`alter table "membership" drop constraint "membership_user_id_foreign";`);

    this.addSql(`drop table if exists "app_user" cascade;`);
    this.addSql(`drop table if exists "session" cascade;`);
    this.addSql(`drop table if exists "membership" cascade;`);

    this.addSql(`alter table "sommelier_decision" drop column "actor_id";`);
  }

}
