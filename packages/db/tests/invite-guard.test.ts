import { describe, expect, it } from 'vitest';
import { SeedRefusedError, assertInviteCommandAllowed } from '../src/seeders/seed-guard';

/** The environment rule of `npm run user:invite` is the seeder's: protected NODE_ENV needs ALLOW_DEMO_DATA=true. */
describe('assertInviteCommandAllowed', () => {
  const warnings: string[] = [];
  const warn = (m: string) => { warnings.push(m); };

  it.each(['development', 'test', ' development '])('allows NODE_ENV=%s', (NODE_ENV) => {
    expect(() => assertInviteCommandAllowed({ NODE_ENV }, warn)).not.toThrow();
  });

  it.each(['production', 'Production', 'prod', 'staging', 'typo'])('refuses NODE_ENV=%s without the explicit switch', (NODE_ENV) => {
    expect(() => assertInviteCommandAllowed({ NODE_ENV }, warn)).toThrow(SeedRefusedError);
    expect(() => assertInviteCommandAllowed({ NODE_ENV, ALLOW_DEMO_DATA: 'yes' }, warn)).toThrow(SeedRefusedError);
    expect(() => assertInviteCommandAllowed({ NODE_ENV, ALLOW_DEMO_DATA: 'false' }, warn)).toThrow(SeedRefusedError);
  });

  it('allows a protected environment with ALLOW_DEMO_DATA=true', () => {
    expect(() => assertInviteCommandAllowed({ NODE_ENV: 'production', ALLOW_DEMO_DATA: 'true' }, warn)).not.toThrow();
  });

  it('trims ALLOW_DEMO_DATA like the seeder does', () => {
    expect(() => assertInviteCommandAllowed({ NODE_ENV: 'production', ALLOW_DEMO_DATA: ' true ' }, warn)).not.toThrow();
  });

  it('warns and runs when NODE_ENV is unset or blank', () => {
    warnings.length = 0;
    assertInviteCommandAllowed({}, warn);
    assertInviteCommandAllowed({ NODE_ENV: '  ' }, warn);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('NODE_ENV is not set');
  });
});
