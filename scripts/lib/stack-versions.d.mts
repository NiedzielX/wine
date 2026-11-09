export interface StackEntry {
  line: number;
  column: number;
  label: string;
  key: string | null;
  kind: 'exact' | 'range';
  operator: string | null;
  token: string;
}
export interface StackSkipped { line: number; label: string; reason: string }
export interface StackFix { line: number; column: number; from: string; to: string }
export interface StackFinding {
  line: number;
  label: string;
  documented: string | null;
  actual: string | null;
  /** true: the cell could not be compared at all (message "cell for X not checked: …"); false: a drift. */
  unchecked: boolean;
  message: string;
  fix: StackFix | null;
}
export interface PackageFile { file: string; json: unknown }
export function parseStackTable(text: string): { entries: StackEntry[]; skipped: StackSkipped[] } | null;
export function checkStackVersions(text: string, packages: PackageFile[]): StackFinding[];
export function applyStackFixes(text: string, fixes: StackFix[]): string;
