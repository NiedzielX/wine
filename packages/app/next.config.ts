import type { NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// One .env for the whole monorepo (repo root). Variables already set in the environment win.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // Internal packages ship TypeScript sources; Next compiles them.
  transpilePackages: ['@wine-match/core', '@wine-match/db', '@wine-match/ui'],
  // MikroORM and the pg driver load drivers dynamically: keep them as Node externals.
  serverExternalPackages: ['@mikro-orm/core', '@mikro-orm/postgresql', '@mikro-orm/sql', 'pg', 'kysely'],
  experimental: {
    // spreadsheet and PDF uploads go through server actions (10 MB file + form fields)
    serverActions: { bodySizeLimit: '11mb' },
    // forbidden() and forbidden.tsx: a signed-in user without access to a restaurant gets a real 403
    authInterrupts: true,
    // TypeScript 7 is a native compiler without the classic JS API: type-check through the tsc CLI.
    useTypeScriptCli: true
  },
  async redirects() {
    // G2 (dish details) became part of G3: old links and printed material keep working (BACKWARD_COMPATIBILITY.md §1).
    // A config redirect is a real 308 and keeps the whole query string (preferences, `sid`, `sheet`).
    return [{ source: '/r/:slug/dish/:dishId', destination: '/r/:slug/dish/:dishId/wines', permanent: true }];
  },
  async headers() {
    const baseline = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
    ];
    // the dashboard and the auth API hold personal data and sessions: never cached, never framed
    const sensitive = [
      { key: 'Cache-Control', value: 'private, no-store' },
      { key: 'X-Frame-Options', value: 'DENY' }
    ];
    return [
      { source: '/:path*', headers: baseline },
      { source: '/admin/:path*', headers: sensitive },
      { source: '/api/v1/auth/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] }
    ];
  }
};

export default nextConfig;
