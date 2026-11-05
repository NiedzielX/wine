'use server';

import type { Role } from '@wine-match/core';
import { act, str, version } from '@/server/action-runner';

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
