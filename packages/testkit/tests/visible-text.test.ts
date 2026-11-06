import { describe, expect, it } from 'vitest';
import { visibleText } from '../../../scripts/lib/visible-text.mjs';

/** `scripts/lib/visible-text.mjs`: the text of a page without regular expressions on markup (used by smoke --showcase and the showcase tests). */
describe('visibleText', () => {
  it('keeps the words of nested tags and separates them', () => {
    expect(visibleText('<main><h1>Title</h1><p>one <b>two</b> <a href="/x">three</a></p></main>')).toBe('Title one two three');
  });

  it('drops script and style content whatever the case, with attributes and spaces in the closing tag', () => {
    expect(visibleText('a<script>var x = "<b>undefined</b>";</script>b')).toBe('a b');
    expect(visibleText('a<SCRIPT type="x">undefined</SCRIPT >b<Style>p{}</STYLE>c')).toBe('a b c');
    expect(visibleText('a<ScRiPt>x</sCrIpT\n>b')).toBe('a b');
  });

  it('an unterminated script, tag or comment swallows the rest instead of leaking it', () => {
    expect(visibleText('a<script>secret')).toBe('a');
    expect(visibleText('a<div class="x')).toBe('a');
    expect(visibleText('a<!-- never closed')).toBe('a');
  });

  it('does not turn a split tag into text that still contains a tag', () => {
    const out = visibleText('<scr<script>ipt>alert(1)</scr</script>ipt>');
    expect(out).not.toMatch(/<script/i);
    expect(visibleText('<<b>b>x')).not.toContain('<b');
    expect(visibleText('<scr<script>ipt>')).toBe('ipt>');
  });

  it('a > inside a quoted attribute does not end the tag; a bare < in text stays text', () => {
    expect(visibleText('<a title="x > y">link</a>')).toBe('link');
    expect(visibleText("<a title='1 > 0'>l</a>")).toBe('l');
    expect(visibleText('1 < 2 and 3 <4')).toBe('1 < 2 and 3 <4');
  });

  it('skips comments and decodes the entities React writes, once', () => {
    expect(visibleText('a<!-- <b>hidden</b> -->b')).toBe('a b');
    expect(visibleText('Tom &amp; Jerry &quot;x&quot; &#x27;y&#39; 1&nbsp;zł')).toBe('Tom & Jerry "x" \'y\' 1 zł');
    expect(visibleText('&amp;lt;b&amp;gt;')).toBe('&lt;b&gt;');
    expect(visibleText('AT&T; &unknown; & done')).toBe('AT&T; &unknown; & done');
  });

  it('collapses white space and non-breaking spaces and trims', () => {
    expect(visibleText('  a \n\t b c  ')).toBe('a b c');
    expect(visibleText('')).toBe('');
  });
});
