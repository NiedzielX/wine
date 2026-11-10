import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { checkPages, main, mask } from '../../../scripts/check-pages.mjs';

/**
 * `scripts/check-pages.mjs`: every page, layout and server action of the dashboard checks access before it reads data
 * (threat model T-29). Fixture trees are written to a temporary directory whose name has a space.
 */
const SCRIPT = fileURLToPath(new URL('../../../scripts/check-pages.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const ADMIN = 'packages/app/src/app/(admin)/admin';
const roots: string[] = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

const GATE_IMPORTS = "\nimport { requireAccess, authorizeAction } from '@/server/auth';\nimport { act, perform } from '@/server/action-runner';\n";
type Entry = { file?: string; functions?: string[]; reason?: string };
function check(files: Record<string, string>, entries: Entry[] = []) {
  const root = mkdtempSync(join(tmpdir(), 'check pages '));
  roots.push(root);
  for (const [rel, src] of Object.entries(files)) {
    const abs = join(root, ADMIN, rel);
    mkdirSync(dirname(abs), { recursive: true });
    // the real gates' imports go at the END (imports are hoisted), so line numbers in the assertions stay those of the fixture
    writeFileSync(abs, src.startsWith('/*raw*/') ? src : `${src}${GATE_IMPORTS}`);
  }
  const result = checkPages({ root, allowlist: { entries } });
  return { ...result, root, messages: result.problems.map((p: { file: string; line: number; message: string }) => `${p.file}:${p.line}: ${p.message}`) };
}

const META = "export async function generateMetadata(): Promise<Metadata> {\n  return { title: (await getI18n()).t.admin.meta.menu };\n}\n";
const goodPage = `${META}export default async function MenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  await requireAccess(slug);
  const menu = await (await getRequestScope()).cradle.adminService.menu(slug, { q: sp.q });
  return <Page><p className="x">{menu.restaurant.name}</p></Page>;
}
`;
/** The menu page before the fix of 2026-11-08 (T-29): it read the menu and never checked access itself. */
const leakingPage = `${META}export default async function MenuPage({ params }: Props) {
  const { slug } = await params;
  const menu = await (await getRequestScope()).cradle.adminService.menu(slug, {});
  return <Page><Link href={\`/admin/\${slug}/menu\`}>{menu.restaurant.name}</Link></Page>;
}
`;
const action = (body: string) => `'use server';\n\nexport async function approvePairing(form: FormData) {\n${body}\n}\n`;

describe('check-pages', () => {
  it('passes a page that awaits requireAccess before its reads, a layout, an action through act() and a non-reading generateMetadata', () => {
    const r = check({
      '[slug]/menu/page.tsx': goodPage,
      '[slug]/layout.tsx': 'export default async function L({ children, params }: Props) {\n  const { slug } = await params;\n  const access = await requireAccess(slug);\n  const o = await (await getRequestScope()).cradle.adminService.overview(slug);\n  return <Shell access={access}>{children}</Shell>;\n}\n',
      '[slug]/review/page.tsx': 'export default async function R({ params }: Props) {\n  const { slug } = await params;\n  const decide = (await requireAccess(slug)).can(\'pairings.decide\');\n  const q = await (await getRequestScope()).cradle.adminService.reviewQueue(slug);\n  return <p>{decide}</p>;\n}\n',
      '[slug]/actions.ts': action("  return act(form, 'pairings.decide', async ({ c, slug, actor, form: f }) => { await c.sommelierService.approve(slug, str(f, 'pairingId'), actor); return { saved: 'approved' }; });"),
      '[slug]/team-actions.ts': "'use server';\nexport async function inviteMember(_p: S, form: FormData) {\n  const slug = str(form, 'slug');\n  const result = await perform(form, 'team.manage', async ({ c, slug: s }) => c.invitationService.invite(s));\n  return result;\n}\n",
      '[slug]/client-form.tsx': "'use client';\nexport default function F() { const x = useThing(); return <form />; }\n",
      '[slug]/not-found.tsx': 'export default function NotFound() { return <p>Not found</p>; }\n'
    });
    expect(r.messages).toEqual([]);
    expect(r.checked.filter((c: { gate: boolean }) => c.gate)).toHaveLength(5);
  });

  it('fails the menu page as it was before the T-29 fix: no requireAccess, and the read is reported with file:line', () => {
    const r = check({ '[slug]/(lists)/menu/page.tsx': leakingPage });
    expect(r.messages).toHaveLength(2);
    expect(r.messages[0]).toMatch(/^packages\/app\/src\/app\/\(admin\)\/admin\/\[slug\]\/\(lists\)\/menu\/page\.tsx:4: the default export does not call requireAccess\(\)/);
    expect(r.messages[1]).toMatch(/menu\/page\.tsx:6: the default export reads data before the access check: .*adminSe/);
  });

  it('fails a read that comes before the check even when the check is there', () => {
    const r = check({ '[slug]/pairings/page.tsx': 'export default async function P({ params }: Props) {\n  const { slug } = await params;\n  const menu = await (await getRequestScope()).cradle.adminService.menu(slug, {});\n  await requireAccess(slug);\n  redirect(menu.dishes[0].id);\n}\n' });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]).toContain('pairings/page.tsx:3: the default export reads data before the access check');
  });

  it('fails a service call that is started (not awaited) before the check', () => {
    const r = check({ '[slug]/qr/page.tsx': 'export default async function Q({ params }: Props) {\n  const { slug } = await params;\n  const { adminService } = (await getRequestScope()).cradle;\n  const pending = adminService.setup(slug);\n  await requireAccess(slug);\n  return <p>{(await pending).name}</p>;\n}\n' });
    expect(r.messages).toEqual([expect.stringContaining('qr/page.tsx:4: the default export reads data before the access check: adminService.setup(…)')]);
  });

  it('allows destructuring the services before the check (no call), as pairings/[dishId] does', () => {
    const r = check({ '[slug]/pairings/[dishId]/page.tsx': 'export default async function P({ params }: Props) {\n  const { slug, dishId } = await params;\n  const { adminService, opportunityService } = (await getRequestScope()).cradle;\n  const decide = (await requireAccess(slug)).can(\'pairings.decide\');\n  const w = await adminService.pairingWorkbench(slug, dishId);\n  return <p>{w}</p>;\n}\n' });
    expect(r.messages).toEqual([]);
  });

  it('fails requireAccess started inside Promise.all with the reads (the dashboard before its fix), also with an await elsewhere', () => {
    const r = check({ '[slug]/(lists)/page.tsx': 'export default async function D({ params }: Props) {\n  const { slug } = await params;\n  const { adminService, analyticsService } = (await getRequestScope()).cradle;\n  const [access, o, sales] = await Promise.all([\n    requireAccess(slug),\n    adminService.overview(slug),\n    analyticsService.salesSummary(slug)\n  ]);\n  return <p>{o}</p>;\n}\n' });
    expect(r.messages.some((m: string) => m.includes('page.tsx:5: the default export: requireAccess() is started inside Promise.all(...)'))).toBe(true);
    expect(r.messages.some((m: string) => m.includes('does not call requireAccess()'))).toBe(true);
    expect(r.messages.some((m: string) => m.includes('page.tsx:6: the default export reads data before the access check: adminService.overview(…)'))).toBe(true);
  });

  it('fails Promise.all with requireAccess even when an earlier await requireAccess exists (no allowlist for parallel gates)', () => {
    const r = check({ '[slug]/setup/page.tsx': 'export default async function S({ params }: Props) {\n  const { slug } = await params;\n  await requireAccess(slug);\n  const [a, b] = await Promise.allSettled([requireAccess(slug), x()]);\n  return <p />;\n}\n' }, [{ file: `${ADMIN}/[slug]/setup/page.tsx`, functions: ['default'], reason: 'trying to allowlist a parallel gate' }]);
    expect(r.messages.some((m: string) => m.includes('started inside Promise.allSettled'))).toBe(true);
  });

  it('fails a requireAccess that is only called in a branch or a callback, or not awaited', () => {
    const r = check({
      '[slug]/a/page.tsx': 'export default async function A({ params }: Props) {\n  const { slug } = await params;\n  if (slug) { await requireAccess(slug); }\n  return <p />;\n}\n',
      '[slug]/b/page.tsx': 'export default async function B({ params }: Props) {\n  const { slug } = await params;\n  requireAccess(slug);\n  return <p />;\n}\n',
      '[slug]/c/page.tsx': 'export default async function C({ params }: Props) {\n  const { slug } = await params;\n  const go = async () => { await requireAccess(slug); };\n  return <p />;\n}\n'
    });
    expect(r.messages.filter((m: string) => m.includes('does not call requireAccess()'))).toHaveLength(3);
  });

  it('fails a server action that reads before act(), or does not go through a gate at all', () => {
    const r = check({
      '[slug]/actions.ts': action("  const scope = await createRequestScope();\n  await scope.cradle.sommelierService.approve(str(form, 'slug'), str(form, 'pairingId'));\n  return act(form, 'pairings.decide', async () => ({}));"),
      '[slug]/more-actions.ts': "'use server';\nexport async function sneaky(form: FormData) {\n  return (await getRequestScope()).cradle.teamService.list(str(form, 'slug'));\n}\n"
    });
    expect(r.messages.some((m: string) => m.includes('actions.ts:4: approvePairing() reads data before the access check: `await createRequestScope();`'))).toBe(true);
    expect(r.messages.some((m: string) => m.includes('more-actions.ts:2: sneaky() does not call act(), perform(), authorizeAction()'))).toBe(true);
    expect(r.messages.some((m: string) => m.includes('more-actions.ts:3: sneaky() reads data'))).toBe(true);
  });

  it('fails closed on export forms it cannot read in pages and actions', () => {
    const r = check({
      '[slug]/actions.ts': "'use server';\nexport const approvePairing = async (form: FormData) => act(form, 'pairings.decide', async () => ({}));\n",
      '[slug]/x/page.tsx': 'const Page = async () => <p />;\nexport default Page;\n'
    });
    expect(r.messages.some((m: string) => m.includes('`export const approvePairing = …` is not understood'))).toBe(true);
    expect(r.messages.some((m: string) => m.includes('the default export is not a function declaration'))).toBe(true);
  });

  it('a page outside [slug] that reads (e.g. the public sign-in page) needs an allowlist entry with a reason; the entry must match reality', () => {
    const login = 'export default async function Login() {\n  const principal = await getPrincipal();\n  return <p />;\n}\n';
    expect(check({ 'login/page.tsx': login }).messages[0]).toContain('login/page.tsx:1: the default export does not call requireAccess()');
    expect(check({ 'login/page.tsx': login }, [{ file: `${ADMIN}/login/page.tsx`, functions: ['default'], reason: 'public sign-in, own session only' }]).messages).toEqual([]);
    const stale = check({ '[slug]/menu/page.tsx': goodPage }, [{ file: `${ADMIN}/[slug]/menu/page.tsx`, functions: ['default'], reason: 'no longer needed now' }]);
    expect(stale.messages).toEqual([expect.stringContaining('passes the check without it; remove the stale entry')]);
    const gone = check({ '[slug]/menu/page.tsx': goodPage }, [{ file: `${ADMIN}/gone/page.tsx`, functions: ['default'], reason: 'the file was deleted' }]);
    expect(gone.messages.some((m: string) => m.includes('does not exist; remove the entry'))).toBe(true);
    const silent = check({ 'login/page.tsx': login }, [{ file: `${ADMIN}/login/page.tsx`, functions: ['default'] }]);
    expect(silent.messages.some((m: string) => m.includes('needs a written `reason`'))).toBe(true);
    const wrongFn = check({ 'login/page.tsx': login }, [{ file: `${ADMIN}/login/page.tsx`, functions: ['default', 'other'], reason: 'public sign-in, own session only' }]);
    expect(wrongFn.messages.some((m: string) => m.includes('lists other, which the file does not export'))).toBe(true);
  });

  it('ignores names in strings and comments, and JSX closing tags do not confuse the body scan', () => {
    const r = check({ '[slug]/menu/page.tsx': `${META}export default async function M({ params }: Props) {\n  const { slug } = await params;\n  // adminService.menu(slug) used to be here\n  const label = 'adminService.menu(slug)';\n  await requireAccess(slug);\n  return <div><span>{label}</span></div>;\n}\n` });
    expect(r.messages).toEqual([]);
    expect(mask("a('x/y') // c", true)).toBe("a('   ')     ");
  });

  // review of PR #146: export forms, conditional gates, shadowed gate names, inline actions, masking, unreadable trees
  const SVC = 'const x = await (await getRequestScope()).cradle.adminService.menu(slug, {});';
  it.each([
    ['an arrow default export', '[slug]/a/page.tsx', `export default async ({ params }: Props) => {\n  const { slug } = await params;\n  ${SVC}\n  return <p>{x}</p>;\n};\n`, 'the default export is not a function declaration'],
    ['`export { P as default }`', '[slug]/b/page.tsx', `async function P({ params }: Props) {\n  const { slug } = await params;\n  ${SVC}\n  return <p />;\n}\nexport { P as default };\n`, '`export { … }` is not understood'],
    ['`export { default } from`', '[slug]/c/page.tsx', "export { default } from './impl';\n", '`export { … } from …` is not understood'],
    ['`export * from`', '[slug]/d/layout.tsx', "export * from './impl';\n", '`export * from …` is not understood'],
    ['a page with no default export', '[slug]/e/page.tsx', 'export const dynamic = \'force-dynamic\';\n', 'without `export default [async] function'],
    ['`export default Page` (identifier)', '[slug]/f/page.tsx', `async function Page() { ${SVC} return <p />; }\nexport default Page;\n`, 'the default export is not a function declaration']
  ])('fails closed on %s in a render file (an ungated read would otherwise pass)', (_what, file, src, message) => {
    const r = check({ [file]: src });
    expect(r.messages.some((m: string) => m.includes(message)), r.messages.join('\n')).toBe(true);
  });

  it.each([
    ['`export { a }` of an ungated function', "'use server';\nasync function a(form: FormData) {\n  await (await getRequestScope()).cradle.adminService.del(1);\n}\nexport { a };\n", '`export { … }` is not understood'],
    ['`export default async () =>`', "'use server';\nexport default async () => 1;\n", 'the default export is not a function declaration'],
    ['`export const a = async`', "'use server';\nexport const a = async (form: FormData) => (await getRequestScope()).cradle.adminService.del(1);\n", '`export const a = …` is not understood'],
    ['`export const a = function`', "'use server';\nexport const a = function (form: FormData) { return 1; };\n", '`export const a = …` is not understood']
  ])('fails closed on %s in an action file', (_what, src, message) => {
    const r = check({ '[slug]/x-actions.ts': src });
    expect(r.messages.some((m: string) => m.includes(message)), r.messages.join('\n')).toBe(true);
  });

  it.each([
    ['a braceless if', '  if (slug) await requireAccess(slug);'],
    ['an else branch', '  if (!slug) {} else await requireAccess(slug);'],
    ['a ternary', '  const a = slug ? await requireAccess(slug) : null;'],
    ['`&&`', '  slug && await requireAccess(slug);'],
    ['`||`', '  const a = !slug || (await requireAccess(slug));'],
    ['a loop', '  for (const s of [slug]) await requireAccess(s);'],
    ['an argument of another call', '  log(await requireAccess(slug));']
  ])('fails a gate that may not run: %s', (_what, line) => {
    const r = check({ '[slug]/g/page.tsx': `export default async function G({ params }: Props) {\n  const { slug } = await params;\n${line}\n  ${SVC}\n  return <p />;\n}\n` });
    expect(r.messages.some((m: string) => m.includes('does not call requireAccess() as an unconditional top-level statement')), r.messages.join('\n')).toBe(true);
  });

  it('fails a gate name that is shadowed, declared locally or not imported from the real module', () => {
    const shadow = check({ '[slug]/actions.ts': action("  const act = (f: FormData, p: string, run: () => unknown) => run();\n  return act(form, 'pairings.decide', async () => (await getRequestScope()).cradle.sommelierService.approve(1));") });
    expect(shadow.messages.some((m: string) => m.includes('act is declared, assigned, passed or shadowed here')), shadow.messages.join('\n')).toBe(true);
    const local = check({ '[slug]/h/page.tsx': `/*raw*/async function requireAccess(s: string) { return s; }\nexport default async function H({ params }: Props) {\n  const { slug } = await params;\n  await requireAccess(slug);\n  ${SVC}\n  return <p />;\n}\n` });
    expect(local.messages.some((m: string) => m.includes("requireAccess is not imported by that name from '@/server/auth'")), local.messages.join('\n')).toBe(true);
    const alias = check({ '[slug]/i/page.tsx': `/*raw*/import { requireAccess as requireAccessReal } from '@/server/auth';\nconst requireAccess = async (s: string) => s;\nexport default async function I({ params }: Props) {\n  const { slug } = await params;\n  await requireAccess(slug);\n  return <p />;\n}\n` });
    expect(alias.messages.some((m: string) => m.includes('requireAccess')), alias.messages.join('\n')).toBe(true);
  });

  it('checks an inline server action in a page like an exported action (gate first, no read before it)', () => {
    const bad = check({ '[slug]/j/page.tsx': `export default async function J({ params }: Props) {\n  const { slug } = await params;\n  await requireAccess(slug);\n  async function remove(form: FormData) {\n    'use server';\n    await (await getRequestScope()).cradle.adminService.del(1);\n  }\n  return <form action={remove} />;\n}\n` });
    expect(bad.messages.some((m: string) => m.includes('the inline server action remove() does not call act()')), bad.messages.join('\n')).toBe(true);
    expect(bad.messages.some((m: string) => m.includes('the inline server action remove() reads data before the access check')), bad.messages.join('\n')).toBe(true);
    const good = check({ '[slug]/j/page.tsx': `export default async function J({ params }: Props) {\n  const { slug } = await params;\n  await requireAccess(slug);\n  async function remove(form: FormData) {\n    "use server";\n    return act(form, 'pairings.decide', async ({ c }) => c.adminService.del(1));\n  }\n  return <form action={remove} />;\n}\n` });
    expect(good.messages).toEqual([]);
  });

  it('a regular expression with a quote or a brace does not swallow the rest of the body', () => {
    const r = check({ '[slug]/k/page.tsx': `export default async function K({ params }: Props) {\n  const { slug } = await params;\n  const q = /["'{]/;\n  await requireAccess(slug);\n  const x = await (await getRequestScope()).cradle.adminService.menu(slug, {});\n  return <p>{q.test(x) ? 'a' : 'b'}</p>;\n}\n` });
    expect(r.messages).toEqual([]);
    expect(mask("const r = /[\"'{]/; f({})", true)).toBe("const r = /     /; f({})");
    expect(mask('return <a>x</a>;', true)).toBe('return <a>x</a>;');
  });

  // root reads any directory, so the case only exists for a normal user (CI runners and developers)
  it.skipIf(process.getuid?.() === 0)('a directory it cannot read is a problem, not a silent skip', () => {
    const r = check({ '[slug]/l/page.tsx': goodPage });
    const locked = join(r.root, ADMIN, '[slug]', 'locked');
    mkdirSync(locked);
    writeFileSync(join(locked, 'page.tsx'), leakingPage);
    chmodSync(locked, 0o000);
    try {
      const again = checkPages({ root: r.root, allowlist: { entries: [] } });
      expect(again.problems.map((p: { message: string }) => p.message).some((m: string) => m.includes('cannot read this directory')), JSON.stringify(again.problems)).toBe(true);
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it('the allowlist of the repository is exactly the eight documented public doors, each with a reason', () => {
    const list = JSON.parse(readFileSync(join(REPO, 'scripts/check-pages.allowlist.json'), 'utf8')) as { entries: Array<{ file: string; functions: string[]; reason: string }> };
    const doors = list.entries.flatMap((e) => e.functions.map((f) => `${e.file.replace(`${ADMIN}/`, '')}#${f}`)).sort();
    expect(doors).toEqual(['accept-actions.ts#acceptInvitation', 'accept/page.tsx#default', 'auth-actions.ts#login', 'auth-actions.ts#logout', 'language-actions.ts#setLanguage', 'layout.tsx#default', 'login/page.tsx#default', 'page.tsx#default']);
    expect(list.entries.every((e) => !e.file.includes('[slug]')), 'nothing under [slug] is a public door').toBe(true);
    expect(list.entries.every((e) => e.reason.length >= 40)).toBe(true);
  });

  it('the real repository passes (the allowlist names only doors that are public by design)', () => {
    const out = { log: [] as string[], error: [] as string[] };
    expect(main(['--root', REPO], { log: (m: string) => out.log.push(m), error: (m: string) => out.error.push(m) })).toBe(0);
    expect(out.log[0]).toMatch(/^check:pages OK: \d+ functions check access before data/);
  });

  it('as a command: exit code 1 with file:line on a failing tree, 2 on a bad argument', () => {
    const r = check({ '[slug]/(lists)/menu/page.tsx': leakingPage });
    writeFileSync(join(r.root, 'allow.json'), '{"entries":[]}');
    const run = spawnSync(process.execPath, [SCRIPT, '--root', r.root, '--allowlist', join(r.root, 'allow.json')], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('menu/page.tsx:4: the default export does not call requireAccess()');
    expect(spawnSync(process.execPath, [SCRIPT, '--nope', 'x'], { encoding: 'utf8' }).status).toBe(2);
  });
});
