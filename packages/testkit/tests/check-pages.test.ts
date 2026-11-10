import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

type Entry = { file?: string; functions?: string[]; reason?: string };
function check(files: Record<string, string>, entries: Entry[] = []) {
  const root = mkdtempSync(join(tmpdir(), 'check pages '));
  roots.push(root);
  for (const [rel, src] of Object.entries(files)) {
    const abs = join(root, ADMIN, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, src);
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
