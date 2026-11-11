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
    expect(r.messages.some((m: string) => m.includes('`export const approvePairing = …` is not a plain literal'))).toBe(true);
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
    ['`export const a = async`', "'use server';\nexport const a = async (form: FormData) => (await getRequestScope()).cradle.adminService.del(1);\n", '`export const a = …` is not a plain literal'],
    ['`export const a = function`', "'use server';\nexport const a = function (form: FormData) { return 1; };\n", '`export const a = …` is not a plain literal']
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

  // third review of PR #146: the reviewer's own fixtures (scratch fx.mjs, fx2.mjs, fx3.mjs), kept as regression cases. Cases the
  // reviewer marked as known bypasses or open questions are left out here and listed in the header's known limits.
  const RIMP = "import { requireAccess } from '@/server/auth';\n";
  const RAIMP = "import { act } from '@/server/action-runner';\n";
  const RP = (b: string, imp = RIMP) => imp + b;
  const REVIEW_FIXTURES: Array<[string, string, string, string]> = [
 ['read before gate', 'page.tsx', RP(`export default async function Page(){ await svc.x(); await requireAccess(s) }`), 'fail'],
 ['read via adminService before gate','page.tsx',RP(`export default async function Page(){ const a = await adminService.menu(1); await requireAccess(s) }`),'fail'],
 ['Promise.all with gate','page.tsx',RP(`export default async function Page(){ const [a,b]=await Promise.all([svc.x(), requireAccess(s)]) }`),'fail'],
 ['gate in try','page.tsx',RP(`export default async function Page(){ try { await requireAccess(s) } catch {} }`),'fail'],
 ['Promise.resolve then gate after data read','page.tsx',RP(`export default async function Page(){ const d = await loadThing(); await Promise.resolve(); await requireAccess(s); }`),'fail'],
 ['gate promise not awaited before read','page.tsx',RP(`export default async function Page(){ const p = requireAccess(s); await adminService.x(); await p; }`),'fail'],
 ['gate not awaited unassigned','page.tsx',RP(`export default async function Page(){ requireAccess(s); await adminService.x(); }`),'fail'],
 ['gate from other module same name','page.tsx',`import { requireAccess } from './mine';\nexport default async function Page(){ await requireAccess(s); await adminService.x() }`,'fail'],
 ['aliased import','page.tsx',`import { requireAccess as ra } from '@/server/auth';\nexport default async function Page(){ await ra(s); await adminService.x() }`,'fail'],
 ['aliased import + real name import absent','page.tsx',`import { requireAccess as ra } from '@/server/auth';\nexport default async function Page(){ await requireAccess(s); await adminService.x() }`,'fail'],
 ['dynamic export allowed','page.tsx',RP(`export const dynamic='force-dynamic';\nexport default async function Page(){ await requireAccess(s); await adminService.x() }`),'pass'],
 ['generateMetadata arrow ungated','page.tsx',RP(`export const generateMetadata = async () => adminService.x();\nexport default async function Page(){ await requireAccess(s); }`),'fail'],
 ['generateMetadata fn decl ungated read','page.tsx',RP(`export async function generateMetadata(){ return adminService.x(); }\nexport default async function Page(){ await requireAccess(s); }`),'fail'],
 ['generateMetadata fn decl gated','page.tsx',RP(`export async function generateMetadata(){ await requireAccess(s); return adminService.x(); }\nexport default async function Page(){ await requireAccess(s); }`),'pass'],
 ['export default Page','page.tsx',RP(`async function Page(){ await adminService.x(); }\nexport default Page;`),'fail'],
 ['class component','page.tsx',RP(`export default class Page { async render(){ await adminService.x() } }`),'fail'],
 ['React.memo default','page.tsx',RP(`async function Page(){ await adminService.x(); }\nexport default React.memo(Page);`),'fail'],
 ['export default async arrow','page.tsx',RP(`export default async () => { await adminService.x() }`),'fail'],
 ['export {P as default}','page.tsx',RP(`async function P(){ await adminService.x() }\nexport { P as default };`),'fail'],
 ['reexport default from','page.tsx',`export { default } from './other';`,'fail'],
 ['export * from','page.tsx',`export * from './other';`,'fail'],
 ['no default','page.tsx',RP(`export const x = 1;`),'fail'],
 ['use server inline fn in page','page.tsx',RP(`export default async function Page(){ await requireAccess(s); async function a(){ 'use server'; await adminService.w(); } return a }`),'fail'],
 ['use server file, inline directive repeated','actions.ts',`'use server';\n`+RAIMP+`export async function a(){ 'use server'; await adminService.w(); }`,'fail'],
 ['use server file ungated','actions.ts',`'use server';\nexport async function a(){ await adminService.w(); }`,'fail'],
 ['use server file gated ok','actions.ts',`'use server';\n`+RAIMP+`export async function a(){ return act(s, async()=>adminService.w()); }`,'pass'],
 ['use server file gated after read','actions.ts',`'use server';\n`+RAIMP+`export async function a(){ await adminService.w(); await act(s, async()=>1); }`,'fail'],
 ['use server export const arrow','actions.ts',`'use server';\nexport const a = async () => { await adminService.w(); }`,'fail'],
 ['use server export {a}','actions.ts',`'use server';\nasync function a(){ await adminService.w(); }\nexport { a };`,'fail'],
 ['use server with comments before directive','actions.ts',`// c\n/* x */ 'use server';\nexport async function a(){ await adminService.w(); }`,'fail'],
 ['use server not first stmt (after import)','actions.ts',`import x from 'y';\n'use server';\nexport async function a(){ await adminService.w(); }`,'fail'],
 ['template literal containing gate','page.tsx',RP("export default async function Page(){ const s = `requireAccess(`; await adminService.x(); }"),'fail'],
 ['comment containing gate','page.tsx',RP(`export default async function Page(){ // await requireAccess(s)\n await adminService.x(); }`),'fail'],
 ['block comment containing gate','page.tsx',RP(`export default async function Page(){ /* await requireAccess(s); */ await adminService.x(); }`),'fail'],
 ['string with braces before gate','page.tsx',RP(`export default async function Page(){ const s = "}{"; await requireAccess(s); await adminService.x(); }`),'pass'],
 ['string with unbalanced brace then read','page.tsx',RP(`export default async function Page(){ const s = "{"; await adminService.x(); await requireAccess(s); }`),'fail'],
 ['template ${} containing read','page.tsx',RP("export default async function Page(){ const s = `${await adminService.x()}`; await requireAccess(s); }"),'fail'],
 ['non-ascii ok','page.tsx',RP(`export default async function Page(){ const t = "żółć 🍷"; await requireAccess(s); await adminService.x(); }`),'pass'],
 ['non-ascii before read ungated','page.tsx',RP(`export default async function Page(){ const t = "żółć 🍷"; await adminService.x(); await requireAccess(s); }`),'fail'],
 ['if gate','page.tsx',RP(`export default async function Page(){ if (a) await requireAccess(s); await adminService.x(); }`),'fail'],
 ['ternary gate','page.tsx',RP(`export default async function Page(){ a ? await requireAccess(s) : null; await adminService.x(); }`),'fail'],
 ['&& gate','page.tsx',RP(`export default async function Page(){ a && await requireAccess(s); await adminService.x(); }`),'fail'],
 ['shadowed gate local const','page.tsx',RP(`export default async function Page(){ const requireAccess = async()=>{}; await requireAccess(s); await adminService.x(); }`),'fail'],
 ['param shadow gate','page.tsx',RP(`export default async function Page({requireAccess}){ await requireAccess(s); await adminService.x(); }`),'fail'],
 ['gate in callback','page.tsx',RP(`export default async function Page(){ [1].forEach(async()=>{ await requireAccess(s) }); await adminService.x(); }`),'fail'],
 ['gate after early return (legit)','page.tsx',RP(`export default async function Page(){ if (a) return null; await requireAccess(s); await adminService.x(); }`),'pass'],
 ['early return of read before gate','page.tsx',RP(`export default async function Page(){ if (a) return adminService.x(); await requireAccess(s); }`),'fail'],
 ['IIFE read before gate','page.tsx',RP(`export default async function Page(){ await (async()=>adminService.x())(); await requireAccess(s); }`),'fail'],
 ['.then chain read before gate','page.tsx',RP(`export default async function Page(){ const d = adminService.x().then(r=>r); await requireAccess(s); return d }`),'fail'],
 ['Service via optional chain','page.tsx',RP(`export default async function Page(){ const d = adminService?.x(); await requireAccess(s); }`),'fail'],
 ['Service via bracket','page.tsx',RP(`export default async function Page(){ const d = adminService['x'](); await requireAccess(s); }`),'fail'],
 ['for await before gate','page.tsx',RP(`export default async function Page(){ for await (const x of src()) {} await requireAccess(s); }`),'fail'],
 ['gate in loop','page.tsx',RP(`export default async function Page(){ while(true){ await requireAccess(s); break } await adminService.x(); }`),'fail'],
 ['default anonymous fn','page.tsx',RP(`export default async function(){ await adminService.x() }`),'fail'],
 ['export default newline function','page.tsx',RP(`export default\nasync function Page(){ await requireAccess(s); await adminService.x() }`),'pass'],
 ['export type {} from + valid','page.tsx',RP(`export type { X } from './x';\nexport default async function Page(){ await requireAccess(s); }`),'pass'],
 ['regex literal with brace','page.tsx',RP(`export default async function Page(){ const r = /\\{/; await requireAccess(s); await adminService.x(); }`),'pass'],
 ['division then gate','page.tsx',RP(`export default async function Page(){ const q = a / b / c; await requireAccess(s); await adminService.x(); }`),'pass'],
 ['JSX apostrophe, gated','page.tsx',RP(`export default async function Page(){ await requireAccess(s); return <p>don't {await adminService.x()}</p>; }`),'pass'],
 ['JSX apostrophe hides order','page.tsx',RP(`export default async function Page(){ const e = <b>it's</b>; await adminService.x(); const f = <i>it's</i>; await requireAccess(s); }`),'fail'],
 ['JSX text with // swallowing code','page.tsx',RP(`export default async function Page(){ const e = <a>http://x</a>; await adminService.x(); await requireAccess(s); }`),'fail'],
 ['JSX apostrophe BEFORE the gate swallowing gate?','page.tsx',RP(`export default async function Page(){ const e = <b>it's</b>; await requireAccess(s); const f = <i>it's</i>; await adminService.x(); }`),'pass'],
 ['generic arrow in file','page.tsx',RP(`const f = <T,>(x:T)=>x; export default async function Page(){ await adminService.x(); await requireAccess(s); }`),'fail'],
 ['render file with exported GET reading','page.tsx',RP(`export default async function Page(){ await requireAccess(s); }\nexport async function GET(){ return adminService.x() }`),'fail'],
 ['layout ungated','layout.tsx',RP(`export default async function L({children}){ return adminService.x(); }`),'fail'],
 ['template.tsx','template.tsx',RP(`export default async function L(){ await adminService.x(); }`),'fail'],
 ['default.tsx','default.tsx',RP(`export default async function L(){ await adminService.x(); }`),'fail'],
 ['non-render helper exported reading fn','helper.ts',`export async function load(){ await adminService.x(); }`,'fail'],
 ['route.ts in tree','route.ts',`export async function GET(){ return adminService.x(); }`,'fail'],
 ['actions in subdir','sub/a-actions.ts',`'use server';\nexport async function a(){ await adminService.w(); }`,'fail'],
 ['use client skip','page.tsx',`'use client';\nexport default function P(){ return null }`,'pass'],
 ['use client not first (after import)','page.tsx',`import a from 'a';\n'use client';\nexport default async function P(){ await adminService.x(); }`,'fail'],
 ['use client inside comment','page.tsx',`/* 'use client' */\nexport default async function P(){ await adminService.x(); }`,'fail'],
 ['use client in template literal first','page.tsx',"`'use client'`;\nexport default async function P(){ await adminService.x(); }",'fail'],
 ['gate arg contains read','page.tsx',RP(`export default async function Page(){ await requireAccess(await adminService.x()); }`),'fail'],
 ['gate not awaited const x = gate()','page.tsx',RP(`export default async function Page(){ const x = requireAccess(s); await adminService.x(); await x; }`),'fail'],
 ['read inside gate then-callback after gate','page.tsx',RP(`export default async function Page(){ await requireAccess(s); return adminService.x(); }`),'pass'],
 ['default fn declared via export default function after label string "requireAccess(" in JSX text','page.tsx',RP(`export default async function Page(){ await adminService.x(); return <p>requireAccess(</p>; }`),'fail'],
 ['gate in switch case','page.tsx',RP(`export default async function Page(){ switch(a){ case 1: await requireAccess(s); } await adminService.x(); }`),'fail'],
 ['gate in arrow IIFE only','page.tsx',RP(`export default async function Page(){ await (async()=>{ await requireAccess(s) })(); await adminService.x(); }`),'fail'],
 ['gate in object literal / label block','page.tsx',RP(`export default async function Page(){ { await requireAccess(s) } await adminService.x(); }`),'fail'],
 ['gate with Promise.all in nested fn only','page.tsx',RP(`export default async function Page(){ await requireAccess(s); await Promise.all([adminService.x()]); }`),'pass'],
 ['export default with decorator-like: export default (async function Page(){...})','page.tsx',RP(`export default (async function Page(){ await adminService.x(); });`),'fail'],
 ['two default decls (fn + hoisted other)','page.tsx',RP(`export default async function Page(){ await requireAccess(s); await adminService.x(); }\nfunction other(){ return adminService.y(); }`),'pass'],
  ];
  it.each(REVIEW_FIXTURES)('review fixture: %s (%s) %#', (_name, rel, src, expected) => {
    const files: Record<string, string> = { [rel]: `/*raw*/${src}` };
    if (rel !== 'layout.tsx') files['layout.tsx'] = `/*raw*/${RIMP}export default async function L(){ await requireAccess(s); }`;
    const r = check(files);
    expect(r.messages.length > 0, `${expected}: ${r.messages.join(' | ')}`).toBe(expected === 'fail');
  });

  const GATE_STATEMENTS: Record<string, string> = {
 'else await': `if (a) {} else await requireAccess(s); await adminService.x();`,
 'while await': `while (a) await requireAccess(s); await adminService.x();`,
 'do-while': `do await requireAccess(s); while (0); await adminService.x();`,
 'arrow gate': `const f = async () => await requireAccess(s); await adminService.x();`,
 'cond assign': `const x = a ? 1 : await requireAccess(s); await adminService.x();`,
 'void gate no await in then': `requireAccess(s).then(()=>{}); await adminService.x();`,
 'x = gate().catch': `await requireAccess(s).catch(()=>null); await adminService.x();`,
 'try-less catch swallow': `await requireAccess(s).catch(()=>{}); await adminService.x();`,
 'gate in comma': `await 0, await requireAccess(s); await adminService.x();`,
 'await after 2nd gate path': `const x = (await requireAccess(s)).can('a'); await adminService.x();`,
 'label block': `a: await requireAccess(s); await adminService.x();`,
  };
  it.each(Object.entries(GATE_STATEMENTS))('review fixture, gate statement: %s', (name, body) => {
    const r = check({ 'page.tsx': `export default async function Page(){ ${body} }` });
    expect(r.messages.length > 0, r.messages.join(' | ')).toBe(name !== 'await after 2nd gate path');
  });

  it.each([
    ['metadata, revalidate and a typed object literal', "export const metadata = { title: 'x' };\nexport const revalidate = 0;\nexport const viewport: Viewport = { a: 1 };\nexport const runtime = 'nodejs', maxDuration = 30;\nexport const x = (1+2);\nexport const list = ['a', 1, true, null] as const;", true],
    ['an imported reference', 'export const gm = foo.bar;', false],
    ['a wrapper call', 'export const generateMetadata = cache(async () => adminService.x());', false],
    ['an arrow on the next line', 'export const generateMetadata =\n  async () => adminService.x();', false],
    ['a typed arrow', 'export const gm: Fn = async (p) => adminService.x(p);', false],
    ['a ternary', 'export const gm = x ? async () => 1 : null;', false],
    ['a second declarator', 'export let a = 1, gm = async () => adminService.x();', false],
    ['a bare identifier', 'export const gm = load;', false],
    ['a template with an expression', 'export const t = `${load()}`;', false],
    ['an exported class', 'export class C { async m() { return adminService.x(); } }', false]
  ])('rule 6, exported values of a page: %s', (_what, extra, passes) => {
    const r = check({ 'page.tsx': `export default async function Page(){ await requireAccess(s); }\n${extra}\n` });
    expect(r.messages.length === 0, r.messages.join(' | ')).toBe(passes);
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
