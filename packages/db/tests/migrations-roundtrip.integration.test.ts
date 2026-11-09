import { Migrator } from '@mikro-orm/migrations';
import { MikroORM } from '@mikro-orm/postgresql';
import { createDatabase } from '@wine-match/testkit';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { ormConfig } from '../src/config';
import { DemoSeeder } from '../src/seeders/DemoSeeder';

/**
 * Migration round trip on real PostgreSQL (SDLC risk-high gate: a migration test "up and down"): all migrations up, schema
 * snapshot, `down` for every migration from the newest to the oldest, schema equal to the one right after the baseline,
 * `up` again, schema equal to the first full snapshot. Also with rows in the tables, because a `down` that only works on an
 * empty database is not a rollback plan.
 *
 * NON-REVERSIBLE (documented, not hidden): `initial` is the baseline migration and has no `down`; its inverse would drop the whole
 * schema. AGENTS.md forbids editing an applied migration, so the baseline stays as it is and the test stops one step above it.
 * Every other migration MUST have a `down`: the test fails when a new migration comes without one.
 */
const NON_REVERSIBLE = new Map([
  ['Migration20261014121402_initial', 'baseline of the schema: its down would drop every table, so the test treats the state after it as "empty"']
]);
const BASELINE = 'Migration20261014121402_initial';

const baseUrl = inject('databaseUrl');
const migrationsPath = fileURLToPath(new URL('../src/migrations', import.meta.url));
const migrationNames = readdirSync(migrationsPath).filter((f) => /^Migration\d+_.+\.ts$/.test(f)).map((f) => f.replace(/\.ts$/, '')).sort();

const open = async (name: string) => MikroORM.init(ormConfig({
  clientUrl: await createDatabase(baseUrl, name),
  extensions: [Migrator],
  // snapshot:false: the round trip must not write .snapshot-*.json into the source tree
  migrations: { path: migrationsPath, transactional: true, allOrNothing: true, snapshot: false }
}));

/** Everything a migration can change that the application depends on, as sorted text lines. */
async function snapshot(orm: MikroORM): Promise<Record<string, string[]>> {
  const q = async (sql: string) => (await orm.em.getConnection().execute<Array<{ line: string }>>(sql)).map((r) => r.line);
  const notMigrator = "table_name <> 'mikro_orm_migrations'";
  return {
    columns: await q(`select concat_ws(' | ', table_name, column_name, data_type, udt_name, is_nullable, coalesce(column_default, '-'), coalesce(character_maximum_length::text, '-'), coalesce(numeric_precision::text, '-'), coalesce(numeric_scale::text, '-'), coalesce(datetime_precision::text, '-')) as line
      from information_schema.columns where table_schema = 'public' and ${notMigrator} order by 1`),
    tables: await q(`select table_name || ' ' || table_type as line from information_schema.tables where table_schema = 'public' and ${notMigrator} order by 1`),
    indexes: await q(`select tablename || ' | ' || indexname || ' | ' || indexdef as line from pg_indexes where schemaname = 'public' and tablename <> 'mikro_orm_migrations' order by 1`),
    constraints: await q(`select c.conrelid::regclass::text || ' | ' || c.conname || ' | ' || c.contype::text || ' | ' || pg_get_constraintdef(c.oid) as line
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and c.conrelid::regclass::text <> 'mikro_orm_migrations' order by 1`),
    enums: await q(`select t.typname || ' | ' || e.enumlabel as line from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' order by t.typname, e.enumsortorder`),
    sequences: await q(`select sequencename || ' | ' || data_type::text || ' | ' || start_value || ' | ' || increment_by as line from pg_sequences where schemaname = 'public' order by 1`),
    triggers: await q(`select event_object_table || ' | ' || trigger_name || ' | ' || action_statement as line from information_schema.triggers where trigger_schema = 'public' order by 1`),
    functions: await q(`select p.proname || ' | ' || pg_get_functiondef(p.oid) as line from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`)
  };
}

const executed = async (orm: MikroORM) => (await orm.migrator.getExecuted()).map((m) => m.name).sort();

describe('migrations: up, down for each, up again', () => {
  const orms: MikroORM[] = [];
  afterAll(async () => { for (const orm of orms) await orm.close(true); });

  it('the test sees every migration file and only the baseline is documented as non-reversible', async () => {
    expect(migrationNames[0]).toBe(BASELINE);
    expect(migrationNames.length).toBeGreaterThan(1);
    const withoutDown: string[] = [];
    for (const name of migrationNames) {
      const mod = (await import(`../src/migrations/${name}.ts`)) as Record<string, { prototype: { down: unknown } }>;
      const cls = mod[name];
      // Migration.prototype.down is the base class's no-op; a real down is an own method of the class
      if (!Object.prototype.hasOwnProperty.call(cls.prototype, 'down')) withoutDown.push(name);
    }
    expect(withoutDown, 'every migration except the documented baseline must have a down()').toEqual([...NON_REVERSIBLE.keys()]);
  });

  async function roundTrip(withData: boolean) {
    const suffix = withData ? 'data' : 'empty';
    const base = await open(`winematch_migrations_base_${suffix}`);
    const orm = await open(`winematch_migrations_test_${suffix}`);
    orms.push(base, orm);

    await base.migrator.up({ to: BASELINE });
    expect(await executed(base)).toEqual([BASELINE]);
    const baseline = await snapshot(base);
    expect(baseline.tables.length, 'the baseline creates the schema').toBeGreaterThan(5);

    await orm.migrator.up();
    expect(await executed(orm)).toEqual(migrationNames);
    const full = await snapshot(orm);
    expect(full.tables.length).toBeGreaterThan(baseline.tables.length);
    if (withData) await new DemoSeeder({ NODE_ENV: 'test' }).run(orm.em.fork());

    // newest to oldest, one migration per call, the one that was reverted is the one we expect
    const reversible = migrationNames.filter((n) => !NON_REVERSIBLE.has(n));
    for (const name of [...reversible].reverse()) {
      const reverted = await orm.migrator.down();
      expect(reverted.map((m) => m.name), `down() reverted ${name}`).toEqual([name]);
    }
    expect(await executed(orm)).toEqual([...NON_REVERSIBLE.keys()]);

    if (withData) await orm.em.getConnection().execute('truncate table restaurant restart identity cascade');
    const afterDown = await snapshot(orm);
    for (const key of Object.keys(baseline)) expect(afterDown[key], `after all downs: ${key}`).toEqual(baseline[key]);

    await orm.migrator.up();
    expect(await executed(orm)).toEqual(migrationNames);
    const again = await snapshot(orm);
    for (const key of Object.keys(full)) expect(again[key], `after up again: ${key}`).toEqual(full[key]);
  }

  it('on an empty database: all up, all down but the baseline = the baseline schema, up again = the first full schema', async () => {
    await roundTrip(false);
  }, 120_000);

  it('with the demo data loaded: the same rollback works on a database that has rows', async () => {
    await roundTrip(true);
  }, 120_000);
});
