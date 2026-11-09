export interface VersionChange { file: string; field: string; from: string; to: string }
export function isSemver(version: unknown): boolean;
/** `true`, `false`, or `'unsupported'` for a range other than `*`, an exact version, `^x.y.z` or `~x.y.z`. */
export function satisfies(version: string, range: string): boolean | 'unsupported';
export function checkVersions(root: string, expect?: string): { version: string | null; problems: string[] };
/** New file contents keyed by path relative to `root`; nothing is written. */
export function planSet(root: string, version: string): { changes: VersionChange[]; files: Record<string, string>; problems: string[] };
export function main(argv?: string[], out?: Pick<Console, 'log' | 'error'>): number;
