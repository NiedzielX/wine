import { LoadingMessage } from '@wine-match/ui';
import { Page } from '../../_components/admin-shell';
import { getI18n } from '@/server/i18n';

/** Skeleton shown while a dashboard list page loads (spec: loading state = skeleton, not a spinner). */
export default async function Loading() {
  const { t } = await getI18n();
  return (
    <Page as="div">
      <LoadingMessage label={t.admin.loading} />
    </Page>
  );
}

// This file lives in the (lists) route group on purpose: loading.tsx makes Next.js stream the page,
// and a streamed page can no longer answer 404 or redirect with the right HTTP status. Detail pages
// (menu/[dishId], wines/[wineId], pairings/...) sit outside the group so notFound() returns a real 404.
