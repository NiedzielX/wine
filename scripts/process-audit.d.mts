export type AuditStatus = 'PASS' | 'FAIL' | 'PARTIAL' | 'MANUAL';
export interface AuditResult {
  id: string;
  area: string;
  severity: 'high' | 'medium' | 'low';
  /** Who can close the gap: an agent through the normal PR path, or only the owner. */
  actor: 'agent' | 'owner';
  title: string;
  status: AuditStatus;
  evidence: string;
  /** Where the fix belongs (automatic checks). */
  fix?: string;
  /** Read-only `gh` command (MANUAL checks). */
  command?: string;
  expect?: string;
}
export interface AuditReport { summary: Record<AuditStatus, number>; results: AuditResult[] }
export function runAudit(root?: string, options?: { repo?: string }): AuditReport;
export function formatTable(report: AuditReport): string;
export function main(argv?: string[], out?: Pick<Console, 'log' | 'error'>): number;
