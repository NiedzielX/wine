import { Button } from '@wine-match/ui';
import Link from 'next/link';

/** Shown when a signed-in user opens a restaurant they have no access to. */
export default function Forbidden() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-content-center justify-items-center gap-3 px-6 text-center">
      <h1 className="font-serif text-3xl">No access</h1>
      <p className="text-muted-foreground">Your account has no access to this restaurant’s dashboard. Ask the owner to add you, or sign in with another account.</p>
      <Button asChild variant="outline"><Link href="/admin">Back</Link></Button>
    </main>
  );
}
