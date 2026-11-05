/** The restaurant that `global-setup.ts` creates with `npm run restaurant:create`, and its owner (spec E05-S01). */
export const NEW_RESTAURANT = {
  name: 'Bistro E2E',
  slug: 'bistro-e2e',
  address: 'ul. Testowa 1',
  city: 'Kraków',
  wineDirector: 'Anna Nowak',
  ownerEmail: 'anna@bistro-e2e.example',
  ownerName: 'Anna Nowak',
  // test-only value: this account exists only in the throwaway e2e database
  password: 'e2e-only-passphrase-2026'
} as const;

/**
 * The rest of Bistro E2E's team (spec E12 F1), made by the real operator command `npm run user:create` in global-setup:
 * a general manager and a Wine Director next to the owner. The e2e file `team.e2e.test.ts` changes their access and puts it back.
 */
export const NEW_RESTAURANT_TEAM = {
  manager: { email: 'marek@bistro-e2e.example', name: 'Marek Manager', role: 'manager' },
  sommelier: { email: 'sonia@bistro-e2e.example', name: 'Sonia Sommelier', role: 'sommelier' },
  // test-only value: these accounts exist only in the throwaway e2e database
  password: 'e2e-team-passphrase-2026'
} as const;
