import { Button } from '@wine-match/ui';
import Link from 'next/link';
import { getI18n } from '@/server/i18n';

export default async function NotFound() {
  const t = (await getI18n()).t.admin.notFound;
  return (
    <main className="mx-auto grid max-w-md justify-items-center gap-3 px-6 py-24 text-center">
      <h1 className="font-serif text-3xl">{t.title}</h1>
      <p className="text-muted-foreground">{t.text}</p>
      <Button asChild variant="outline"><Link href="/admin">{t.back}</Link></Button>
    </main>
  );
}
