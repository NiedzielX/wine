import type { Pairing, PairingRole } from '../../domain/types';
import { ValidationError } from '../../errors';
import type { DecisionAction, DecisionRecord, PairingChangeSet, PairingOp } from '../../ports/repositories';

/**
 * The sommelier's rules for pairings, as pure functions over a working copy of one dish's pairings.
 * A `DishPlan` records what changes; `finish()` turns it into the operations and audit entries
 * that a repository applies atomically. No I/O here — everything is testable without a database.
 */

export const MAX_COMMENT = 140;

export const isReviewed = (p: Pairing) => p.status === 'approved' || p.status === 'modified';

/** Reviewed pairings in guest order: the primary first, then by the sommelier's rank, then by score. */
export function orderReviewed(pairings: Pairing[]): Pairing[] {
  return pairings
    .filter(isReviewed)
    .sort((a, b) => (a.role === 'primary' ? 0 : 1) - (b.role === 'primary' ? 0 : 1) || (a.rank ?? 99) - (b.rank ?? 99) || b.modelScore - a.modelScore || a.id.localeCompare(b.id));
}

interface Fields { status: Pairing['status']; role: PairingRole | null; rank: number | null; comment: string | null }
const fieldsOf = (p: Pairing): Fields => ({ status: p.status, role: p.role, rank: p.rank, comment: p.comment });

export interface PlanContext {
  /** display name (kept on the pairing as `updatedBy`) */
  actor: string;
  actorId: string | null;
  at: string;
  newId: () => string;
}

export class DishPlan {
  private readonly state = new Map<string, Pairing>();
  private readonly original = new Map<string, Fields>();
  private readonly originalVersion = new Map<string, number | undefined>();
  private readonly order: string[] = [];
  private readonly created = new Set<string>();
  private readonly deleted = new Set<string>();
  private readonly expected = new Map<string, number>();

  constructor(pairings: Pairing[], private readonly ctx: PlanContext) {
    for (const p of pairings) {
      this.state.set(p.id, { ...p });
      this.original.set(p.id, fieldsOf(p));
      this.originalVersion.set(p.id, p.version);
    }
  }

  /** Version the caller saw; the repository rejects the change if the record moved on. */
  expect(id: string, version: number | undefined): void {
    if (version !== undefined) this.expected.set(id, version);
  }

  list(): Pairing[] {
    return [...this.state.values()].filter((p) => !this.deleted.has(p.id));
  }

  get(id: string): Pairing {
    const p = this.state.get(id);
    if (!p || this.deleted.has(id)) throw new ValidationError('unknown_pairing', 'Unknown pairing.');
    return p;
  }

  private touch(id: string) {
    if (!this.order.includes(id)) this.order.push(id);
  }

  update(id: string, fields: Partial<Fields>): void {
    const p = this.get(id);
    this.touch(id);
    Object.assign(p, fields);
  }

  create(pairing: Pairing): void {
    this.state.set(pairing.id, pairing);
    this.created.add(pairing.id);
    this.touch(pairing.id);
  }

  remove(id: string): void {
    this.get(id);
    this.touch(id);
    this.deleted.add(id);
  }

  /** Re-numbers the reviewed pairings 1..n in guest order. Only changed ranks become operations. */
  normaliseRanks(): void {
    orderReviewed(this.list()).forEach((p, i) => {
      if (p.rank !== i + 1) this.update(p.id, { rank: i + 1 });
    });
  }

  finish(): PairingChangeSet {
    const ops: PairingOp[] = [];
    const decisions: DecisionRecord[] = [];
    for (const id of this.order) {
      const now = this.state.get(id)!;
      if (this.created.has(id)) {
        if (this.deleted.has(id)) continue;
        ops.push({ kind: 'create', pairing: { ...now, updatedBy: this.ctx.actor, updatedAt: this.ctx.at, dirty: true } });
        decisions.push(this.decision(now, 'create', null, fieldsOf(now)));
        continue;
      }
      const before = this.original.get(id)!;
      const expectedVersion = this.expected.get(id) ?? this.originalVersion.get(id);
      if (this.deleted.has(id)) {
        ops.push({ kind: 'delete', id, expectedVersion });
        decisions.push(this.decision(now, 'delete', before, null));
        continue;
      }
      const after = fieldsOf(now);
      const patch: Partial<Fields> = {};
      (Object.keys(after) as Array<keyof Fields>).forEach((k) => { if (after[k] !== before[k]) (patch as Record<string, unknown>)[k] = after[k]; });
      if (Object.keys(patch).length === 0) continue;
      ops.push({ kind: 'update', id, expectedVersion, patch: { ...patch, updatedBy: this.ctx.actor, updatedAt: this.ctx.at } });
      decisions.push(this.decision(now, actionOf(before, after), before, after));
    }
    return { ops, decisions };
  }

  private decision(p: Pairing, action: DecisionAction, before: Fields | null, after: Fields | null): DecisionRecord {
    return { id: this.ctx.newId(), pairingId: p.id, dishId: p.dishId, wineId: p.wineId, actor: this.ctx.actor, actorId: this.ctx.actorId, action, before: before && { ...before }, after: after && { ...after }, at: this.ctx.at };
  }
}

function actionOf(before: Fields, after: Fields): DecisionAction {
  if (after.status !== before.status) {
    if (after.status === 'rejected') return 'reject';
    if (after.status === 'suggested') return 'restore';
    if (after.status === 'modified') return 'modify';
    return 'approve';
  }
  if (after.role !== before.role) return 'set_role';
  if (after.comment !== before.comment) return 'comment';
  return 'reorder';
}

/* ---------------- rules ---------------- */

const hasOtherPrimary = (plan: DishPlan, id: string) => plan.list().some((x) => x.id !== id && isReviewed(x) && x.role === 'primary');

function checkComment(text: string): string | null {
  const c = text.trim();
  if (c.length > MAX_COMMENT) throw new ValidationError('comment_too_long', `The note can have at most ${MAX_COMMENT} characters.`, { comment: `max_${MAX_COMMENT}` });
  return c || null;
}

/** Approve a suggestion: the first approved pairing of a dish becomes its primary, later ones alternatives. */
export function approve(plan: DishPlan, id: string): void {
  const p = plan.get(id);
  if (isReviewed(p)) return;
  plan.update(id, { status: 'approved', role: hasOtherPrimary(plan, id) ? 'alternative' : 'primary', rank: null });
  plan.normaliseRanks();
}

export function reject(plan: DishPlan, id: string): void {
  if (plan.get(id).status === 'rejected') return;
  plan.update(id, { status: 'rejected', role: null, rank: null });
  plan.normaliseRanks();
}

export function restore(plan: DishPlan, id: string): void {
  if (plan.get(id).status !== 'rejected') throw new ValidationError('not_rejected', 'Only a rejected pairing can be restored.');
  plan.update(id, { status: 'suggested', role: null, rank: null });
}

export function setRole(plan: DishPlan, id: string, role: PairingRole): void {
  const p = plan.get(id);
  if (p.status === 'rejected') throw new ValidationError('pairing_rejected', 'Restore the pairing before changing its role.');
  if (role === 'primary') {
    // the store allows one primary per dish and cannot defer the check, so demote first
    for (const other of plan.list()) if (other.id !== id && isReviewed(other) && other.role === 'primary') plan.update(other.id, { role: 'alternative' });
  }
  plan.update(id, { role, status: isReviewed(p) ? p.status : 'approved' });
  plan.normaliseRanks();
}

export function setComment(plan: DishPlan, id: string, text: string): void {
  const comment = checkComment(text);
  const p = plan.get(id);
  if (p.status === 'rejected') throw new ValidationError('pairing_rejected', 'Restore the pairing before adding a note.');
  if (comment === p.comment) return;
  if (!isReviewed(p)) approve(plan, id);
  plan.update(id, { comment, status: 'modified' });
}

export function move(plan: DishPlan, id: string, dir: -1 | 1): void {
  const list = orderReviewed(plan.list());
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) throw new ValidationError('not_reviewed', 'Only approved pairings can be reordered.');
  const p = list[i];
  const j = i + dir;
  if (p.role === 'primary') throw new ValidationError('primary_is_pinned', 'The primary pairing always stays first.');
  if (j < 0 || j >= list.length || list[j].role === 'primary') throw new ValidationError('cannot_move', 'This pairing cannot move further in that direction.');
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((x, k) => { if (x.rank !== k + 1) plan.update(x.id, { rank: k + 1 }); });
  if (p.status === 'approved') plan.update(id, { status: 'modified' });
}

export interface ManualPairing { dishId: string; wineId: string; role: PairingRole | null; comment: string; modelScore: number }

export function addManual(plan: DishPlan, input: ManualPairing, ctx: PlanContext): void {
  const comment = checkComment(input.comment);
  const existing = plan.list().find((x) => x.wineId === input.wineId);
  if (existing && isReviewed(existing)) throw new ValidationError('already_paired', 'This wine is already paired with the dish.', { wineId: 'already_paired' });
  const role = input.role ?? 'alternative';
  if (role === 'primary') {
    for (const other of plan.list()) if (other.id !== existing?.id && isReviewed(other) && other.role === 'primary') plan.update(other.id, { role: 'alternative' });
  }
  const status = comment ? 'modified' : 'approved';
  if (existing) {
    plan.update(existing.id, { status, role, comment, rank: null });
  } else {
    plan.create({
      id: ctx.newId(), dishId: input.dishId, wineId: input.wineId, status, role, rank: null, comment, modelScore: input.modelScore,
      source: 'sommelier', updatedBy: ctx.actor, updatedAt: ctx.at, dirty: true
    });
  }
  plan.normaliseRanks();
}

export function removeManual(plan: DishPlan, id: string): void {
  if (plan.get(id).source !== 'sommelier') throw new ValidationError('only_manual_pairings_can_be_deleted', 'Engine pairings can be rejected, not deleted.');
  plan.remove(id);
  plan.normaliseRanks();
}

/** Approves every suggestion of the dish, best score first. */
export function approveAllSuggested(plan: DishPlan): number {
  const todo = plan.list().filter((p) => p.status === 'suggested').sort((a, b) => b.modelScore - a.modelScore || a.id.localeCompare(b.id));
  for (const p of todo) approve(plan, p.id);
  return todo.length;
}
