import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InfoDisclosure } from '../src/brand/info-disclosure';

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

/** AC1 of spec 2026-10-16-how-it-works-explanations: native disclosure, visible question, decorative icon, no title. */
describe('InfoDisclosure: a native <details> that works without JavaScript', () => {
  it('renders <details> with <summary> first, the visible question, a hidden icon and the body; closed by default', () => {
    const out = html(<InfoDisclosure summary="Why these wines?" explainId="wines"><p>Because.</p></InfoDisclosure>);
    expect(out).toMatch(/^<details data-explain="wines"><summary /);
    expect(out).toContain('<span>Why these wines?</span></summary>');
    expect(out).toContain('<svg');
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('<p>Because.</p>');
    expect(out).not.toContain(' open');
    expect(out).not.toContain('title=');
    expect(out).not.toContain('sr-only');
    expect(out).not.toContain(' name=');
  });

  it('is open on first render only when asked', () => {
    expect(html(<InfoDisclosure summary="x" open>y</InfoDisclosure>)).toMatch(/^<details open="">/);
  });

  it('the compact variant shows only the icon and keeps the question as the accessible name', () => {
    const out = html(<InfoDisclosure summary="How guests see your pairings" compact>z</InfoDisclosure>);
    expect(out).toContain('<span class="sr-only">How guests see your pairings</span>');
    expect(out).not.toContain('title=');
  });

  it('takes colours and sizes from the caller, and hides the default marker', () => {
    const out = html(
      <InfoDisclosure summary="q" id="e1" className="mt-3" summaryClassName="min-h-11 text-ink-2" bodyClassName="bg-surface" iconClassName="text-wine">a</InfoDisclosure>
    );
    expect(out).toContain('id="e1"');
    expect(out).toContain('class="mt-3"');
    expect(out).toContain('list-none');
    expect(out).toContain('[&amp;::-webkit-details-marker]:hidden');
    expect(out).toContain('min-h-11 text-ink-2');
    expect(out).toContain('class="bg-surface"');
    expect(out).toMatch(/<svg class="[^"]*text-wine/);
  });
});
