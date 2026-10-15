/**
 * Creates a dashboard account (or gives an existing account access to another restaurant).
 *
 *   USER_PASSWORD='a long passphrase' npm run user:create -- \
 *     --email jan@example.com --name "Jan Kowalski" --role sommelier --restaurant halka
 *
 * The password is read from the USER_PASSWORD environment variable (never from the command line,
 * so it does not end up in the shell history or the process list). Minimum 12 characters.
 * An existing account keeps its password; only the membership is added.
 */
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MIN_PASSWORD_LENGTH } from '@wine-match/core';
import { hashPassword } from '../src/auth/scrypt';
import { MembershipEntity, RestaurantEntity, UserEntity } from '../src/entities';
import { closeOrm, getOrm } from '../src/orm';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const ROLES = ['owner', 'manager', 'sommelier', 'waiter'] as const;

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? '') : '';
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

async function main() {
  const email = arg('email').trim().toLowerCase();
  const name = arg('name').trim();
  const role = arg('role') as (typeof ROLES)[number];
  const slug = arg('restaurant').trim();
  const password = process.env.USER_PASSWORD ?? '';
  if (!/^\S+@\S+\.\S+$/.test(email)) fail('--email must be a valid e-mail address.');
  if (!name) fail('--name is required.');
  if (!ROLES.includes(role)) fail(`--role must be one of: ${ROLES.join(', ')}.`);
  if (!slug) fail('--restaurant (the public slug, e.g. halka) is required.');

  const orm = await getOrm();
  const em = orm.em.fork();
  try {
    const restaurant = await em.findOne(RestaurantEntity, { slug });
    if (!restaurant) fail(`No restaurant with slug "${slug}".`);
    let user = await em.findOne(UserEntity, { email });
    if (!user) {
      if (password.length < MIN_PASSWORD_LENGTH) fail(`Set USER_PASSWORD to a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      user = em.create(UserEntity, { id: randomUUID(), email, name, passwordHash: await hashPassword(password) });
      console.log(`Created account ${email}.`);
    } else {
      console.log(`Account ${email} already exists; its password is unchanged.`);
    }
    if (await em.findOne(MembershipEntity, { user, restaurant })) fail(`${email} already has access to ${slug}.`);
    em.create(MembershipEntity, { id: randomUUID(), user, restaurant, role });
    await em.flush();
    console.log(`${email} is now ${role} at ${restaurant.name}.`);
  } finally {
    await closeOrm();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
