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
