import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * AGENTS.md §3: `status: approved` is set only by a human. The hook (`.claude/hooks/spec-status-guard.mjs`, PreToolUse for
 * Edit|Write|MultiEdit) refuses an agent edit under `.ai/specs/` whose RESULT has `status: approved` while the file on disk does
 * not. Like the Bash hook it is tested only with tool calls as data on stdin; the fixtures live in a temporary directory.
 */
const root = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const HOOK = root('.claude/hooks/spec-status-guard.mjs');

type Payload = { tool_name: string; tool_input: Record<string, unknown>; cwd?: string };
type Decide = (payload: unknown, deps?: unknown) => string | null;
const load = async () => (await import(pathToFileURL(HOOK).href)) as { decide: Decide; specStatus: (text: string) => string | null };

function run(stdin: string, hook = HOOK) {
  const r = spawnSync('node', [hook], { input: stdin, encoding: 'utf8' });
  return { code: r.status, stderr: r.stderr };
}
const cli = (p: Payload) => run(JSON.stringify(p));

const spec = (status: string, body = 'Body.\n') => `---\nstatus: ${status}\ncreated: 2026-11-08\n---\n\n# Title\n\n${body}`;

let dir: string;
const at = (rel: string) => join(dir, rel);
const put = (rel: string, text: string) => {
  mkdirSync(dirname(at(rel)), { recursive: true });
  writeFileSync(at(rel), text);
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'spec-guard-'));
  put('.ai/specs/2026-11-08-draft.md', spec('draft'));
  put('.ai/specs/2026-11-08-approved.md', spec('approved'));
  put('.ai/specs/2026-11-08-progress.md', spec('in-progress'));
  put('.ai/specs/2026-11-08-crlf.md', spec('draft').replace(/\n/g, '\r\n'));
  put('.ai/specs/product-brief.md', '# Brief\n\nNo frontmatter here.\n');
  put('.ai/specs/implemented/2026-11-01-done.md', spec('implemented'));
  put('.ai/specs/archive/2026-11-01-old.md', spec('abandoned'));
  put('docs/note.md', spec('draft'));
  put('with space/.ai/specs/2026-11-08-draft.md', spec('draft'));
  put('with space/.ai/specs/2026-11-08-approved.md', spec('approved'));
  mkdirSync(at('.ai/specs/a-directory.md'), { recursive: true });
  symlinkSync(at('.ai/specs'), at('alias'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const edit = (rel: string, oldString: string, newString: string, extra: Record<string, unknown> = {}): Payload => ({
  tool_name: 'Edit', cwd: dir, tool_input: { file_path: at(rel), old_string: oldString, new_string: newString, ...extra }
});
const write = (rel: string, content: string): Payload => ({ tool_name: 'Write', cwd: dir, tool_input: { file_path: at(rel), content } });
const multi = (rel: string, edits: Array<Record<string, unknown>>): Payload => ({ tool_name: 'MultiEdit', cwd: dir, tool_input: { file_path: at(rel), edits } });
const E = (o: string, n: string, extra: Record<string, unknown> = {}) => ({ old_string: o, new_string: n, ...extra });

const DRAFT = '.ai/specs/2026-11-08-draft.md';
const APPROVED = '.ai/specs/2026-11-08-approved.md';
const PROGRESS = '.ai/specs/2026-11-08-progress.md';

const BLOCKED: Array<[string, () => Payload]> = [
  ['draft -> approved (Edit)', () => edit(DRAFT, 'status: draft', 'status: approved')],
  ['in-progress -> approved (Edit)', () => edit(PROGRESS, 'status: in-progress', 'status: approved')],
  ['draft -> approved (Write of the whole file)', () => write(DRAFT, spec('approved'))],
  ['a new file written as approved', () => write('.ai/specs/2026-11-09-new.md', spec('approved'))],
  ['a new file in a new subdirectory', () => write('.ai/specs/research/2026-11-09-new.md', spec('approved'))],
  ['Edit that creates a file (empty old_string) as approved', () => edit('.ai/specs/2026-11-09-created.md', '', spec('approved'))],
  ['MultiEdit: the second edit sets approved', () => multi(DRAFT, [E('# Title', '# New title'), E('status: draft', 'status: approved')])],
  ['MultiEdit: a later edit builds approved from an earlier one', () => multi(DRAFT, [E('status: draft', 'status: appr'), E('status: appr', 'status: approved')])],
  ['MultiEdit with replace_all', () => multi(DRAFT, [E('draft', 'approved', { replace_all: true })])],
  ['Edit with replace_all', () => edit(DRAFT, 'draft', 'approved', { replace_all: true })],
  ['a quoted value', () => edit(DRAFT, 'status: draft', 'status: "approved"')],
  ['a single-quoted value', () => edit(DRAFT, 'status: draft', "status: 'approved'")],
  ['a trailing comment', () => edit(DRAFT, 'status: draft', 'status: approved # by me')],
  ['another letter case', () => edit(DRAFT, 'status: draft', 'status: Approved')],
  ['a quoted key', () => edit(DRAFT, 'status: draft', '"status": approved')],
  ['no space after the colon, trailing spaces', () => edit(DRAFT, 'status: draft', 'status:approved   ')],
  ['CRLF line endings', () => write('.ai/specs/2026-11-09-crlf.md', spec('approved').replace(/\n/g, '\r\n'))],
  ['CRLF file edited to approved', () => edit('.ai/specs/2026-11-08-crlf.md', 'status: draft', 'status: approved')],
  ['a byte order mark before the frontmatter', () => write('.ai/specs/2026-11-09-bom.md', `﻿${spec('approved')}`)],
  ['an Edit whose old_string does not match but whose new_string says approved', () => edit(DRAFT, 'status: nothing-like-this', 'status: approved')],
  ['a relative path', () => ({ tool_name: 'Edit', cwd: dir, tool_input: { file_path: DRAFT, old_string: 'status: draft', new_string: 'status: approved' } })],
  ['a path with ./ and ..', () => ({ tool_name: 'Edit', cwd: dir, tool_input: { file_path: `docs/../.ai/./specs/2026-11-08-draft.md`, old_string: 'status: draft', new_string: 'status: approved' } })],
  ['another letter case of the directory', () => write('.AI/SPECS/2026-11-09-upper.md', spec('approved'))],
  ['through a symlink to the specs directory', () => write('alias/2026-11-09-link.md', spec('approved'))],
  ['a directory with a space in its name', () => edit('with space/.ai/specs/2026-11-08-draft.md', 'status: draft', 'status: approved')],
  ['an approved spec that is first made draft: the second step is the one blocked', () => edit(DRAFT, 'status: draft', 'status: approved\nstatus: draft')],
  // malformed frontmatter under .ai/specs: the status cannot be verified, so it is refused
  ['unterminated frontmatter', () => write('.ai/specs/2026-11-09-bad.md', '---\nstatus: draft\n\n# no closing line\n')],
  ['two status keys', () => write('.ai/specs/2026-11-09-two.md', '---\nstatus: draft\nstatus: approved\n---\n')],
  ['a block scalar status', () => write('.ai/specs/2026-11-09-block.md', '---\nstatus: >\n  approved\n---\n')],
  ['an empty status followed by an indented value', () => write('.ai/specs/2026-11-09-empty.md', '---\nstatus:\n  approved\n---\n')],
  ['a status with a YAML tag', () => write('.ai/specs/2026-11-09-tag.md', '---\nstatus: !!str approved\n---\n')],
  ['an Edit that breaks the closing line', () => edit(DRAFT, 'created: 2026-11-08\n---', 'created: 2026-11-08')]
];

const ALLOWED: Array<[string, () => Payload]> = [
  ['approved -> in-progress', () => edit(APPROVED, 'status: approved', 'status: in-progress')],
  ['approved -> draft', () => edit(APPROVED, 'status: approved', 'status: draft')],
  ['a body edit of an approved spec', () => edit(APPROVED, 'Body.', 'Body, changed.')],
  ['a MultiEdit of the body of an approved spec', () => multi(APPROVED, [E('Body.', 'One.'), E('# Title', '# Other')])],
  ['Write of an approved spec that stays approved', () => write(APPROVED, spec('approved', 'New body.\n'))],
  ['a body edit that mentions "status: approved" in prose of a draft', () => edit(DRAFT, 'Body.', 'Only a human writes `status: approved` in the header.')],
  ['a draft body edit', () => edit(DRAFT, 'Body.', 'More.')],
  ['draft -> in-progress', () => edit(DRAFT, 'status: draft', 'status: in-progress')],
  ['draft -> draft (Write)', () => write(DRAFT, spec('draft', 'Other.\n'))],
  ['a new draft file', () => write('.ai/specs/2026-11-09-new-draft.md', spec('draft'))],
  ['a new file without any status', () => write('.ai/specs/2026-11-09-nostatus.md', '---\ncreated: 2026-11-09\n---\n\n# x\n')],
  ['a file without frontmatter (the brief)', () => edit('.ai/specs/product-brief.md', 'No frontmatter here.', 'Still none.')],
  ['a status whose value only begins with "approved"', () => write('.ai/specs/2026-11-09-prefix.md', spec('approved-pending'))],
  ['a failed Edit (no match) that does not mention approved', () => edit(DRAFT, 'text that is not in the file', 'text')],
  ['a failed Edit (no match) on an approved spec', () => edit(APPROVED, 'text that is not in the file', 'status: approved')],
  ['implemented/ path, even with approved in the text', () => write('.ai/specs/implemented/2026-11-01-done.md', spec('approved'))],
  ['implemented/ new file', () => write('.ai/specs/implemented/2026-11-09-new.md', spec('implemented'))],
  ['archive/ path', () => edit('.ai/specs/archive/2026-11-01-old.md', 'status: abandoned', 'status: superseded')],
  ['a non-spec file with status: approved', () => edit('docs/note.md', 'status: draft', 'status: approved')],
  ['a path outside .ai/specs with a broken header', () => write('docs/broken.md', '---\nstatus: approved\n(no closing line)\n')],
  ['a directory that only looks like the specs directory', () => write('.ai/specs-notes/x.md', spec('approved'))],
  ['a spec in a directory with a space (body edit)', () => edit('with space/.ai/specs/2026-11-08-approved.md', 'Body.', 'Body 2.')],
  ['a Windows-style path outside .ai/specs', () => ({ tool_name: 'Write', cwd: dir, tool_input: { file_path: 'docs\\x.md', content: spec('approved') } })],
  ['a tool the hook does not guard', () => ({ tool_name: 'Read', cwd: dir, tool_input: { file_path: at(DRAFT) } })],
  ['a CRLF spec body edit', () => edit('.ai/specs/2026-11-08-crlf.md', 'Body.', 'Body 2.')]
];

describe('spec-status-guard decide(): who may write `status: approved` (AGENTS.md §3)', () => {
  for (const [name, make] of BLOCKED) {
    it(`blocks: ${name}`, async () => {
      const { decide } = await load();
      const reason = decide(make());
      expect(reason, name).toEqual(expect.any(String));
      expect(reason).not.toBe('');
    });
  }
  for (const [name, make] of ALLOWED) {
    it(`allows: ${name}`, async () => {
      const { decide } = await load();
      expect(decide(make()), name).toBeNull();
    });
  }

  it('reads the disk only for paths under .ai/specs (it cannot fail for a file elsewhere)', async () => {
    const { decide } = await load();
    const reads: string[] = [];
    const deps = { read: (p: string) => { reads.push(p); throw new Error('boom'); }, real: (p: string) => p };
    expect(decide(write('docs/x.md', spec('approved')), deps)).toBeNull();
    expect(decide(write('.ai/specs/implemented/x.md', spec('approved')), deps)).toBeNull();
    expect(reads).toEqual([]);
    expect(() => decide(write(DRAFT, spec('approved')), deps)).toThrow('boom');
  });

  it('names the rule and what to do in the message', async () => {
    const { decide } = await load();
    const reason = decide(edit(DRAFT, 'status: draft', 'status: approved'))!;
    expect(reason).toContain('AGENTS.md §3');
    expect(reason).toContain('człowiek');
    expect(reason).toContain('draft');
  });

  it('says that the header is unreadable, not that approval is missing, for malformed frontmatter', async () => {
    const { decide } = await load();
    expect(decide(write('.ai/specs/2026-11-09-bad.md', '---\nstatus: draft\n'))!).toMatch(/nagłówek/);
  });

  it('fails closed (throws) on a payload it cannot read when the path is under .ai/specs', async () => {
    const { decide } = await load();
    expect(() => decide({ tool_name: 'Edit', cwd: dir, tool_input: { file_path: at(DRAFT) } })).toThrow();
    expect(() => decide({ tool_name: 'Write', cwd: dir, tool_input: { file_path: at(DRAFT), content: 42 } })).toThrow();
    expect(() => decide({ tool_name: 'MultiEdit', cwd: dir, tool_input: { file_path: at(DRAFT), edits: [] } })).toThrow();
    expect(() => decide({ tool_name: 'MultiEdit', cwd: dir, tool_input: { file_path: at(DRAFT), edits: [{ old_string: 'a' }] } })).toThrow();
    expect(() => decide({ tool_name: 'Write', cwd: dir, tool_input: { content: spec('approved') } })).toThrow();
  });

  it('parses a header the way the hook promises', async () => {
    const { specStatus } = await load();
    expect(specStatus(spec('draft'))).toBe('draft');
    expect(specStatus(spec('"Approved" # note'))).toBe('approved');
    expect(specStatus('# no header\n')).toBeNull();
    expect(specStatus('---\ncreated: x\n---\n')).toBeNull();
    expect(() => specStatus('---\nstatus: draft\n')).toThrow();
  });
});

describe('spec-status-guard as a command (what Claude Code runs)', () => {
  it.each(BLOCKED.slice(0, 8))('blocks with exit code 2 and tells the model why: %s', (_name, make) => {
    const r = cli(make());
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/Nie próbuj obejść/);
    expect(r.stderr).toMatch(/Zablokowane/);
  });

  it.each(ALLOWED.slice(0, 8))('lets through with exit code 0: %s', (_name, make) => {
    const r = cli(make());
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
  });

  it('never writes to the spec it inspects', () => {
    const before = readFileSync(at(DRAFT), 'utf8');
    cli(edit(DRAFT, 'status: draft', 'status: approved'));
    expect(readFileSync(at(DRAFT), 'utf8')).toBe(before);
  });

  it('fails closed on empty input, invalid JSON, a missing path and a spec it cannot read', () => {
    expect(run('').code).toBe(2);
    expect(run('not json').code).toBe(2);
    expect(run('null').code).toBe(2);
    expect(run(JSON.stringify({ tool_name: 'Write', tool_input: { content: 'x' } })).code).toBe(2);
    expect(cli({ tool_name: 'Write', cwd: dir, tool_input: { file_path: at('.ai/specs/a-directory.md'), content: spec('draft') } }).code).toBe(2);
    expect(cli({ tool_name: 'MultiEdit', cwd: dir, tool_input: { file_path: at(DRAFT), edits: 'nope' } }).code).toBe(2);
  });

  // import.meta.url is percent-encoded and process.argv[1] is not: the Bash hook once skipped main() for a path with a space
  it.each(['with space', 'with%20percent', 'zażółć'])('still blocks when the hook lives in a directory "%s"', (folder) => {
    const base = mkdtempSync(join(tmpdir(), 'spec-hook-path-'));
    try {
      mkdirSync(join(base, folder));
      const copy = join(base, folder, 'spec-status-guard.mjs');
      copyFileSync(HOOK, copy);
      const r = run(JSON.stringify(edit(DRAFT, 'status: draft', 'status: approved')), copy);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('Zablokowane');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('blocks even when there is no script path (node -e importing the hook)', () => {
    const code = `import(${JSON.stringify(pathToFileURL(HOOK).href)})`;
    const r = spawnSync('node', ['--input-type=module', '-e', code], { input: JSON.stringify(edit(DRAFT, 'status: draft', 'status: approved')), encoding: 'utf8' });
    expect(r.status).toBe(2);
  });

  it('resolves a relative path against the cwd Claude Code reports', () => {
    const r = cli({ tool_name: 'Write', cwd: dir, tool_input: { file_path: '.ai/specs/2026-11-09-rel.md', content: spec('approved') } });
    expect(r.code).toBe(2);
    expect(existsSync(at('.ai/specs/2026-11-09-rel.md'))).toBe(false);
  });
});

describe('.claude/settings.json wires the spec-status guard', () => {
  const settings = JSON.parse(readFileSync(root('.claude/settings.json'), 'utf8')) as {
    hooks?: { PreToolUse?: Array<{ matcher?: string; hooks?: Array<{ type?: string; command?: string }> }> };
  };
  const entries = settings.hooks?.PreToolUse ?? [];
  const guard = entries.find((e) => e.matcher === 'Edit|Write|MultiEdit');

  it('runs the script for Edit, Write and MultiEdit, and the Bash hook is still there', () => {
    expect(guard, 'a PreToolUse entry for Edit|Write|MultiEdit').toBeDefined();
    expect(guard?.hooks).toHaveLength(1);
    expect(guard?.hooks?.[0]?.type).toBe('command');
    expect(guard?.hooks?.[0]?.command).toBe('node "$CLAUDE_PROJECT_DIR"/.claude/hooks/spec-status-guard.mjs');
    expect(existsSync(root('.claude/hooks/spec-status-guard.mjs'))).toBe(true);
    expect(entries.filter((e) => e.matcher === 'Bash')).toHaveLength(1);
    expect(entries).toHaveLength(2);
  });
});

describe('security-notes.md documents the spec-status guard', () => {
  const notes = readFileSync(root('security-notes.md'), 'utf8');
  it('says what it enforces, that it is a guardrail, and the Bash bypass', () => {
    for (const word of ['spec-status-guard.mjs', 'status: approved', 'sed -i', 'nie jest granicą']) expect(notes, word).toContain(word);
  });
});
