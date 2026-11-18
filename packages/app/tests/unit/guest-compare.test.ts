import { describe, expect, it } from 'vitest';
import { firstDifference, normalise } from '../e2e/guest-compare';

/**
 * The cause of the flaky T-33 (2026-11-18): two reads of `/r/halka` carried the same 46 React Flight rows, but the metadata rows
 * (`f:null`, `15:[title…]`) came before the page body row `c:` in one read and after it in the other. The fixtures are that shape.
 */
const chunk = (rows: string[]) => `<script>self.__next_f.push(${JSON.stringify([1, rows.map((r) => `${r}\n`).join('')])})</script>`;
const META = ['f:null', '15:[["$","title","0",{"children":"Halka | Wine Match"}]]'];
const BODY = ['c:["$","div",null,{"children":"Menu of tonight"}]'];
const page = (nonce: string, flight: string) => `<html><body nonce="${nonce}"><main>Menu of tonight</main>${flight}<script nonce="${nonce}">x</script></body></html>`;

describe('guest read comparison (T-33 helpers)', () => {
  it('two reads that differ only in the order of the streamed rows, in how they are split into chunks and in the nonce are equal', () => {
    const a = page('n1', chunk([...META, ...BODY]));
    const b = page('n2', chunk(BODY) + chunk(META));
    expect(a).not.toBe(b);
    expect(normalise(a)).toBe(normalise(b));
  });

  it('keeps every row: a changed, added or leaked row still makes two reads differ and still shows in the text', () => {
    const base = page('n1', chunk([...META, ...BODY]));
    const changed = page('n1', chunk([...META, 'c:["$","div",null,{"children":"Menu of tonight SECRET-NOTE"}]']));
    const added = page('n1', chunk([...META, ...BODY, 'd:"extra"']));
    expect(normalise(changed)).not.toBe(normalise(base));
    expect(normalise(added)).not.toBe(normalise(base));
    expect(normalise(changed)).toContain('SECRET-NOTE');
  });

  it('a change in the HTML outside the flight rows still makes two reads differ', () => {
    const a = page('n1', chunk([...META, ...BODY]));
    const b = a.replace('<main>Menu of tonight</main>', '<main>Menu of tonight, edited</main>');
    expect(normalise(a)).not.toBe(normalise(b));
  });

  it('leaves a body without flight rows (the public API, a 404) untouched except for the nonce', () => {
    expect(normalise('{"items":[1,2],"nonce":"abc"}')).toBe('{"items":[1,2],"nonce":""}');
  });

  it('reports the first difference with path, offset and context', () => {
    const [x, y] = [{ '/a': { status: 200, text: 'same' }, '/b': { status: 200, text: `${'x'.repeat(100)}ONE${'y'.repeat(100)}` } }, { '/a': { status: 200, text: 'same' }, '/b': { status: 200, text: `${'x'.repeat(100)}TWO${'y'.repeat(100)}` } }];
    const diff = firstDifference(x, y)!;
    expect(diff).toContain('/b: first difference at offset 100');
    expect(diff).toContain('ONE');
    expect(diff).toContain('TWO');
    expect(firstDifference(x, x)).toBeNull();
    expect(firstDifference(x, { ...y, '/a': { status: 500, text: 'same' } })).toContain('/a: status 200 then 500');
    expect(firstDifference(x, { '/a': x['/a']! })).toContain('/b: present in one read only');
  });
});
