import type { Invitation } from '@wine-match/core';
import { env } from './env';

/**
 * The link a person opens to accept an invitation (spec E12 R4): built from `PUBLIC_BASE_URL`, the one configured, fail-closed
 * public address of this installation, never from the Host header (which a request can choose). The token is base64url, so it needs
 * no escaping, but it goes through `encodeURIComponent` anyway.
 */
export const invitationLink = (token: string): string => `${env().publicBaseUrl}/admin/accept?token=${encodeURIComponent(token)}`;

/** The invitation as the API shows it. The token and its hash are never part of it; the link only comes with the answer to the call that created it. */
export const invitationJson = (i: Invitation) => ({
  id: i.id, email: i.email, role: i.role, createdBy: i.createdBy, createdByName: i.createdByName, createdAt: i.createdAt, expiresAt: i.expiresAt, expired: Date.parse(i.expiresAt) <= Date.now()
});
