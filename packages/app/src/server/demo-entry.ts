import { DEMO_PASSWORD, DEMO_USERS, can, type AppEnv, type AuthService, type Role } from '@wine-match/core';
import { env } from './env';

/**
 * The interactive demo instance (spec 2026-11-16-interactive-demo-entry): a start page `/start` and "Sign in as …" for the demo accounts.
 * Everything that decides whether it is on lives here, so a page, the sign-in action, `/` and the headers cannot disagree.
 */

/** The restaurant that has demo accounts and demo data: `/start` is only for it (R2). */
const DEMO_SLUG = 'halka';

/**
 * R1: the operator ran the instance with `ALLOW_DEMO_DATA=true` and it is not the read-only public demo (`SHOWCASE_MODE=demo`, which
 * has no accounts at all). The flag alone is not enough to open the demo accounts: see `demoAccounts` (R3).
 */
export function isInteractiveDemo(e: Pick<AppEnv, 'allowDemoData' | 'showcaseMode'> = env()): boolean {
  return e.allowDemoData === true && e.showcaseMode !== 'demo';
}

/** The slug `/start` and the demo sign-in serve, or null when the instance is not interactive or its demo restaurant is not Halka (R2: 404). */
export function demoStartSlug(e: Pick<AppEnv, 'allowDemoData' | 'showcaseMode' | 'demoRestaurantSlug'> = env()): string | null {
  return isInteractiveDemo(e) && e.demoRestaurantSlug === DEMO_SLUG ? e.demoRestaurantSlug : null;
}

/**
 * What a page may know about a demo account (R6, changed by the owner's review 2026-11-16): the public demo password, shown on purpose so
 * a visitor can copy it, and never the hash. The list is only ever built in interactive mode for accounts that exist here.
 */
export interface DemoAccount {
  key: string;
  name: string;
  role: Role;
  email: string;
  /** The public demo password (docs/DEPLOYMENT.md §12): only here, only in interactive mode. */
  password: string;
}

/**
 * The demo accounts that can be offered here (R3, R6): interactive mode, the account really exists in this repository (the service
 * asks, not the page) and its role opens the dashboard (a waiter does not). Empty on a real installation that merely has the flag set.
 */
export async function demoAccounts(auth: Pick<AuthService, 'panelAccountsAmong'>, e: Pick<AppEnv, 'allowDemoData' | 'showcaseMode' | 'demoRestaurantSlug'> = env()): Promise<DemoAccount[]> {
  if (!demoStartSlug(e)) return [];
  const panel = DEMO_USERS.filter((u) => can(u.role, 'panel.view'));
  const existing = await auth.panelAccountsAmong(panel.map((u) => u.email));
  return panel.filter((u) => existing.has(u.email)).map(({ key, name, role, email }) => ({ key, name, role, email, password: DEMO_PASSWORD }));
}
