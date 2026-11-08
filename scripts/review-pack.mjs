#!/usr/bin/env node
/**
 * review:pack: the package a reviewer gets for one pull request (diff, spec section, checklist for the risk, CI),
 * without the author's title, description, comments or commit messages (lesson 17; `.ai/docs/review-protocol.md`).
 *
 * Usage: npm run review:pack -- <pr number> [--repo owner/name] [--out file [--force]] [--max-diff-bytes N]
 * Read-only: `gh api` GET requests (REST only). Needs `gh` signed in; the token is never read or printed here.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DEFAULT_REPO, MAX_DIFF_BYTES, buildReviewPack, createGhFetcher } from './lib/review-pack.mjs';

function repoFromRemote() {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/.exec(url)?.[1] ?? DEFAULT_REPO;
  } catch {
    return DEFAULT_REPO;
  }
}

const VALUE_FLAGS = new Set(['--repo', '--out', '--max-diff-bytes']);

/** Strict parsing: `--flag value` and `--flag=value`; unknown flags, missing values, values that look like flags, extra positionals are errors. */
export function parseArgs(argv) {
  const opts = { force: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    if (flag === '--force' && eq === -1) { opts.force = true; continue; }
    if (!VALUE_FLAGS.has(flag)) return { error: `unknown argument ${flag.slice(0, 40)}` };
    const val = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if (val === undefined || val === '' || val.startsWith('--')) return { error: `${flag} needs a value` };
    opts[flag.slice(2)] = val;
  }
  if (positional.length !== 1 || !/^\d+$/.test(positional[0])) return { error: 'give the pull request number, e.g. npm run review:pack -- 126' };
  return { opts, pr: positional[0] };
}

export async function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.error) {
    process.stderr.write(`review:pack: ${parsed.error}\n`);
    return 2;
  }
  const { pr, opts } = parsed;
  const value = (flag) => opts[flag.slice(2)];
  const repo = value('--repo') ?? process.env.GITHUB_REPOSITORY ?? repoFromRemote();
  // owner/name only; "." and ".." segments would walk the API path (repos/o/../x)
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.split('/').some((s) => s === '.' || s === '..')) {
    process.stderr.write('review:pack: --repo must look like owner/name (no "." or ".." segments)\n');
    return 2;
  }
  const rawMax = value('--max-diff-bytes');
  if (rawMax !== undefined && !/^[1-9]\d{0,9}$/.test(rawMax)) {
    process.stderr.write('review:pack: --max-diff-bytes must be a positive integer\n');
    return 2;
  }
  const maxDiffBytes = rawMax === undefined ? MAX_DIFF_BYTES : Number(rawMax);
  const out = value('--out');
  if (out === '-') {
    process.stderr.write('review:pack: --out - is not supported (it would create a file named "-"); omit --out to write to stdout\n');
    return 2;
  }
  const force = opts.force;
  // fail before any request: an existing file is never overwritten without --force
  if (out && !force && existsSync(out)) {
    process.stderr.write(`review:pack: ${out} already exists; pass --force to overwrite it\n`);
    return 2;
  }
  try {
    const pack = await buildReviewPack({ pr, repo, fetcher: createGhFetcher(), maxDiffBytes });
    if (out) writeFileSync(out, pack, { flag: force ? 'w' : 'wx' });
    else process.stdout.write(pack);
    return 0;
  } catch (error) {
    // only the first line, never the whole error object (it can carry the command line)
    process.stderr.write(`review:pack: could not build the pack for #${pr}: ${String(error?.message ?? error).split('\n')[0].slice(0, 200)}\n`);
    return 1;
  }
}

// fail closed: any doubt about the entry path runs main (lesson script-main-guard-vs-paths)
let direct = true;
try {
  direct = !process.argv[1] || import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
} catch { direct = true; }
if (direct) process.exitCode = await main(process.argv.slice(2));
