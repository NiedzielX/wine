#!/usr/bin/env node
/**
 * Dependency audit gate: `npm audit --omit=dev` must report nothing of high or critical severity
 * EXCEPT what is listed below, each with a reason and an expiry date. A new finding fails the build;
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
  else if (rule.expires < today) findings.push(`${name}: the accepted exception for ${rule.advisory} expired on ${rule.expires}. Fix it or renew the decision.`);
}

const counts = report.metadata?.vulnerabilities ?? {};
if (findings.length) {
  console.error(`audit-gate FAILED (${findings.length}):`);
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
const waived = ACCEPTED.filter((a) => a.packages.some((p) => report.vulnerabilities?.[p]));
console.log(`audit-gate passed. high: ${counts.high ?? 0}, critical: ${counts.critical ?? 0}${waived.length ? ` (accepted: ${waived.map((a) => `${a.advisory} until ${a.expires}`).join(', ')})` : ''}`);
