import { grantableRoles, invitableRoles, mayManageMember, type Invitation, type Role, type TeamMember } from '@wine-match/core';
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, NativeSelect, NativeSelectOption } from '@wine-match/ui';
import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';
import { Page, PageHeader } from '../../_components/admin-shell';
import { ActionButton, Hidden } from '../../_components/action-form';
import { Flash } from '../../_components/flash';
import { first, formatDateTime } from '../../_components/format';
import { changeMemberRole, deactivateMember, inviteMember, reactivateMember, revokeInvitation } from '../team-actions';
import { InviteForm } from './invite-form';
import { requireAccess } from '@/server/auth';
import { isDomainError } from '@/server/domain-errors';
import { getI18n } from '@/server/i18n';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.team };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * A15 — team (spec E12 F1, F2): who has access to this restaurant, their role and status, and the pending invitations
 * with a form to invite. Needs `team.manage` (owner and general manager). Plain forms, no JavaScript. The buttons shown follow the hierarchy of `TeamService`; the service
 * and the actions check again, so a hidden button is a convenience, never the protection. Outside `(lists)`: no
 * `loading.tsx`, so a 403 stays a 403 (lesson nextjs-loading-streams-and-http-status).
 */
export default async function TeamPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireAccess(slug);
  if (!access.can('team.manage')) forbidden();
  const { locale, t } = await getI18n();
  const m = t.admin.team;
  const scope = await getRequestScope();
  // the service reads the stored membership: a person deactivated between the layout check and here gets a 403, not a 500
  const members = await scope.cradle.teamService.list(slug, access.actor).catch((e: unknown) => {
    if (isDomainError(e, 'forbidden')) forbidden();
    throw e;
  });
  const me = members.find((x) => x.userId === access.actor.id);
  if (!me) forbidden();
  const invitations = await scope.cradle.invitationService.list(slug, access.actor).catch((e: unknown) => {
    if (isDomainError(e, 'forbidden')) forbidden();
    throw e;
  });
  const inviteRoles = invitableRoles(me);
  const nowMs = scope.cradle.clock.now().getTime();
  const activeCount = members.filter((x) => x.status === 'active').length;
  const roles = grantableRoles(me);
  const common = { slug, back: `/admin/${slug}/team` };

  return (
    <Page>
      <PageHeader title={m.title} description={`${m.description} ${m.count(activeCount, members.length)}.`} />
      <Flash saved={first(sp.saved)} error={first(sp.error)} n={first(sp.n)} />
      <Alert className="mb-5" role="note"><AlertDescription>{m.roleHelp}</AlertDescription></Alert>
      <Card className="mb-5 gap-0 py-0">
        <CardHeader className="border-b py-4"><CardTitle>{m.invite.title}</CardTitle><CardDescription>{m.invite.description}</CardDescription></CardHeader>
        <CardContent className="py-4">
          {inviteRoles.length === 0 ? <p className="text-sm text-muted-foreground">{m.invite.noRoles}</p> : (
            <InviteForm
              action={inviteMember} slug={slug} back={common.back} roles={inviteRoles}
              roleNames={t.admin.roles}
              labels={{ email: m.invite.email, role: m.invite.role, submit: m.invite.submit, createdTitle: m.invite.createdTitle, createdText: m.invite.createdText, linkLabel: m.invite.linkLabel, errors: m.invite.errors }}
            />
          )}
        </CardContent>
      </Card>
      <Card className="mb-5 gap-0 py-0" data-pending-invitations>
        <CardHeader className="border-b py-4"><CardTitle>{m.invite.pendingTitle}</CardTitle></CardHeader>
        <CardContent className="px-0">
          {invitations.length === 0 ? <p className="px-6 py-4 text-sm text-muted-foreground">{m.invite.pendingNone}</p> : (
            <ul aria-label={m.invite.pendingLabel}>
              {invitations.map((inv) => <InvitationRow key={inv.id} invitation={inv} expired={Date.parse(inv.expiresAt) <= nowMs} canRevoke={inviteRoles.includes(inv.role)} common={common} locale={locale} t={t} />)}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4"><CardTitle>{m.listLabel}</CardTitle><CardDescription>{m.count(activeCount, members.length)}</CardDescription></CardHeader>
        <CardContent className="px-0">
          <ul aria-label={m.listLabel}>
            {members.map((member) => (
              <MemberRow key={member.membershipId} member={member} self={member.userId === me.userId} editable={mayManageMember(me, member)} roles={roles} common={common} locale={locale} t={t} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </Page>
  );
}

function MemberRow({ member, self, editable, roles, common, locale, t }: {
  member: TeamMember; self: boolean; editable: boolean; roles: Role[]; common: { slug: string; back: string };
  locale: Awaited<ReturnType<typeof getI18n>>['locale']; t: Awaited<ReturnType<typeof getI18n>>['t'];
}) {
  const m = t.admin.team;
  const off = member.status === 'deactivated';
  const fields = { ...common, membershipId: member.membershipId, version: member.version };
  // the current role is always listed (so the select shows it), but only roles the actor may grant can be chosen
  const options: Role[] = roles.includes(member.role) ? roles : [member.role, ...roles];
  return (
    <li className="grid gap-3 border-b px-6 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-center" data-member={member.membershipId}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <b className="font-medium break-words">{member.name}</b>
          {self && <Badge variant="outline">{m.you}</Badge>}
          <Badge variant={off ? 'secondary' : 'outline'} className={off ? '' : 'border-sage text-sage'}>{off ? m.deactivated : m.active}</Badge>
        </div>
        <p className="text-sm break-words text-muted-foreground">{member.email}</p>
        <p className="text-xs text-muted-foreground">{off ? m.deactivatedOn(formatDateTime(member.deactivatedAt, locale)) : m.lastSignIn(formatDateTime(member.lastLoginAt, locale))}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {editable && !off ? (
          <form action={changeMemberRole} className="flex flex-wrap items-center gap-2">
            <Hidden fields={fields} />
            <NativeSelect name="role" defaultValue={member.role} aria-label={m.roleLabel(member.name)} title={m.roleDescriptions[member.role]}>
              {options.map((r) => <NativeSelectOption key={r} value={r} disabled={!roles.includes(r)}>{t.admin.roles[r]}</NativeSelectOption>)}
            </NativeSelect>
            <Button type="submit" variant="outline" size="sm">{m.saveRole}</Button>
          </form>
        ) : (
          <Badge variant="secondary" title={m.roleDescriptions[member.role]}>{t.admin.roles[member.role]}</Badge>
        )}
        {editable && (off
          ? <ActionButton action={reactivateMember} fields={fields}>{m.reactivate}</ActionButton>
          : <ActionButton action={deactivateMember} fields={fields} variant="destructive">{m.deactivate}</ActionButton>)}
        {!editable && <span className="text-xs text-muted-foreground">{self ? m.yourself : m.ownerOnly}</span>}
      </div>
    </li>
  );
}

function InvitationRow({ invitation, expired, canRevoke, common, locale, t }: {
  invitation: Invitation; expired: boolean; canRevoke: boolean; common: { slug: string; back: string };
  locale: Awaited<ReturnType<typeof getI18n>>['locale']; t: Awaited<ReturnType<typeof getI18n>>['t'];
}) {
  const m = t.admin.team;
  return (
    <li className="grid gap-3 border-b px-6 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-center" data-invitation={invitation.id}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <b className="font-medium break-words">{invitation.email}</b>
          <Badge variant="secondary">{t.admin.roles[invitation.role]}</Badge>
          {expired && <Badge variant="outline">{m.invite.expired}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{invitation.createdByName ? `${m.invite.invitedBy(invitation.createdByName)}. ` : ''}{m.invite.validUntil(formatDateTime(invitation.expiresAt, locale))}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canRevoke
          ? <ActionButton action={revokeInvitation} fields={{ ...common, invitationId: invitation.id }} variant="destructive">{m.invite.revoke}</ActionButton>
          : <span className="text-xs text-muted-foreground">{m.invite.revokeOwnerOnly}</span>}
      </div>
    </li>
  );
}
