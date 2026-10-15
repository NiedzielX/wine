import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../_components/admin-shell';
import { PrintButton } from '../../_components/print-button';
import { requireAccess } from '@/server/auth';
import { env } from '@/server/env';
import { guestUrl } from '@/server/qr';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'QR code' };

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

  return (
    <Page>
      <div className="print:hidden">
        <PageHeader title="QR code" description="Put it on every table. Guests scan it, choose a dish and see the wines that go with it." actions={<PrintButton>Print table tent</PrintButton>} />
        {!setup.published && <Alert className="mb-5"><AlertDescription><span>The guest app shows an empty menu until you <Link className="underline" href={`/admin/${slug}/publish`}>publish</Link>. You can print the code now: it will not change.</span></AlertDescription></Alert>}
        {local && <Alert variant="destructive" className="mb-5"><AlertDescription><span>This code points to <code>{url}</code>, an address that only works on this computer. Set <code>PUBLIC_BASE_URL</code> to your real address before printing.</span></AlertDescription></Alert>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] print:block">
        <Card id="tent" className="print:border-0 print:shadow-none">
          <CardContent className="grid justify-items-center gap-4 py-10 text-center">
            <span className="font-serif text-3xl">{r.name}</span>
            <p className="max-w-[24ch] font-serif text-2xl leading-tight">Find the wine for what you’re eating.</p>
            {/* the code is an image served by the API: a real SVG, sharp at any print size */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${img}?format=svg&size=640`} alt={`QR code that opens ${r.name}`} width={320} height={320} className="size-80 max-w-full" />
            <p className="text-sm text-muted-foreground">Scan with your phone’s camera</p>
            <small className="text-xs text-muted-foreground">{url}</small>
          </CardContent>
        </Card>
        <div className="grid content-start gap-6 print:hidden">
          <Card>
            <CardHeader><CardTitle>Download</CardTitle><CardDescription>SVG is sharp at any size: best for a print shop.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><a href={`${img}?format=svg&size=1024&download=1`}>SVG</a></Button>
              <Button asChild variant="outline"><a href={`${img}?format=png&size=1024&download=1`}>PNG 1024 px</a></Button>
              <Button asChild variant="outline"><a href={`${img}?format=png&size=2048&download=1`}>PNG 2048 px</a></Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Link</CardTitle><CardDescription>The same address, for a menu, a website or a message.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <code className="break-all rounded-md bg-muted px-3 py-2">{url}</code>
              <div><Button asChild variant="outline" size="sm"><Link href={`/r/${slug}`}>Open guest app</Link></Button></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}
