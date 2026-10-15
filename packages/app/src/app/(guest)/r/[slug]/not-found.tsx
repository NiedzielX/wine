import Link from 'next/link';
import { getI18n } from '@/server/i18n';

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="grid justify-items-center gap-3 px-6 py-16 text-center">
      <h1 className="font-serif text-2xl">{t.guest.notFound.title}</h1>
      <p className="max-w-[30ch] text-ink-2">{t.guest.notFound.text}</p>
      <Link href="/" className="mt-2 inline-flex min-h-11 items-center rounded-full border border-[#d4ccd0] bg-surface px-5 font-semibold">{t.guest.notFound.action}</Link>
    </main>
  );
}
