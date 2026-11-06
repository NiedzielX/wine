import { InvariantError } from '../errors';
import { AUTH_EVENT_META_KEYS, AUTH_EVENT_TYPES, type AuthEvent } from './types';

/** Longest value a meta field may carry: ids, role names and version numbers are far shorter. */
const MAX_META_VALUE = 80;
/** Most events one page of the trail returns; a request for more gets this many. */
export const MAX_AUTH_EVENTS = 500;
export const DEFAULT_AUTH_EVENTS = 100;

/** The page size for a requested `limit`: the default when absent, at least 1, at most `MAX_AUTH_EVENTS`. */
export const authEventLimit = (limit?: number): number => (limit === undefined || !Number.isFinite(limit) ? DEFAULT_AUTH_EVENTS : Math.min(MAX_AUTH_EVENTS, Math.max(1, Math.floor(limit))));

/**
 * What the trail may store (spec E12 R11), enforced by every repository before it writes: a known type, only the
 * keys of `AUTH_EVENT_META_KEYS` with short scalar values and no e-mail address, and, for a restaurant's event, the
 * restaurant the caller says it is (`restaurantId`; null for an event that belongs to none). An event that breaks a
 * rule is refused, not trimmed: a password, a PIN or a token must never reach the table by a slip in a later phase.
 */
export function assertValidAuthEvent(restaurantId: string | null, e: AuthEvent): void {
  const bad = (code: string, message: string) => new InvariantError(code, message);
  if (!AUTH_EVENT_TYPES.includes(e.type)) throw bad('invalid_event', 'Unknown event type.');
  if (e.restaurantId !== restaurantId) throw bad('event_restaurant_mismatch', 'The event belongs to another restaurant.');
  const allowed: readonly string[] = AUTH_EVENT_META_KEYS;
  for (const [key, value] of Object.entries(e.meta)) {
    if (!allowed.includes(key)) throw bad('invalid_event_meta', `Event meta key "${key}" is not allowed.`);
    if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') throw bad('invalid_event_meta', `Event meta "${key}" must be a scalar.`);
    if (typeof value === 'string' && (value.length > MAX_META_VALUE || value.includes('@'))) throw bad('invalid_event_meta', `Event meta "${key}" may not hold an address or a long text.`);
  }
}

/**
 * The events of one change of membership: at least one, each valid for this restaurant, naming the person who made
 * the change as actor and the changed person as subject, none repeated.
 */
export function assertChangeEvents(restaurantId: string, actorUserId: string, subjectUserId: string, events: AuthEvent[]): void {
  if (events.length === 0) throw new InvariantError('invalid_event', 'A change needs its audit event.');
  if (new Set(events.map((e) => e.id)).size !== events.length) throw new InvariantError('duplicate_event', 'The audit events must be distinct.');
  for (const e of events) {
    assertValidAuthEvent(restaurantId, e);
    if (e.actorUserId !== actorUserId) throw new InvariantError('event_actor_mismatch', 'The event names another actor than the change.');
    if (e.subjectUserId !== subjectUserId) throw new InvariantError('event_subject_mismatch', 'The event names another person than the one changed.');
  }
}

/** The event of an invitation change: this type, this restaurant, this actor, naming this invitation, valid for the trail. */
export function assertInvitationEvent(restaurantId: string, e: AuthEvent, type: 'invite_created' | 'invite_revoked', actorUserId: string, invitationId: string): void {
  assertValidAuthEvent(restaurantId, e);
  if (e.type !== type) throw new InvariantError('invalid_event', `The event must be ${type}.`);
  if (e.actorUserId !== actorUserId) throw new InvariantError('event_actor_mismatch', 'The event names another actor than the change.');
  if (e.meta.invitation_id !== invitationId) throw new InvariantError('invalid_event', 'The event names another invitation.');
}
