import { Button } from '@wine-match/ui';
import Link from 'next/link';
import { getI18n } from '@/server/i18n';

/** Shown when a signed-in user opens a restaurant they have no access to. */
export default async function Forbidden() {
  const t = (await getI18n()).t.admin.forbidden;
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-content-center justify-items-center gap-3 px-6 text-center">
      <h1 className="font-serif text-3xl">{t.title}</h1>
      <p className="text-muted-foreground">{t.text}</p>
      <Button asChild variant="outline"><Link href="/admin">{t.back}</Link></Button>
    </main>
  );
}
