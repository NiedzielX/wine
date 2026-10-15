import type { EntityStatus, Pairing, PairingRole } from '@wine-match/core';
import { Badge } from '@wine-match/ui';

const SOFT = {
  sage: 'border-transparent bg-sage-soft text-sage',
  brass: 'border-transparent bg-brass-soft text-brass'
} as const;

export function DishStatusBadge({ status }: { status: EntityStatus }) {
  if (status === 'published') return <Badge className={SOFT.sage}>Published</Badge>;
  if (status === 'draft') return <Badge className={SOFT.brass}>Draft</Badge>;
  return <Badge variant="secondary">Hidden</Badge>;
}

export function ProfileBadge({ source }: { source: 'draft' | 'confirmed' }) {
  return source === 'confirmed' ? <Badge className={SOFT.sage}>Confirmed</Badge> : <Badge className={SOFT.brass}>Draft, needs check</Badge>;
}

export function ActiveBadge({ active, compact = false }: { active: boolean; compact?: boolean }) {
  return active ? <Badge className={SOFT.sage}>Active</Badge> : <Badge variant="secondary">{compact ? 'Hidden' : 'Hidden from guests'}</Badge>;
}

const PAIRING_STATUS: Record<Pairing['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  approved: { label: 'Sommelier approved', variant: 'default' },
  modified: { label: 'Sommelier modified', variant: 'default' },
  suggested: { label: 'Suggested', variant: 'secondary' },
  rejected: { label: 'Rejected', variant: 'destructive' }
};

export function PairingStatusBadge({ status }: { status: Pairing['status'] }) {
  const s = PAIRING_STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

const ROLE: Record<PairingRole, string> = { primary: 'Primary', alternative: 'Alternative', best_value: 'Best value' };

export function RoleBadge({ role }: { role: PairingRole | null }) {
  if (!role) return null;
  return role === 'best_value' ? <Badge className={SOFT.sage}>{ROLE[role]}</Badge> : <Badge variant="outline">{ROLE[role]}</Badge>;
}

export function ScoreBadge({ score }: { score: number }) {
  return <Badge variant="outline" className="tabular-nums" title="Engine match score">{score}%</Badge>;
}
