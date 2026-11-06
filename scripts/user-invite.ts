/**
 * Operator command (spec E12 F2, "skrypt demo"): issues an invitation and prints its one-time accept link.
 *
 *   npm run user:invite -- --restaurant halka --email new@example.com --role sommelier --as owner@example.com
 *
 * It goes through the same `InvitationService.invite` as the panel (A15) and the API, with the inviter named by `--as` as the actor:
 * the service checks that this account is an active member with `team.manage` and may grant the role. The link is built from
 * `PUBLIC_BASE_URL` (fail closed, like the application) and is the ONLY thing written to stdout; messages go to stderr. The token
 * is never logged, and an unexpected error is printed without its message (a database error repeats bound values).
 * Environment guard: the seeder's rule (`assertInviteCommandAllowed`): a protected NODE_ENV needs ALLOW_DEMO_DATA=true.
 * Needs DATA_SOURCE=postgres: on the memory source the invitation would die with this process.
 */
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { INVITABLE_ROLES, type AuthRepository, type InvitationService, type Role } from '@wine-match/core';
import { domainError } from '../packages/app/src/server/domain-errors';
import { SeedRefusedError, assertInviteCommandAllowed } from '@wine-match/db';

type Environment = Record<string, string | undefined>;

/** What the command needs from the application: one request scope, the link builder and the data source. */
export interface InviteDeps {
  dataSource: () => 'memory' | 'postgres';
  openScope: () => Promise<{ invitationService: InvitationService; authRepository: Pick<AuthRepository, 'findUserByEmail'>; dispose: () => Promise<void> }>;
  linkFor: (token: string) => string;
  close: () => Promise<void>;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = 'Usage: npm run user:invite -- --restaurant <slug> --email <email> --role <owner|manager|sommelier> --as <email of an active owner or manager of the restaurant>';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns the exit code. */
export async function run(argv: string[], environment: Environment, deps: InviteDeps, warn: (m: string) => void = deps.err): Promise<number> {
  try {
    assertInviteCommandAllowed(environment, warn);
  } catch (e) {
    if (e instanceof SeedRefusedError) { deps.err(e.message); return 1; }
    throw e;
  }
  let values: { restaurant?: string; email?: string; role?: string; as?: string };
  try {
    ({ values } = parseArgs({ args: argv, options: { restaurant: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' }, as: { type: 'string' } }, strict: true }));
  } catch (e) {
    deps.err(`${(e as Error).message}\n${USAGE}`);
    return 1;
  }
  const slug = (values.restaurant ?? '').trim();
  const email = (values.email ?? '').trim().toLowerCase();
  const inviter = (values.as ?? '').trim().toLowerCase();
  const role = (values.role ?? '').trim() as Role;
  const problems: string[] = [];
  if (!slug) problems.push('--restaurant (the public slug) is required.');
  if (!EMAIL.test(email)) problems.push('--email must be a valid e-mail address.');
  if (!EMAIL.test(inviter)) problems.push('--as must be the e-mail address of the account that invites.');
  if (!INVITABLE_ROLES.includes(role)) problems.push(`--role must be one of: ${INVITABLE_ROLES.join(', ')}.`);
  if (problems.length) { deps.err(`${problems.join('\n')}\n${USAGE}`); return 1; }

  let scope: Awaited<ReturnType<InviteDeps['openScope']>> | undefined;
  try {
    if (deps.dataSource() !== 'postgres') { deps.err('Set DATA_SOURCE=postgres (and DATABASE_URL): on the memory data source an invitation would not outlive this command.'); return 1; }
    deps.linkFor('probe'); // PUBLIC_BASE_URL must be valid BEFORE a token exists that nobody could print
    scope = await deps.openScope();
    const user = await scope.authRepository.findUserByEmail(inviter);
    if (!user) { deps.err(`No account ${inviter} to invite as.`); return 1; }
    const { invitation, token } = await scope.invitationService.invite(slug, { email, role }, { id: user.id, name: user.name });
    deps.err(`Invitation for ${invitation.email} as ${invitation.role}; the link works once and expires at ${invitation.expiresAt}. Pass it on privately.`);
    deps.out(deps.linkFor(token));
    return 0;
  } catch (e) {
    const known = domainError(e);
    // domain errors (Forbidden, NotFound, AlreadyMember, Validation...) carry a safe message; anything else is not echoed (a driver error repeats bound values)
    if (known) deps.err(`Error: ${known.message}`);
    else deps.err(`Error: the invitation was not issued (${e instanceof Error ? e.name : 'unknown error'}); check DATABASE_URL, the migrations and PUBLIC_BASE_URL.`);
    return 1;
  } finally {
    await scope?.dispose().catch(() => undefined);
    await deps.close().catch(() => undefined);
  }
}

async function main(): Promise<number> {
  const rootEnv = fileURLToPath(new URL('../.env', import.meta.url));
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  const { createRequestScope } = await import('../packages/app/src/server/container');
  const { env } = await import('../packages/app/src/server/env');
  const { invitationLink } = await import('../packages/app/src/server/invitations');
  const { closeOrm } = await import('@wine-match/db');
  return run(process.argv.slice(2), process.env, {
    dataSource: () => env().dataSource,
    openScope: async () => {
      const scope = await createRequestScope();
      return { invitationService: scope.cradle.invitationService, authRepository: scope.cradle.authRepository, dispose: () => scope.dispose() };
    },
    linkFor: invitationLink,
    close: closeOrm,
    out: (line) => { process.stdout.write(`${line}\n`); },
    err: (line) => { process.stderr.write(`${line}\n`); }
  });
}

// run only when started directly, not when a test imports `run` (lesson 2026-11-05-script-main-guard-vs-paths)
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }, () => {
    process.stderr.write('Error: the command could not start (configuration or database).\n');
    process.exitCode = 1;
  });
}
