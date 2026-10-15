import { LoadingMessage } from '@wine-match/ui';
import { Page } from '../../_components/admin-shell';

/** Skeleton shown while a dashboard list page loads (spec: loading state = skeleton, not a spinner). */
export default function Loading() {
  return (
    <Page as="div">
      <LoadingMessage label="Loading the page" />
    </Page>
  );
}

// This file lives in the (lists) route group on purpose: loading.tsx makes Next.js stream the page,
// and a streamed page can no longer answer 404 or redirect with the right HTTP status. Detail pages
// (menu/[dishId], wines/[wineId], pairings/...) sit outside the group so notFound() returns a real 404.
