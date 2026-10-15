import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@wine-match/ui';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { login } from '../auth-actions';
import { getPrincipal, safeNext } from '@/server/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ERRORS: Record<string, string> = {
  invalid_credentials: 'The e-mail or password is incorrect, or the account is temporarily locked.',
  no_panel_access: 'This account has no access to the dashboard. Waiters use the pairing lookup instead.',
  unexpected: 'Sign-in failed. Try again in a moment.'
};

/** A0 — sign in. One message for every failed attempt, so it cannot be used to find accounts. */
export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === 'string' ? sp.next : null);
  const principal = await getPrincipal();
  if (principal) redirect(next ?? '/admin');
  const error = typeof sp.error === 'string' ? sp.error : '';

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <span className="font-serif text-2xl">Wine Match</span>
        <div>
          <h1 className="max-w-[12ch] font-serif text-5xl leading-[1.05]">Your list. Your pairings.</h1>
          <p className="mt-5 max-w-[40ch] opacity-80">Review the pairings guests see, keep the wine list current and follow how your tables order wine.</p>
        </div>
        <small className="opacity-60">For restaurant teams</small>
      </section>
      <section className="grid place-items-center px-6 py-12">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="font-serif text-3xl font-normal">Sign in</CardTitle>
            <CardDescription>Use your work e-mail.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={login} className="grid gap-4">
              {next && <input type="hidden" name="next" value={next} />}
              {error && <Alert variant="destructive" role="alert"><AlertDescription>{ERRORS[error] ?? ERRORS.unexpected}</AlertDescription></Alert>}
              <div className="grid gap-1.5"><Label htmlFor="email">Work e-mail</Label><Input id="email" name="email" type="email" autoComplete="username" required autoFocus /></div>
              <div className="grid gap-1.5"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="current-password" required /></div>
              <Button type="submit">Sign in</Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
