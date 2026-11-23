import type { ProofLaunchEntry, ProofLaunchView, ProofReportResult } from '@wine-match/core';

/**
 * The JSON shape of the results report in the API (spec 2026-11-18-owner-proof-report, R11, R14): the report as computed
 * (aggregates only, full precision) and the launch day log. The log shows the ROLE of whoever wrote an entry, never the
 * membership or a name; the entry `id` is what `If-Match` takes.
 */
export function launchEntryJson(e: ProofLaunchEntry) {
  return { id: e.id, seq: e.seq, launchDay: e.launchDay, reason: e.reason, setByRole: e.setByRole, setAt: e.setAt };
}

function launchViewJson(e: ProofLaunchView) {
  return { ...launchEntryJson(e), afterWindow1: e.afterWindow1 };
}

export function proofReportJson(r: ProofReportResult) {
  return {
    window: r.window,
    report: r.report,
    launch: { current: r.launch.current ? launchViewJson(r.launch.current) : null, history: r.launch.history.map(launchViewJson), changes: r.launch.changes }
  };
}
