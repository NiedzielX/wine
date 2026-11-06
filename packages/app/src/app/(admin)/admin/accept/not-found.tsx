import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wine-match/ui';
import Link from 'next/link';
import { getI18n } from '@/server/i18n';

/**
 * A17 for a link that does not work: unknown, already used, cancelled, expired, or its inviter's access ended. ONE page for all of
 * them (spec E12 R4, AC7), answered with a real 404, and nothing on it says which case it was.
 */
export default async function InvalidInvitation() {
  const a = (await getI18n()).t.admin.accept;
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-serif text-3xl font-normal">{a.invalidTitle}</CardTitle>
          <CardDescription>{a.invalidText}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline"><Link href="/admin/login">{a.toSignIn}</Link></Button>
        </CardContent>
      </Card>
    </main>
  );
}
