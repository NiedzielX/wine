import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The page must reserve the scrollbar's width, otherwise every route change between a short and a tall page
// shifts the layout sideways by the scrollbar width (classic scrollbars on Windows and Linux).
const root = resolve(__dirname, '../../../..');
const themes = {
  panel: 'packages/ui/src/styles.css',
  guest: 'packages/app/src/app/(guest)/guest.css',
};

describe('scrollbar-gutter', () => {
  for (const [name, file] of Object.entries(themes)) {
    it(`${name} theme reserves the scrollbar gutter on html`, () => {
      const css = readFileSync(resolve(root, file), 'utf8');
      expect(css).toMatch(/html\s*\{[^}]*scrollbar-gutter:\s*stable/);
    });
  }
});
