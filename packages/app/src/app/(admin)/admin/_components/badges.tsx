import type { EntityStatus, Pairing, PairingRole } from '@wine-match/core';
import { Badge } from '@wine-match/ui';
import type { Dictionary } from '@/i18n/en';

const SOFT = {
  sage: 'border-transparent bg-sage-soft text-sage',
  brass: 'border-transparent bg-brass-soft text-brass'
} as const;

type T = { t: Dictionary };

export function DishStatusBadge({ status, t }: { status: EntityStatus } & T) {
  const b = t.admin.badges;
  if (status === 'published') return <Badge className={SOFT.sage}>{b.published}</Badge>;
  if (status === 'draft') return <Badge className={SOFT.brass}>{b.draft}</Badge>;
  return <Badge variant="secondary">{b.hidden}</Badge>;
}

export function ProfileBadge({ source, t }: { source: 'draft' | 'confirmed' } & T) {
  const b = t.admin.badges;
  return source === 'confirmed' ? <Badge className={SOFT.sage}>{b.confirmed}</Badge> : <Badge className={SOFT.brass}>{b.draftProfile}</Badge>;
}

export function ActiveBadge({ active, compact = false, t }: { active: boolean; compact?: boolean } & T) {
  const b = t.admin.badges;
  return active ? <Badge className={SOFT.sage}>{b.active}</Badge> : <Badge variant="secondary">{compact ? b.hidden : b.hiddenFromGuests}</Badge>;
}

const PAIRING_STATUS: Record<Pairing['status'], 'default' | 'secondary' | 'destructive'> = {
  approved: 'default', modified: 'default', suggested: 'secondary', rejected: 'destructive'
};

export function PairingStatusBadge({ status, t }: { status: Pairing['status'] } & T) {
  return <Badge variant={PAIRING_STATUS[status]}>{t.admin.badges.status[status]}</Badge>;
}

export function RoleBadge({ role, t }: { role: PairingRole | null } & T) {
  if (!role) return null;
  const label = t.admin.badges.roles[role];
  return role === 'best_value' ? <Badge className={SOFT.sage}>{label}</Badge> : <Badge variant="outline">{label}</Badge>;
}

/**
 * The engine's Match Score. Its meaning is read out with the number (`sr-only`), not hidden in a `title` that touch
 * and keyboard users never reach (spec 2026-10-16-how-it-works-explanations, R2, AC14).
 */
export function ScoreBadge({ score, t }: { score: number } & T) {
  return <Badge variant="outline" className="tabular-nums">{score}%<span className="sr-only"> {t.admin.common.engineScore}</span></Badge>;
}
