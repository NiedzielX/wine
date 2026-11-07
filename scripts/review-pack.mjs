#!/usr/bin/env node
/**
 * review:pack: the package a reviewer gets for one pull request (diff, spec section, checklist for the risk, CI),
 * without the author's title, description, comments or commit messages (lesson 17; `.ai/docs/review-protocol.md`).
 *
 * Usage: npm run review:pack -- <pr number> [--repo owner/name] [--out file] [--max-diff-bytes N]
 * Read-only: `gh api` GET requests (REST only). Needs `gh` signed in; the token is never read or printed here.
 */
import { execFileSync } from 'node:child_process';
import { realpathSync, writeFileSync } from 'node:fs';
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

export async function main(argv) {
  const value = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const flagValues = new Set(['--repo', '--out', '--max-diff-bytes'].map((f) => argv.indexOf(f) + 1).filter((i) => i > 0));
  const pr = argv.find((a, i) => !a.startsWith('--') && !flagValues.has(i));
  if (!pr || !/^\d+$/.test(pr)) {
    process.stderr.write('review:pack: give the pull request number, e.g. npm run review:pack -- 126\n');
    return 2;
  }
  const repo = value('--repo') ?? process.env.GITHUB_REPOSITORY ?? repoFromRemote();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    process.stderr.write('review:pack: --repo must look like owner/name\n');
    return 2;
  }
  const maxDiffBytes = value('--max-diff-bytes') ? Number(value('--max-diff-bytes')) : MAX_DIFF_BYTES;
  try {
    const pack = await buildReviewPack({ pr, repo, fetcher: createGhFetcher(), maxDiffBytes });
    const out = value('--out');
    if (out) writeFileSync(out, pack);
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
