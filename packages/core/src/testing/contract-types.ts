/**
 * The slice of a test runner (Vitest) the shared contracts need. Typed here so the contracts, which live
 * in core and run in other packages, need no dependency on the runner and no `any`.
 */
export interface Matchers {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toMatchObject(expected: unknown): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toBeGreaterThan(n: number): void;
  toBeLessThanOrEqual(n: number): void;
  toBeInstanceOf(type: abstract new (...args: never[]) => unknown): void;
  not: Matchers;
  rejects: { toBeInstanceOf(type: abstract new (...args: never[]) => unknown): Promise<void>; toMatchObject(expected: unknown): Promise<void> };
}

export interface ContractRunner {
  describe: (name: string, body: () => void) => void;
  it: (name: string, body: () => Promise<void>) => void;
  expect: (value: unknown) => Matchers;
  beforeEach: (body: () => Promise<void>) => void;
}

/** `repositoryContract` runs its setup once per file instead of per test. */
export interface OnceRunner extends Omit<ContractRunner, 'beforeEach'> {
  beforeAll: (body: () => Promise<void>) => void;
  afterAll: (body: () => Promise<void>) => void;
}
