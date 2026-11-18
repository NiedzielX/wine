/**
 * Comparing two reads of one guest surface (T-33, T-34). Pure helpers, no I/O, so that `tests/unit/guest-compare.test.ts` can pin them.
 *
 * Two reads of an unchanged state are NOT byte-identical, for two reasons that say nothing about the content:
 *  - the CSP nonce is per request;
 *  - the page streams: Next.js writes the React Flight rows (`<script>self.__next_f.push([1,"…"])</script>`) in the order the parts
 *    of the render resolve. On `/r/{slug}` the metadata rows (`f:null`, `15:[title, description]` from `generateMetadata`) race the
 *    page body (`c:[…]`): in about one read in ten the body row comes first. The rows, their ids and their contents are the same;
 *    only their order, and where they sit among the HTML chunks, differs.
 * So a read is normalised to: the HTML without the flight scripts, then the flight rows sorted. Every row stays, so nothing hides
 * in the comparison: a leaked value still shows up in the text, and a changed row still makes two reads differ.
 */

export interface GuestRead { status: number; text: string }
export type GuestReads = Record<string, GuestRead>;

/** One streamed chunk of Flight rows: `self.__next_f.push([1,"<rows as a JSON string>"])`. */
const FLIGHT_CHUNK = /<script>self\.__next_f\.push\((\[1,"(?:[^"\\]|\\.)*"\])\)<\/script>/g;

/** The nonce and the order of the streamed Flight rows taken out (see above). Deterministic: the same content gives the same text. */
export function normalise(text: string): string {
  const rows: string[] = [];
  const html = text.replace(FLIGHT_CHUNK, (_, chunk: string) => {
    rows.push(...(JSON.parse(chunk)[1] as string).split('\n').filter(Boolean));
    return '';
  });
  const flight = rows.length ? `\n<!--flight rows, sorted-->\n${rows.sort().join('\n')}` : '';
  return (html + flight).replace(/nonce="[^"]*"/g, 'nonce=""').replace(/"nonce":"[^"]*"/g, '"nonce":""');
}

/** The first difference of two reads: path, offset and ±80 characters around it, or null when they are equal. For failures in CI. */
export function firstDifference(a: GuestReads, b: GuestReads): string | null {
  for (const p of [...new Set([...Object.keys(a), ...Object.keys(b)])]) {
    const [x, y] = [a[p], b[p]];
    if (!x || !y) return `${p}: present in one read only`;
    if (x.status !== y.status) return `${p}: status ${x.status} then ${y.status}`;
    if (x.text === y.text) continue;
    let i = 0;
    while (i < x.text.length && x.text[i] === y.text[i]) i++;
    const around = (t: string) => JSON.stringify(t.slice(Math.max(0, i - 80), i + 80));
    return `${p}: first difference at offset ${i} (lengths ${x.text.length} and ${y.text.length})\n  first read:  ${around(x.text)}\n  second read: ${around(y.text)}`;
  }
  return null;
}
