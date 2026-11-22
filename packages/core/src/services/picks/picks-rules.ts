/**
 * Pure rules of the restaurant's picks (spec 2026-11-18-restaurant-picks). Here: the fingerprint of the working set that
 * a form sends back as `expectedVersion`. The service with the permission and the routes come in a later step.
 */

/** A short fingerprint of the working set: the wine ids, sorted and unique, hashed (FNV-1a; no `node:crypto` in core). */
export function picksVersion(wineIds: Iterable<string>): string {
  const s = JSON.stringify([...new Set(wineIds)].sort());
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return `${h.toString(16).padStart(8, '0')}-${s.length}`;
}
