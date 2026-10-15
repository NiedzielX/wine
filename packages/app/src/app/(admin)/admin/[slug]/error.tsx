'use client';

import { Button, ErrorMessage } from '@wine-match/ui';
import { Page } from '../_components/admin-shell';
import { useErrorTexts } from '../_components/error-texts';

/** Error state of a dashboard page: say what happened, offer a retry. Texts in the dashboard's language. */
export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useErrorTexts();
  return (
    <Page>
      <ErrorMessage title={t.title} message={t.text} action={<Button onClick={reset}>{t.retry}</Button>} />
    </Page>
  );
}
