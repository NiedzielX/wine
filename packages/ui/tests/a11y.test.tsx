// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

/*
 * Accessibility gate (WCAG 2.0 A and AA, WCAG 2.1 AA) for every story in src/stories. Each story is rendered to static
 * markup, put into jsdom and checked by axe-core; any violation fails `npm test`. No browser is needed.
 * Limit: jsdom has no layout engine, so colour contrast is not measured here (axe reports it as "incomplete");
 * contrast of the tokens is checked in the Foundations story and in tests/contrast.test.ts.
 */

type AnyArgs = Record<string, unknown>;
interface StoryMeta {
  component?: (props: AnyArgs) => ReactElement;
  args?: AnyArgs;
  render?: (args: AnyArgs, context: never) => ReactElement;
}
interface StoryObject {
  args?: AnyArgs;
  render?: (args: AnyArgs, context: never) => ReactElement;
}
type StoryModule = { default: StoryMeta } & Record<string, StoryObject | StoryMeta['default']>;

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa'];

const modules = import.meta.glob<StoryModule>('../src/stories/*.stories.tsx', { eager: true });

/** Renders a story as its meta would: story render, else meta render, else the component with the merged args. */
function markupOf(meta: StoryMeta, story: StoryObject): string {
  const args = { ...(meta.args ?? {}), ...(story.args ?? {}) };
  const render = story.render ?? meta.render;
  // Wrapped in a component: stories may call hooks (useId) inside render.
  const Story = () => (render ? render(args, {} as never) : createElement(meta.component as (p: AnyArgs) => ReactElement, args));
  return renderToStaticMarkup(createElement(Story));
}

async function violationsOf(markup: string): Promise<string[]> {
  document.body.innerHTML = markup;
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: WCAG_TAGS },
    // jsdom has no canvas or layout, so colour contrast cannot be measured here; tests/contrast.test.ts covers the tokens
    rules: { 'color-contrast': { enabled: false } }
  });
  return results.violations.map(
    (v) => `${v.id} (${v.impact ?? 'n/a'}): ${v.help} at ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`
  );
}

describe('stories: every story passes axe-core for WCAG 2.0 A/AA and 2.1 AA', () => {
  it('finds the stories (guards against an empty glob)', () => {
    const count = Object.values(modules).reduce((n, mod) => n + Object.keys(mod).filter((k) => k !== 'default').length, 0);
    expect(count).toBeGreaterThan(40);
  });

  for (const [file, mod] of Object.entries(modules)) {
    const { default: meta, ...stories } = mod;
    describe(file.replace('../src/stories/', ''), () => {
      for (const [name, story] of Object.entries(stories)) {
        it(name, async () => {
          const markup = markupOf(meta, story as StoryObject);
          // an empty render would pass axe for the wrong reason
          expect(markup.length).toBeGreaterThan(0);
          expect(await violationsOf(markup)).toEqual([]);
        });
      }
    });
  }
});
