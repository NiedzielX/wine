/** HTML checks shared by the server-rendered page tests (spec 2026-10-16-how-it-works-explanations, AC2, AC3). */

/** The `data-explain` ids on a page, in document order. */
export const explainIds = (html: string) => [...html.matchAll(/data-explain="([^"]+)"/g)].map((m) => m[1]);

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
/**
 * Where each explanation sits (R1, R3): never inside a link, a button, a paragraph or another summary; the summary is
 * the first child of its details and holds no link or button; nothing on it needs a script.
 */
export function placementProblems(html: string): string[] {
  const stack: string[] = [];
  const problems: string[] = [];
  let prev = '';
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const [, close, raw, attrs, self] = m;
    const tag = raw.toLowerCase();
    if (close) {
      const i = stack.lastIndexOf(tag);
      if (i >= 0) stack.length = i;
      prev = `/${tag}`;
      continue;
    }
    if (tag === 'details') {
      for (const bad of ['a', 'button', 'p', 'summary']) if (stack.includes(bad)) problems.push(`<details> inside <${bad}>`);
      if (/\son\w+=/i.test(attrs)) problems.push('<details> with an inline handler');
    }
    if (tag === 'summary' && prev !== 'details') problems.push('<summary> is not the first child of <details>');
    if ((tag === 'a' || tag === 'button') && stack.includes('summary')) problems.push(`<${tag}> inside <summary>`);
    if (!self && !VOID.has(tag)) stack.push(tag);
    prev = tag;
  }
  return problems;
}

