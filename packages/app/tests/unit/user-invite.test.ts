import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { run, type InviteDeps } from '../../../../scripts/user-invite';
import { createRequestScope } from '@/server/container';
import { invitationLink } from '@/server/invitations';

/**
 * `npm run user:invite` (E12 F2 "skrypt demo") on the memory data source, through the real InvitationService from the container:
 * the guard, the argument checks, the actor rule, and that the token reaches stdout only as the link.
 */
const GOOD = ['--restaurant', 'halka', '--email', 'New.Person@Example.com', '--role', 'sommelier', '--as', 'tomasz@halka.pl'];

function harness(overrides: Partial<InviteDeps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  let opened = 0;
  const deps: InviteDeps = {
    dataSource: () => 'postgres',
    openScope: async () => {
      opened++;
      const scope = await createRequestScope();
      return { invitationService: scope.cradle.invitationService, authRepository: scope.cradle.authRepository, dispose: () => scope.dispose() };
    },
    linkFor: invitationLink,
    close: async () => undefined,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    ...overrides
  };
  return { deps, out, err, opened: () => opened };
}

describe('user:invite', () => {
  it('issues the invitation as the named account and prints only the link to stdout', async () => {
    const h = harness();
    expect(await run(GOOD, { NODE_ENV: 'development' }, h.deps)).toBe(0);
    expect(h.out).toHaveLength(1);
    const url = new URL(h.out[0]);
    expect(url.origin + url.pathname).toBe(`${new URL(invitationLink('x')).origin}/admin/accept`);
    const token = url.searchParams.get('token')!;
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(h.err.join('\n')).not.toContain(token);
    // the link is live: the service offers it, and the audit trail names the inviter
    const scope = await createRequestScope();
    try {
      expect(await scope.cradle.invitationService.offer(token)).toMatchObject({ email: 'new.person@example.com', role: 'sommelier', accountExists: false });
      const pending = await scope.cradle.invitationService.list('halka', { id: (await scope.cradle.authRepository.findUserByEmail('tomasz@halka.pl'))!.id, name: 'Tomasz Lis' });
      expect(pending.map((i) => i.email)).toContain('new.person@example.com');
      expect(JSON.stringify(pending)).not.toContain(createHash('sha256').update(token).digest('base64url'));
    } finally { await scope.dispose(); }
  });

  it('refuses a protected NODE_ENV before opening anything, and allows it only with ALLOW_DEMO_DATA=true', async () => {
    for (const NODE_ENV of ['production', 'Production', 'staging']) {
      const h = harness();
      expect(await run(GOOD, { NODE_ENV }, h.deps)).toBe(1);
      expect(h.opened()).toBe(0);
      expect(h.out).toEqual([]);
      expect(h.err.join('\n')).toContain('Refusing to issue an invitation');
    }
    const allowed = harness();
    expect(await run(['--restaurant', 'halka', '--email', 'second@example.com', '--role', 'sommelier', '--as', 'tomasz@halka.pl'], { NODE_ENV: 'production', ALLOW_DEMO_DATA: 'true' }, allowed.deps)).toBe(0);
    expect(allowed.out).toHaveLength(1);
  });

  it('with NODE_ENV unset it runs and warns', async () => {
    const h = harness();
    const warnings: string[] = [];
    expect(await run(['--restaurant', 'halka', '--email', 'third@example.com', '--role', 'sommelier', '--as', 'tomasz@halka.pl'], {}, h.deps, (m) => warnings.push(m))).toBe(0);
    expect(warnings.join('')).toContain('NODE_ENV is not set');
  });

  it.each([
    ['a missing restaurant', ['--email', 'a@b.co', '--role', 'sommelier', '--as', 'tomasz@halka.pl'], '--restaurant'],
    ['a bad e-mail', ['--restaurant', 'halka', '--email', 'nope', '--role', 'sommelier', '--as', 'tomasz@halka.pl'], '--email'],
    ['a role that has no link', ['--restaurant', 'halka', '--email', 'a@b.co', '--role', 'waiter', '--as', 'tomasz@halka.pl'], '--role'],
    ['a missing inviter', ['--restaurant', 'halka', '--email', 'a@b.co', '--role', 'sommelier'], '--as'],
    ['an unknown flag', [...GOOD, '--password', 'x'], 'password']
  ])('rejects %s without opening a scope', async (_n, args, mention) => {
    const h = harness();
    expect(await run(args, { NODE_ENV: 'test' }, h.deps)).toBe(1);
    expect(h.opened()).toBe(0);
    expect(h.err.join('\n')).toContain(mention);
    expect(h.out).toEqual([]);
  });

  it('refuses the memory data source and an unknown inviter', async () => {
    const memory = harness({ dataSource: () => 'memory' });
    expect(await run(GOOD, { NODE_ENV: 'test' }, memory.deps)).toBe(1);
    expect(memory.err.join('\n')).toContain('DATA_SOURCE=postgres');
    const unknown = harness();
    expect(await run(GOOD.map((a) => (a === 'tomasz@halka.pl' ? 'ghost@halka.pl' : a)), { NODE_ENV: 'test' }, unknown.deps)).toBe(1);
    expect(unknown.err.join('\n')).toContain('No account ghost@halka.pl');
    expect(unknown.out).toEqual([]);
  });

  it('the service decides: a sommelier may not invite, a manager may not invite an owner', async () => {
    const pendingFor = async (email: string) => {
      const scope = await createRequestScope();
      try {
        const tomasz = (await scope.cradle.authRepository.findUserByEmail('tomasz@halka.pl'))!;
        return (await scope.cradle.invitationService.list('halka', { id: tomasz.id, name: tomasz.name })).filter((i) => i.email === email);
      } finally { await scope.dispose(); }
    };
    const sommelier = harness();
    expect(await run(GOOD.map((a) => (a === 'tomasz@halka.pl' ? 'marta@halka.pl' : a)), { NODE_ENV: 'test' }, sommelier.deps)).toBe(1);
    expect(sommelier.out).toEqual([]);
    expect(sommelier.err.join('\n')).toBe('Error: You do not have permission to do this.');
    const hierarchy = harness();
    const ownerArgs = GOOD.map((a) => (a === 'sommelier' ? 'owner' : a === 'New.Person@Example.com' ? 'denied.owner@example.com' : a));
    expect(await run(ownerArgs, { NODE_ENV: 'test' }, hierarchy.deps)).toBe(1);
    expect(hierarchy.out).toEqual([]);
    expect(hierarchy.err.join('\n')).toBe('Error: Your role may not change this person or grant this role.');
    expect(await pendingFor('denied.owner@example.com')).toEqual([]);
    expect(await pendingFor('new.person@example.com')).toHaveLength(1); // only the first test's invitation exists: Marta's attempt stored nothing
  });

  it('fails before issuing when PUBLIC_BASE_URL is unusable, and does not echo an unexpected error message', async () => {
    const badBase = harness({ linkFor: () => { throw new Error('PUBLIC_BASE_URL: nope'); } });
    expect(await run(GOOD, { NODE_ENV: 'test' }, badBase.deps)).toBe(1);
    expect(badBase.opened()).toBe(0);
    const driver = harness({ openScope: async () => { throw new Error('insert into auth_token values (hash-SECRET-123)'); } });
    expect(await run(GOOD, { NODE_ENV: 'test' }, driver.deps)).toBe(1);
    expect(driver.err.join('\n')).not.toContain('SECRET-123');
  });

  it('when writing the link fails after the invitation exists, it says so instead of "not issued"', async () => {
    const h = harness({ out: () => { throw new Error('EPIPE'); } });
    expect(await run(['--restaurant', 'halka', '--email', 'epipe@example.com', '--role', 'sommelier', '--as', 'tomasz@halka.pl'], { NODE_ENV: 'test' }, h.deps)).toBe(1);
    const text = h.err.join('\n');
    expect(text).toContain('was issued but its link could not be written');
    expect(text).not.toContain('was not issued');
  });
});
