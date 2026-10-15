import { vi } from 'vitest';

/**
 * Shared setup of the unit suite. The demo data source and quiet logs are set before any module is loaded, and
 * the Next.js request APIs are replaced by small fakes: cookies and headers live in plain maps, and the
 * redirect / notFound / forbidden helpers throw the same kind of signal the framework throws.
 */
process.env.DATA_SOURCE = 'memory';
process.env.AUTH_COOKIE_SECURE = 'false';
process.env.LOG_LEVEL = 'error';

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super('NEXT_REDIRECT');
    this.name = 'RedirectSignal';
  }
}
class NotFoundSignal extends Error {
  constructor() {
    super('NEXT_NOT_FOUND');
    this.name = 'NotFoundSignal';
  }
}
class ForbiddenSignal extends Error {
  constructor() {
    super('NEXT_FORBIDDEN');
    this.name = 'ForbiddenSignal';
  }
}

export const nextState = {
  cookies: new Map<string, string>(),
  headers: new Map<string, string>(),
  RedirectSignal,
  NotFoundSignal,
  ForbiddenSignal
};
(globalThis as { __wmNext?: typeof nextState }).__wmNext = nextState;

vi.mock('next/headers', () => {
  const s = (globalThis as { __wmNext: typeof nextState }).__wmNext;
  return {
    cookies: async () => ({
      get: (name: string) => (s.cookies.has(name) ? { name, value: s.cookies.get(name)! } : undefined),
      set: (name: string, value: string) => { s.cookies.set(name, value); },
      delete: (name: string) => { s.cookies.delete(name); }
    }),
    headers: async () => ({ get: (name: string) => s.headers.get(name) ?? null })
  };
});

vi.mock('next/navigation', () => {
  const s = (globalThis as { __wmNext: typeof nextState }).__wmNext;
  return {
    redirect: (url: string) => { throw new s.RedirectSignal(url); },
    notFound: () => { throw new s.NotFoundSignal(); },
    forbidden: () => { throw new s.ForbiddenSignal(); }
  };
});

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
