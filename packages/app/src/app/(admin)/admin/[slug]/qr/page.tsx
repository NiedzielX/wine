import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../_components/admin-shell';
import { PrintButton } from '../../_components/print-button';
import { requireAccess } from '@/server/auth';
import { getI18n } from '@/server/i18n';
import { env } from '@/server/env';
import { guestUrl } from '@/server/qr';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.qr };
}

type Props = { params: Promise<{ slug: string }> };

/** A12 — the QR code for the tables, with a table-tent layout that prints on its own. */
export default async function QrPage({ params }: Props) {
  const { slug } = await params;
  await requireAccess(slug);
  const setup = await (await getRequestScope()).cradle.adminService.setup(slug);
  if (!setup) notFound();
  const r = setup.restaurant;
  const url = guestUrl(slug);
  const img = `/api/v1/restaurants/${slug}/qr`;
  const local = env().publicBaseUrlIsDefault || url.includes('localhost');
  const { t } = await getI18n();
  const m = t.admin.qr;

  return (
    <Page>
      <div className="print:hidden">
        <PageHeader title={m.title} description={m.description} actions={<PrintButton>{m.print}</PrintButton>} />
        {!setup.published && <Alert className="mb-5"><AlertDescription><span>{m.unpublishedBefore} <Link className="underline" href={`/admin/${slug}/publish`}>{m.unpublishedLink}</Link>{m.unpublishedAfter}</span></AlertDescription></Alert>}
        {local && <Alert variant="destructive" className="mb-5"><AlertDescription><span>{m.localBefore} <code>{url}</code>{m.localAfter} <code>PUBLIC_BASE_URL</code> {m.localEnd}</span></AlertDescription></Alert>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] print:block">
        <Card id="tent" className="print:border-0 print:shadow-none">
          <CardContent className="grid justify-items-center gap-4 py-10 text-center">
            <span className="font-serif text-3xl">{r.name}</span>
            <p className="max-w-[24ch] font-serif text-2xl leading-tight">{m.tentLine}</p>
            {/* the code is an image served by the API: a real SVG, sharp at any print size */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${img}?format=svg&size=640`} alt={m.alt(r.name)} width={320} height={320} className="size-80 max-w-full" />
            <p className="text-sm text-muted-foreground">{m.scan}</p>
            <small className="text-xs text-muted-foreground">{url}</small>
          </CardContent>
        </Card>
        <div className="grid content-start gap-6 print:hidden">
          <Card>
            <CardHeader><CardTitle>{m.download}</CardTitle><CardDescription>{m.downloadText}</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><a href={`${img}?format=svg&size=1024&download=1`}>SVG</a></Button>
              <Button asChild variant="outline"><a href={`${img}?format=png&size=1024&download=1`}>PNG 1024 px</a></Button>
              <Button asChild variant="outline"><a href={`${img}?format=png&size=2048&download=1`}>PNG 2048 px</a></Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{m.link}</CardTitle><CardDescription>{m.linkText}</CardDescription></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <code className="break-all rounded-md bg-muted px-3 py-2">{url}</code>
              <div><Button asChild variant="outline" size="sm"><Link href={`/r/${slug}`}>{t.admin.common.openGuestApp}</Link></Button></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}
