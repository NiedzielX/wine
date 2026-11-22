import type { DishProfile, WineProfile, WineProfileSource } from '../../domain/types';
import { VersionConflictError } from '../../errors';
import { dishScales, wineScales, sameDishScales, sameWineScales } from '../publishing/snapshot';

/**
 * Pure rules of the profile commands (spec 2026-11-04-panel-completion, R3, R4). A dish or wine has no version column,
 * so the caller's `expectedVersion` is a fingerprint of the profile it saw: the scales and the state (draft or
 * confirmed), so a confirmation by someone else in between is a conflict too.
 */
export interface ProfilePlan<T> {
  next: T;
  /** the scales or the state differ from the stored profile; false = nothing to write, no audit row */
  changed: boolean;
}

/** A short fingerprint of a stored profile: what a form sends back as `version`. */
export function profileVersion(profile: DishProfile | WineProfile): string {
  const scales = 'protein' in profile ? dishScales(profile) : wineScales(profile);
  const s = JSON.stringify([scales, 'protein' in profile ? profile.source : profile.source ?? 'confirmed']);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return `${h.toString(16).padStart(8, '0')}-${s.length}`;
}

/** Throws VersionConflictError when someone changed the profile after the caller read it. */
export function checkProfileVersion(current: DishProfile | WineProfile, expectedVersion: string | undefined): void {
  if (expectedVersion !== undefined && expectedVersion !== '' && expectedVersion !== profileVersion(current)) throw new VersionConflictError();
}

export interface ProfileStamp { confirmedAt: string; confirmedBy: string }

type DishScalesOnly = ReturnType<typeof dishScales>;
type WineScalesOnly = ReturnType<typeof wineScales>;

/**
 * `confirm: true` confirms (who and when from the stamp); `confirm: false` makes it a draft and keeps who confirmed
 * it before out of the profile. Saving a draft over a draft, or a confirmation over a confirmation with the same
 * scales, changes nothing.
 */
export function planDishProfile(current: DishProfile, scales: DishScalesOnly, confirm: boolean, stamp: ProfileStamp): ProfilePlan<DishProfile> {
  const same = sameDishScales(current, scales);
  const state = current.source === 'confirmed';
  if (same && state === confirm) return { next: current, changed: false };
  const next: DishProfile = confirm
    ? { ...scales, source: 'confirmed', confirmedAt: stamp.confirmedAt, confirmedBy: stamp.confirmedBy }
    : { ...scales, source: 'draft', confirmedAt: null, confirmedBy: null };
  return { next, changed: true };
}

/**
 * A wine saved as a draft keeps a draft source it already has (`catalog` or `grape_defaults`); a confirmed one falls
 * back to `grape_defaults` (the domain does not know catalog wines yet, so `catalog` is only ever kept, spec Q4).
 */
export function planWineProfile(current: WineProfile, scales: WineScalesOnly, confirm: boolean, stamp: ProfileStamp): ProfilePlan<WineProfile> {
  const same = sameWineScales(current, scales);
  const source: WineProfileSource = current.source ?? 'confirmed';
  if (same && (source === 'confirmed') === confirm) return { next: current, changed: false };
  const next: WineProfile = confirm
    ? { ...scales, source: 'confirmed', confirmedAt: stamp.confirmedAt, confirmedBy: stamp.confirmedBy }
    : { ...scales, source: source === 'confirmed' ? 'grape_defaults' : source, confirmedAt: null, confirmedBy: null };
  return { next, changed: true };
}

/** The shape of a profile in an audit row: the scales and the state, never more. */
export function auditProfile(profile: DishProfile | WineProfile): Record<string, unknown> {
  const scales = 'protein' in profile ? dishScales(profile) : wineScales(profile);
  return { ...scales, source: 'protein' in profile ? profile.source : profile.source ?? 'confirmed', confirmedAt: profile.confirmedAt ?? null, confirmedBy: profile.confirmedBy ?? null };
}
