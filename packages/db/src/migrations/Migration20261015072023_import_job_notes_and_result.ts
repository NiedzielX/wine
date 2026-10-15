import { Migration } from '@mikro-orm/migrations';

export class Migration20261015072023_import_job_notes_and_result extends Migration {

  override name = 'Migration20261015072023_import_job_notes_and_result';

  override up(): void | Promise<void> {
    this.addSql(`alter table "import_job" add "notes" jsonb null, add "result" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "import_job" drop column "notes", drop column "result";`);
  }

}
