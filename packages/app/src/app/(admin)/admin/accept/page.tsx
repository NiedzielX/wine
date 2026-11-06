import { MIN_PASSWORD_LENGTH, roleLabel } from '@wine-match/core';
import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { acceptInvitation } from '../accept-actions';
import { logout } from '../auth-actions';
import { getPrincipal } from '@/server/auth';
import { getI18n } from '@/server/i18n';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  // no referrer: the token is in the address, and a link on this page (or a script) must never pass it on (spec E12 R4)
  return { title: (await getI18n()).t.admin.meta.acceptInvitation, referrer: 'no-referrer', robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * A17 — accept an invitation (spec E12 F2, R4). The GET only shows a form: reading the page changes nothing, and the token
 * leaves the address only inside the POST body. Public (no `requireAccess`), outside `[slug]` and outside `(lists)` so a dead link
 * is a real 404. A link that does not work for any reason shows the one "not valid" page.
 */
export default async function AcceptInvitationPage({ searchParams }: Props) {
  const sp = await searchParams;
  const token = typeof sp.token === 'string' ? sp.token : '';
  const scope = await getRequestScope();
  const offer = token ? await scope.cradle.invitationService.offer(token) : null;
  if (!offer) notFound();
  const principal = await getPrincipal();
  const { t } = await getI18n();
  const a = t.admin.accept;
  const error = typeof sp.error === 'string' && Object.hasOwn(a.errors, sp.error) ? sp.error : typeof sp.error === 'string' ? 'unexpected' : '';
  const entry = error ? a.errors[error] : undefined;
  const message = typeof entry === 'function' ? entry(MIN_PASSWORD_LENGTH) : entry;
  const signedInAsInvitee = principal?.user.email === offer.email;

  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-serif text-3xl font-normal">{a.title}</CardTitle>
          <CardDescription>{a.description(offer.restaurantName, t.admin.roles[offer.role] ?? roleLabel(offer.role))}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {message && <Alert variant="destructive" role="alert"><AlertDescription>{message}</AlertDescription></Alert>}
          <p className="text-sm text-muted-foreground">{a.email}: <b className="break-all text-foreground">{offer.email}</b></p>
          {!offer.accountExists && (
            <form action={acceptInvitation} className="grid gap-4">
              <input type="hidden" name="token" value={token} />
              <p className="text-sm">{a.newText}</p>
              <div className="grid gap-1.5"><Label htmlFor="name">{a.name}</Label><Input id="name" name="name" type="text" autoComplete="name" required maxLength={120} autoFocus /></div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">{a.password}</Label>
                <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={128} aria-describedby="password-help" />
                <small id="password-help" className="text-muted-foreground">{a.passwordHelp(MIN_PASSWORD_LENGTH)}</small>
              </div>
              <Button type="submit">{a.submitNew}</Button>
            </form>
          )}
          {offer.accountExists && signedInAsInvitee && (
            <form action={acceptInvitation} className="grid gap-4">
              <input type="hidden" name="token" value={token} />
              <p className="text-sm">{a.existingText}</p>
              <Button type="submit">{a.submitExisting}</Button>
            </form>
          )}
          {offer.accountExists && !principal && (
            <div className="grid gap-4">
              <p className="text-sm">{a.signInText}</p>
              <Button asChild><Link href="/admin/login">{a.signIn}</Link></Button>
            </div>
          )}
          {offer.accountExists && principal && !signedInAsInvitee && (
            <form action={logout} className="grid gap-4">
              <p className="text-sm">{a.wrongAccountText(offer.email)}</p>
              <Button type="submit" variant="outline">{a.signOut}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
