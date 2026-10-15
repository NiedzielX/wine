import { Button } from '@wine-match/ui';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto grid max-w-md justify-items-center gap-3 px-6 py-24 text-center">
      <h1 className="font-serif text-3xl">Not found</h1>
      <p className="text-muted-foreground">This restaurant, dish or wine doesn’t exist. It may have been removed in a recent import.</p>
      <Button asChild variant="outline"><Link href="/admin">Back to the dashboard</Link></Button>
    </main>
  );
}
