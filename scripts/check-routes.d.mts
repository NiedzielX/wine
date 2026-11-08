export interface RouteProblem { file: string; line: number; message: string }
export interface RouteInfo { file: string; method: string; helper: string; route: string }
/** Fields are optional in the type because the checker itself reports a missing one as a problem. */
export interface AllowlistEntry { file?: string; helper?: string; methods?: string[]; reason?: string }
export interface Allowlist {
  publicRoutes?: AllowlistEntry[];
  exceptions?: AllowlistEntry[];
  earlyReturns?: AllowlistEntry[];
}
export function mask(src: string, strings: boolean): string;
export function expectedRoute(apiDirRelativeFile: string): string;
export function escapeRegExp(text: string): string;
export function checkRoutes(opts: { root: string; apiDir?: string; allowlist?: Allowlist; allowlistName?: string }): { problems: RouteProblem[]; routes: RouteInfo[] };
export function formatProblem(p: RouteProblem): string;
export function main(argv?: string[], out?: Pick<Console, 'log' | 'error'>): number;
