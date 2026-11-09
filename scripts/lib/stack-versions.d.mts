export interface StackEntry {
  line: number;
  column: number;
  label: string;
  key: string | null;
  kind: 'exact' | 'range';
  operator: string | null;
  token: string;
}
export interface StackFix { line: number; column: number; from: string; to: string }
export interface StackFinding { line: number; label: string; documented: string; actual: string | null; message: string; fix: StackFix | null }
export interface PackageFile { file: string; json: unknown }
export function parseStackTable(text: string): { entries: StackEntry[] } | null;
export function checkStackVersions(text: string, packages: PackageFile[]): StackFinding[];
export function applyStackFixes(text: string, fixes: StackFix[]): string;
