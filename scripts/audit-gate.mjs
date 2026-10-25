#!/usr/bin/env node
/**
 * Dependency audit gate: `npm audit --omit=dev` must report nothing of high or critical severity
 * EXCEPT what is listed below, each with a reason and an expiry date. A new finding fails the build,
 * and so does a new advisory on a package that already has an exception (an exception names its advisories);
 * an expired exception fails it too, so a "temporary" risk cannot be forgotten.
 *
 *   npm run audit:gate
 */
import { spawnSync } from 'node:child_process';

const FAIL_ON = new Set(['high', 'critical']);

/** Advisories we have looked at and accepted for now. Keep this list short and honest. */
const ACCEPTED = [
  {
    // awilix → fast-glob → micromatch → braces. `braces@3.0.3` is the latest release and has no fix.
    // The flaw is a stack exhaustion on deeply nested glob patterns; we never call awilix's
    // loadModules/listModules (every dependency is registered by hand), so no glob pattern is ever evaluated.
    packages: ['awilix', 'fast-glob', 'micromatch', 'braces'],
    advisory: 'GHSA-vfj7-8cjw-p6xm',
    reason: 'unreachable: awilix glob loading is not used (container.ts registers every dependency explicitly)',
    expires: '2027-01-15'
  },
  {
    // Fixed in next >= 16.4.1 (published 2026-10-14), which is younger than the 14 days AGENTS.md §1.1 asks for until
    // 2026-10-28. Not deployed anywhere yet. Two of the three are unreachable here: there is no `use cache` and no
    // SVG through the image optimizer; the Server Actions denial of service does apply, hence the short expiry.
    packages: ['next'],
    advisory: ['GHSA-2464-fhr4-w9xw', 'GHSA-p3m5-59mp-jv5r', 'GHSA-673q-mjm6-r5xr'],
    reason: 'temporary: patched next is younger than 14 days (eligible 2026-10-28); no `use cache`, no SVG images; app not deployed',
    expires: '2026-10-29'
  },
  {
    // testcontainers → undici 7.30.0, a dependency of the test harness (packages/testkit), never shipped. Fixed in
    // undici >= 7.30.1 (published 2026-10-15), eligible under the 14-day rule on 2026-10-29.
    packages: ['undici'],
    advisory: ['GHSA-4qv8-2p9j-2685', 'GHSA-f72v-6w45-q472', 'GHSA-xjj6-f33q-929c'],
    reason: 'temporary: test harness only, never shipped; patched undici is younger than 14 days (eligible 2026-10-29)',
    expires: '2026-10-29'
  }
];

const run = spawnSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error('audit-gate: could not read the output of `npm audit` (is the registry reachable?)');
  console.error(run.stderr || run.stdout);
  process.exit(2);
}
if (report.error) {
  console.error(`audit-gate: npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
  process.exit(2);
}

const today = new Date().toISOString().slice(0, 10);
const accepted = new Map();
for (const a of ACCEPTED) for (const p of a.packages) accepted.set(p, a);

const findings = [];
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  if (!FAIL_ON.has(v.severity)) continue;
  const rule = accepted.get(name);
  if (!rule) findings.push(`${name} (${v.severity}): ${v.via.map((x) => (typeof x === 'string' ? x : x.title)).join('; ')}`);
  else if (rule.expires < today) findings.push(`${name}: the accepted exception for ${[].concat(rule.advisory).join(', ')} expired on ${rule.expires}. Fix it or renew the decision.`);
  else {
    const covered = new Set([].concat(rule.advisory));
    const extra = v.via.filter((x) => typeof x === 'object' && x.url).map((x) => x.url.split('/').pop()).filter((id) => !covered.has(id));
    if (extra.length) findings.push(`${name} (${v.severity}): ${extra.join(', ')} is not covered by the accepted exception (${[...covered].join(', ')}). Look at it before accepting it.`);
  }
}

const counts = report.metadata?.vulnerabilities ?? {};
if (findings.length) {
  console.error(`audit-gate FAILED (${findings.length}):`);
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
const waived = ACCEPTED.filter((a) => a.packages.some((p) => report.vulnerabilities?.[p]));
console.log(`audit-gate passed. high: ${counts.high ?? 0}, critical: ${counts.critical ?? 0}${waived.length ? ` (accepted: ${waived.map((a) => `${[].concat(a.advisory).join('+')} until ${a.expires}`).join(', ')})` : ''}`);
