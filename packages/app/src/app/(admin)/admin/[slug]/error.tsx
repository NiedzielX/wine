'use client';

import { Button, ErrorMessage } from '@wine-match/ui';
import { Page } from '../_components/admin-shell';

/** Error state of a dashboard page: say what happened, offer a retry. */
export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Page>
      <ErrorMessage title="This page didn’t load" message="Something went wrong while loading the data. Guests are not affected. Try again in a moment." action={<Button onClick={reset}>Try again</Button>} />
    </Page>
  );
}
