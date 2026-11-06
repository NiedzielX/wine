import { Migration } from '@mikro-orm/migrations';

/** Slugs that became routes beside `[slug]` in this phase (`RESERVED_SLUGS` in core). */
const F2_RESERVED_SLUGS = ['accept', 'reset', 'account'];

/**
 * Spec E12 F2: the table of one-time links (invitations now, password resets in F4). Stops, before it changes anything, when a
 * restaurant already has one of the slugs the application now reserves for its own routes: `/admin/accept`, `/admin/reset` and
 * `/admin/account` would shadow that restaurant's dashboard, and a printed QR code (`/r/accept`) cannot be re-issued silently.
 * The operator renames the restaurant first (the slug is on printed QR codes: BACKWARD_COMPATIBILITY.md, section 1).
 */
export class Migration20261106114659_auth_token extends Migration {

  override name = 'Migration20261106114659_auth_token';

  override async up(): Promise<void> {
    const clash = await this.execute(`select slug from restaurant where slug in (${F2_RESERVED_SLUGS.map((s) => `'${s}'`).join(', ')}) order by slug`);
    if (clash.length > 0) {
      const slugs = clash.map((r) => String(r.slug)).join(', ');
      throw new Error(`Migration ${this.name} stopped: a restaurant already uses a slug that is now reserved for the dashboard routes (${slugs}). Rename it first (its QR codes carry the slug), then run the migration again. Nothing was changed.`);
    }
    this.addSql(`create table "auth_token" ("id" uuid not null, "kind" text not null, "token_hash" varchar(64) not null, "restaurant_id" uuid null, "email" varchar(254) not null, "role" text null, "user_id" uuid null, "created_by" uuid not null, "created_at" timestamptz not null, "expires_at" timestamptz not null, "used_at" timestamptz null, "revoked_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "auth_token" add constraint "auth_token_token_hash_unique" unique ("token_hash");`);
    this.addSql(`create index "auth_token_restaurant_id_kind_index" on "auth_token" ("restaurant_id", "kind");`);
    this.addSql(`create unique index auth_token_pending_invite_unique on auth_token (restaurant_id, email) where kind = 'invite' and used_at is null and revoked_at is null;`);

    this.addSql(`alter table "auth_token" add constraint "auth_token_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id") on delete cascade;`);
    this.addSql(`alter table "auth_token" add constraint "auth_token_user_id_foreign" foreign key ("user_id") references "app_user" ("id") on delete cascade;`);
    this.addSql(`alter table "auth_token" add constraint "auth_token_invite_shape_check" check (kind <> 'invite' or (restaurant_id is not null and role is not null and role <> 'waiter'));`);
    this.addSql(`alter table "auth_token" add constraint "auth_token_kind_check" check ("kind" in ('invite', 'reset'));`);
    this.addSql(`alter table "auth_token" add constraint "auth_token_role_check" check ("role" in ('owner', 'manager', 'sommelier', 'waiter'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "auth_token" cascade;`);
  }

}
