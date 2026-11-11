export interface PageProblem { file: string; line: number; message: string }
export interface CheckedFunction { file: string; fn: string; gate: boolean }
/** Fields are optional in the type because the checker itself reports a missing one as a problem. */
export interface PagesAllowlistEntry { file?: string; functions?: string[]; reason?: string }
export interface PagesAllowlist { entries?: PagesAllowlistEntry[] }
export const ADMIN_DIR: string;
export const DEFAULT_ALLOWLIST: string;
export function mask(src: string, strings: boolean): string;
export function checkPages(opts: { root: string; adminDir?: string; allowlist?: PagesAllowlist; allowlistName?: string }): { problems: PageProblem[]; checked: CheckedFunction[] };
export function formatProblem(p: PageProblem): string;
export function main(argv?: string[], out?: Pick<Console, 'log' | 'error'>): number;
