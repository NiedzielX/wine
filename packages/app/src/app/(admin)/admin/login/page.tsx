import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@wine-match/ui';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { login } from '../auth-actions';
import { languageTitles } from '../_components/admin-shell';
import { LanguageSwitch } from '../_components/language-switch';
import { getPrincipal, safeNext } from '@/server/auth';
import { getI18n } from '@/server/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.signIn };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ERROR_CODES = ['invalid_credentials', 'no_panel_access', 'unexpected'] as const;

/** A0 — sign in. One message for every failed attempt, so it cannot be used to find accounts. */
export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === 'string' ? sp.next : null);
  const principal = await getPrincipal();
  if (principal) redirect(next ?? '/admin');
  const { locale, t } = await getI18n();
  const l = t.admin.login;
  const error = typeof sp.error === 'string' ? sp.error : '';
  const message = error ? l.errors[ERROR_CODES.find((c) => c === error) ?? 'unexpected'] : '';
  const back = next ? `/admin/login?next=${encodeURIComponent(next)}` : '/admin/login';

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <span className="font-serif text-2xl">Wine Match</span>
        <div>
          <h1 className="max-w-[14ch] font-serif text-5xl leading-[1.05]">{l.brandTitle}</h1>
          <p className="mt-5 max-w-[40ch] opacity-80">{l.brandText}</p>
        </div>
        <small className="opacity-60">{l.brandFooter}</small>
      </section>
      <section className="relative grid place-items-center px-6 py-16">
        <LanguageSwitch locale={locale} back={back} label={t.admin.language.label} titles={languageTitles(t)} className="absolute top-4 right-4" />
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="font-serif text-3xl font-normal">{l.title}</CardTitle>
            <CardDescription>{l.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={login} className="grid gap-4">
              {next && <input type="hidden" name="next" value={next} />}
              {message && <Alert variant="destructive" role="alert"><AlertDescription>{message}</AlertDescription></Alert>}
              <div className="grid gap-1.5"><Label htmlFor="email">{l.email}</Label><Input id="email" name="email" type="email" autoComplete="username" required autoFocus /></div>
              <div className="grid gap-1.5"><Label htmlFor="password">{l.password}</Label><Input id="password" name="password" type="password" autoComplete="current-password" required /></div>
              <Button type="submit">{l.submit}</Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
