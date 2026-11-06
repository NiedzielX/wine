'use server';

import type { Role } from '@wine-match/core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { act, perform, safeBack, str, version } from '@/server/action-runner';
import { invitationLink } from '@/server/invitations';

/**
 * Server actions of A15 "Team" (spec E12 F1). Plain form posts like the other dashboard actions. The permission is
 * `team.manage`; the hierarchy (who may touch an owner, who may grant what, nobody changes themselves or the last
 * owner) is `TeamService`'s, so a form posted directly gets the same answer. A missing `version` never matches.
 */

export async function changeMemberRole(form: FormData) {
  return act(form, 'team.manage', async ({ c, slug, actor, form: f }) => {
    await c.teamService.changeRole(slug, str(f, 'membershipId'), str(f, 'role') as Role, actor, version(f) ?? 0);
    return { saved: 'member_role_changed' };
  });
}

export async function deactivateMember(form: FormData) {
  return act(form, 'team.manage', async ({ c, slug, actor, form: f }) => {
    await c.teamService.deactivate(slug, str(f, 'membershipId'), actor, version(f) ?? 0);
    return { saved: 'member_deactivated' };
  });
}

export async function reactivateMember(form: FormData) {
  return act(form, 'team.manage', async ({ c, slug, actor, form: f }) => {
    await c.teamService.reactivate(slug, str(f, 'membershipId'), actor, version(f) ?? 0);
    return { saved: 'member_reactivated' };
  });
}

/** The state of the invitation form: it carries the link of the invitation just made (shown once) or the reason it failed. */
export type InviteState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'created'; link: string; email: string; role: Role };

/**
 * Invites by e-mail (spec E12 F2, R4). Unlike the other actions it does not redirect: the link of the new invitation is stored
 * nowhere and must reach the inviter exactly once, so it is the state of the form (`useActionState`), which the server renders
 * into the response of the post: it works without JavaScript and the link never appears in a URL, a cookie or a log.
 */
export async function inviteMember(_previous: InviteState, form: FormData): Promise<InviteState> {
  const slug = str(form, 'slug');
  const result = await perform(form, 'team.manage', async ({ c, slug: s, actor, form: f }) => {
    const issued = await c.invitationService.invite(s, { email: str(f, 'email'), role: str(f, 'role') as Role }, actor);
    return { link: invitationLink(issued.token), email: issued.invitation.email, role: issued.invitation.role };
  });
  if (result === 'signed-out') redirect(`/admin/login?next=${encodeURIComponent(safeBack(slug, str(form, 'back')))}`);
  revalidatePath(`/admin/${slug}`, 'layout');
  const { flash } = result;
  if (flash.error) return { status: 'error', error: flash.error };
  return { status: 'created', link: flash.link, email: flash.email, role: flash.role as Role };
}

export async function revokeInvitation(form: FormData) {
  return act(form, 'team.manage', async ({ c, slug, actor, form: f }) => {
    await c.invitationService.revoke(slug, str(f, 'invitationId'), actor);
    return { saved: 'invitation_revoked' };
  });
}
