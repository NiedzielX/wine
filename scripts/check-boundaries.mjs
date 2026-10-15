#!/usr/bin/env node
/**
 * Enforces package boundaries (AGENTS.md, "Architektura"). Fails the build on violation.
 * Checks static and dynamic imports in packages/<name>/src (and tests).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

/** forbidden import specifiers (prefix match) per package */
const RULES = {
  core: ['react', 'react-dom', 'next', '@mikro-orm/', 'pg', 'awilix', '@wine-match/db', '@wine-match/ui', '@wine-match/app', 'node:'],
  db: ['react', 'react-dom', 'next', 'awilix', '@wine-match/ui', '@wine-match/app'],
  ui: ['next', '@mikro-orm/', 'pg', 'awilix', '@wine-match/core', '@wine-match/db', '@wine-match/app', 'node:'],
  mockups: ['@wine-match/db', '@wine-match/ui', '@wine-match/app', '@mikro-orm/', 'next', 'react'],
  app: []
};

/** extra rules for files inside packages/app */
const APP_RULES = [
  // guest pages use Tailwind only: no shadcn components
  { dir: 'src/app/(guest)', forbid: ['@wine-match/ui/components', '@wine-match/ui/styles.css'], allow: ['@wine-match/ui/brand/'], forbidIndex: '@wine-match/ui' },
  // only the composition root and route handlers touch the database package
  { dir: 'src/app', forbid: ['@wine-match/db', '@mikro-orm/'] }
];

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

function* files(dir) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.next' || e === 'dist') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(e)) yield p;
  }
}

const matches = (spec, prefix) => spec === prefix || spec.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`) || (prefix.endsWith(':') && spec.startsWith(prefix));
const violations = [];

for (const [pkg, forbidden] of Object.entries(RULES)) {
  const base = join(root, 'packages', pkg);
  for (const dir of ['src', 'tests']) {
    for (const file of files(join(base, dir))) {
      const rel = relative(base, file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(IMPORT_RE)) {
        const spec = m[1] ?? m[2] ?? m[3];
        if (pkg === 'core' && rel.startsWith('tests') && spec === 'vitest') continue;
        for (const f of forbidden) if (matches(spec, f)) violations.push(`${pkg}/${rel}: imports "${spec}" (forbidden in ${pkg})`);
        if (pkg === 'app') {
          for (const r of APP_RULES) {
            if (!rel.startsWith(r.dir)) continue;
            if (r.allow?.some((a) => spec.startsWith(a))) continue;
            if (r.forbidIndex && spec === r.forbidIndex) violations.push(`app/${rel}: imports "${spec}" (guest pages may only use @wine-match/ui/brand/*)`);
            for (const f of r.forbid) if (matches(spec, f)) violations.push(`app/${rel}: imports "${spec}" (forbidden in ${r.dir})`);
          }
        }
      }
    }
  }
}

// Next.js bundles @wine-match/core separately per route, so `instanceof SomeDomainError` silently fails
// across the shared DI container (lesson nextjs-duplicate-module-instanceof): use server/domain-errors.ts.
for (const file of files(join(root, 'packages', 'app', 'src'))) {
  const rel = relative(join(root, 'packages', 'app'), file);
  if (rel.endsWith('domain-errors.ts')) continue;
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/instanceof\s+(?!Error\b)(\w*Error)\b/g)) violations.push(`app/${rel}: \`instanceof ${m[1]}\` (use domainError() from @/server/domain-errors)`);
}

if (violations.length) {
  console.error(`Package boundary violations (${violations.length}):\n  ${violations.join('\n  ')}`);
  process.exit(1);
}
console.log('Package boundaries OK');
