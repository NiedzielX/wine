/**
 * Operator command logic: creates a restaurant and its first owner in one transaction (spec E05-S01).
 * Kept apart from the thin entry point (create-restaurant.ts) so it can be tested without a shell:
 * `run` takes the arguments, the environment and the one dependency that touches the database.
 *
 * The password comes only from USER_PASSWORD; neither it nor DATABASE_URL is ever printed.
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DEFAULT_RESTAURANT_SETTINGS, MIN_PASSWORD_LENGTH, validateSlug } from '@wine-match/core';
import { hashPassword } from '../src/auth/scrypt';
import { MembershipEntity, RestaurantEntity, UserEntity } from '../src/entities';

export interface BootstrapDeps {
  /** Opens an ORM that has the Migrator extension; called only after the input is valid. */
  openOrm: () => Promise<MikroORM>;
}

export interface BootstrapInput {
  name: string;
  slug: string;
  address: string;
  city: string;
  wineDirector: string;
  ownerEmail: string;
  ownerName: string;
  allowExistingAccount: boolean;
}

const USAGE = [
  'Usage: USER_PASSWORD=… npm run restaurant:create -- --name <name> --slug <slug> --address <address> --city <city>',
  '         --wine-director <name> --owner-email <email> --owner-name <name> [--allow-existing-account]'
].join('\n');

const OPTIONS = {
  name: { type: 'string' },
  slug: { type: 'string' },
  address: { type: 'string' },
  city: { type: 'string' },
  'wine-director': { type: 'string' },
  'owner-email': { type: 'string' },
  'owner-name': { type: 'string' },
  'allow-existing-account': { type: 'boolean' }
} as const;

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const passwordMessage = `Set USER_PASSWORD to a password of at least ${MIN_PASSWORD_LENGTH} characters.`;

type Parsed = { input: BootstrapInput; errors: string[] };

/** Validates every field and returns all problems at once (nothing here touches the database). */
export function parseInput(argv: string[], env: NodeJS.ProcessEnv): Parsed {
  const errors: string[] = [];
  let values: Record<string, string | boolean | undefined> = {};
  try {
    values = parseArgs({ args: argv, options: OPTIONS, strict: true, allowPositionals: false }).values;
  } catch (e) {
    errors.push(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
  }
  const text = (key: string) => (typeof values[key] === 'string' ? (values[key] as string) : '');
  const input: BootstrapInput = {
    name: text('name').trim(),
    slug: text('slug').trim(),
    address: text('address').trim(),
    city: text('city').trim(),
    wineDirector: text('wine-director').trim(),
    ownerEmail: text('owner-email').trim().toLowerCase(),
    ownerName: text('owner-name').trim(),
    allowExistingAccount: values['allow-existing-account'] === true
  };
  const slugProblem = validateSlug(input.slug);
  if (slugProblem === 'invalid') errors.push('--slug must be 2–40 lower-case letters, digits and single hyphens.');
  if (slugProblem === 'reserved') errors.push(`--slug "${input.slug}" is reserved.`);
  if (!input.name || input.name.length > 120) errors.push('--name is required (max 120 characters).');
  if (!input.address) errors.push('--address is required.');
  if (!input.city) errors.push('--city is required.');
  if (!input.wineDirector) errors.push('--wine-director is required.');
  if (!input.ownerName) errors.push('--owner-name is required.');
  if (!EMAIL_PATTERN.test(input.ownerEmail)) errors.push('--owner-email must be a valid e-mail address.');
  // With --allow-existing-account the password is only needed if the account turns out not to exist (checked in the transaction).
  if (!input.allowExistingAccount && (env.USER_PASSWORD ?? '').length < MIN_PASSWORD_LENGTH) errors.push(passwordMessage);
  if (!env.DATABASE_URL) errors.push('DATABASE_URL is not set.');
  return { input, errors };
}

type Outcome = { ok: true; accountCreated: boolean } | { ok: false; message: string };

function conflictMessage(constraint: string, input: BootstrapInput): string {
  if (constraint.includes('restaurant_slug')) return `A restaurant with slug "${input.slug}" already exists. Nothing was saved.`;
  if (constraint.includes('app_user_email')) {
    return input.allowExistingAccount
      ? `The account ${input.ownerEmail} was created by someone else a moment ago. Nothing was saved. Run the command again.`
      : `An account ${input.ownerEmail} already exists. Nothing was saved. Use --allow-existing-account to make it the owner.`;
  }
  return `A conflicting row already exists (${constraint || 'unique constraint'}). Nothing was saved.`;
}

async function pendingMigrations(orm: MikroORM): Promise<boolean> {
  // Do not let the migrator create its own bookkeeping table in a database that was never migrated.
  const rows = (await orm.em.getConnection().execute(`select to_regclass('mikro_orm_migrations') as t`)) as { t: string | null }[];
  if (!rows[0]?.t) return true;
  return (await orm.migrator.getPending()).length > 0;
}

async function write(orm: MikroORM, input: BootstrapInput, password: string): Promise<Outcome> {
  const em = orm.em.fork();
  try {
    return await em.transactional(async (tx): Promise<Outcome> => {
      if (await tx.count(RestaurantEntity, { slug: input.slug })) return { ok: false, message: conflictMessage('restaurant_slug', input) };
      let user = await tx.findOne(UserEntity, { email: input.ownerEmail });
      let accountCreated = false;
      if (user && !input.allowExistingAccount) return { ok: false, message: conflictMessage('app_user_email', input) };
      if (!user) {
        if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, message: `${passwordMessage} The account ${input.ownerEmail} does not exist yet.` };
        user = tx.create(UserEntity, { id: randomUUID(), email: input.ownerEmail, name: input.ownerName, passwordHash: await hashPassword(password) });
        accountCreated = true;
      }
      const restaurant = tx.create(RestaurantEntity, {
        id: randomUUID(), slug: input.slug, name: input.name, address: input.address, city: input.city, currency: 'PLN',
        wineDirector: input.wineDirector, settings: { ...DEFAULT_RESTAURANT_SETTINGS }, status: 'onboarding', publishedAt: null
      });
      tx.create(MembershipEntity, { id: randomUUID(), user, restaurant, role: 'owner' });
      return { ok: true, accountCreated };
    });
  } catch (e) {
    if (e instanceof UniqueConstraintViolationException) {
      const constraint = (e as { constraint?: string }).constraint ?? e.message;
      return { ok: false, message: conflictMessage(constraint, input) };
    }
    throw e;
  }
}

/** Never lets a secret reach the output, whatever the driver put into its message. */
function scrub(message: string, env: NodeJS.ProcessEnv): string {
  let out = message;
  for (const secret of [env.USER_PASSWORD, env.DATABASE_URL]) if (secret) out = out.split(secret).join('[redacted]');
  return out;
}

/** Returns the process exit code: 0 on success, 1 on every error. */
export async function run(argv: string[], env: NodeJS.ProcessEnv, deps: BootstrapDeps): Promise<number> {
  const { input, errors } = parseInput(argv, env);
  if (errors.length) {
    for (const message of errors) console.error(`Error: ${scrub(message, env)}`);
    return 1;
  }
  let orm: MikroORM | undefined;
  try {
    orm = await deps.openOrm();
    if (await pendingMigrations(orm)) {
      console.error('Error: Pending migrations: run npm run db:migrate first.');
      return 1;
    }
    // The flag is not an excuse to skip the password when the account has to be created: `write` re-checks it there.
    const outcome = await write(orm, input, env.USER_PASSWORD ?? '');
    if (!outcome.ok) {
      console.error(`Error: ${outcome.message}`);
      return 1;
    }
    console.log(`Created restaurant "${input.name}" (slug: ${input.slug}, status: onboarding).`);
    console.log(outcome.accountCreated
      ? `Created account ${input.ownerEmail} as owner.`
      : `Account ${input.ownerEmail} already exists; its password is unchanged. Added as owner.`);
    console.log(`Sign in at /admin/${input.slug} (on your PUBLIC_BASE_URL).`);
    console.log('Next: the owner imports the menu on the Setup screen.');
    return 0;
  } catch (e) {
    console.error(`Error: ${scrub(e instanceof Error ? e.message : String(e), env)}`);
    return 1;
  } finally {
    await orm?.close(true);
  }
}
