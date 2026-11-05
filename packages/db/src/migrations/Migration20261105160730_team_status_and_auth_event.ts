import { Migration } from '@mikro-orm/migrations';

export class Migration20261105160730_team_status_and_auth_event extends Migration {

  override name = 'Migration20261105160730_team_status_and_auth_event';

  override up(): void | Promise<void> {
    this.addSql(`create table "auth_event" ("id" uuid not null, "restaurant_id" uuid null, "actor_user_id" uuid null, "subject_user_id" uuid null, "type" text not null, "meta" jsonb not null default '{}', "at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "auth_event_restaurant_id_at_index" on "auth_event" ("restaurant_id", "at");`);

    this.addSql(`alter table "membership" add "status" text not null default 'active', add "version" int not null default 1, add "deactivated_at" timestamptz null, add "deactivated_by" uuid null;`);
    this.addSql(`alter table "membership" add constraint "membership_status_check" check ("status" in ('active', 'deactivated'));`);

    this.addSql(`alter table "auth_event" add constraint "auth_event_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id") on delete set null;`);
    this.addSql(`alter table "auth_event" add constraint "auth_event_type_check" check ("type" in ('login_succeeded', 'login_failed', 'account_locked', 'logout', 'session_revoked', 'password_changed', 'reset_issued', 'reset_completed', 'invite_created', 'invite_revoked', 'invite_accepted', 'role_changed', 'member_deactivated', 'member_reactivated', 'pin_set', 'pin_login_succeeded', 'pin_login_failed', 'pin_locked', 'pin_paused', 'staff_access_changed'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "auth_event" cascade;`);

    this.addSql(`alter table "membership" drop constraint "membership_status_check";`);
    this.addSql(`alter table "membership" drop column "status", drop column "version", drop column "deactivated_at", drop column "deactivated_by";`);
  }

}
