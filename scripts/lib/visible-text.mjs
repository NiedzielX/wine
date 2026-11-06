/**
 * The text a person reads in an HTML page, for smoke checks and tests (no regular expressions on markup, which cannot be done
 * correctly: `<scr<script>ipt>`, upper-case `<SCRIPT>`, `>` inside an attribute). A single pass over the characters:
 * tags (quotes respected) and comments become a space, the content of `<script>` and `<style>` is dropped (names compared without
 * case), an unterminated tag or comment swallows the rest, and the few entities React writes are decoded once (`&amp;lt;` stays `&lt;`).
 * White space is collapsed and non-breaking spaces read as spaces.
 */
const ENTITIES = new Map([['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"], ['#x27', "'"], ['#39', "'"], ['nbsp', ' ']]);
const isLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

export function visibleText(html) {
  const lower = html.toLowerCase();
  let out = '';
  let i = 0;
  while (i < html.length) {
    const c = html[i];
    if (c === '&') {
      const end = html.indexOf(';', i);
      const decoded = end > i && end - i <= 6 ? ENTITIES.get(html.slice(i + 1, end)) : undefined;
      if (decoded !== undefined) { out += decoded; i = end + 1; continue; }
      out += c; i++; continue;
    }
    const next = html[i + 1] ?? '';
    if (c !== '<' || !(isLetter(next) || next === '/' || next === '!' || next === '?')) { out += c; i++; continue; }
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      out += ' ';
      if (end < 0) break;
      i = end + 3;
      continue;
    }
    // a tag: up to the first `>` outside quotes
    let j = i + 1;
    let quote = '';
    while (j < html.length && (quote !== '' || html[j] !== '>')) {
      if (quote !== '') { if (html[j] === quote) quote = ''; } else if (html[j] === '"' || html[j] === "'") quote = html[j];
      j++;
    }
    out += ' ';
    if (j >= html.length) break; // unterminated: nothing after it is text
    const name = /* tag name: letters and digits after `<` */ (() => { let k = i + 1; while (k < j && /[a-z0-9]/.test(lower[k])) k++; return lower.slice(i + 1, k); })();
    i = j + 1;
    if (name === 'script' || name === 'style') {
      const close = lower.indexOf(`</${name}`, i);
      if (close < 0) break;
      const after = html.indexOf('>', close);
      if (after < 0) break;
      i = after + 1;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}
