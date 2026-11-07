export interface RouteProblem { file: string; line: number; message: string }
export interface RouteInfo { file: string; method: string; helper: string; route: string }
export interface Allowlist {
  publicRoutes?: { file: string; helper: string; reason: string }[];
  exceptions?: { file: string; reason: string }[];
}
export function mask(src: string, strings: boolean): string;
export function expectedRoute(apiDirRelativeFile: string): string;
export function checkRoutes(opts: { root: string; apiDir?: string; allowlist?: Allowlist; allowlistName?: string }): { problems: RouteProblem[]; routes: RouteInfo[] };
export function formatProblem(p: RouteProblem): string;
export function main(argv?: string[], out?: Pick<Console, 'log' | 'error'>): number;
