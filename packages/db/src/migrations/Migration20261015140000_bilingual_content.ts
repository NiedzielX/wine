import { Migration } from '@mikro-orm/migrations';

/**
 * Bilingual content (spec 2026-10-15-bilingual-content, R9): translations next to the base fields. Additive, with
 * defaults, so existing rows read as "no translations, base content in English" (BACKWARD_COMPATIBILITY §3).
 */
export class Migration20261015140000_bilingual_content extends Migration {

  override name = 'Migration20261015140000_bilingual_content';

  override up(): void | Promise<void> {
    this.addSql(`alter table "dish" add "translations" jsonb not null default '{}';`);
    this.addSql(`alter table "wine" add "translations" jsonb not null default '{}';`);
    this.addSql(`alter table "restaurant" add "content_locale" text not null default 'en', add "translations" jsonb not null default '{}';`);
    this.addSql(`alter table "pairing" add "comment_translations" jsonb not null default '{}';`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "pairing" drop column "comment_translations";`);
    this.addSql(`alter table "restaurant" drop column "content_locale", drop column "translations";`);
    this.addSql(`alter table "wine" drop column "translations";`);
    this.addSql(`alter table "dish" drop column "translations";`);
  }

}
