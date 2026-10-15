import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid justify-items-center gap-3 px-6 py-16 text-center">
      <h1 className="font-serif text-2xl">This menu isn’t available</h1>
      <p className="max-w-[30ch] text-ink-2">The link doesn’t match a restaurant or a dish on tonight’s menu. Scan the QR code on your table again or ask your waiter.</p>
      <Link href="/" className="mt-2 inline-flex min-h-11 items-center rounded-full border border-[#d4ccd0] bg-surface px-5 font-semibold">Open the menu</Link>
    </main>
  );
}
