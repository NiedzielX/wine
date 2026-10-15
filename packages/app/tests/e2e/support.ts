import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AgentBrowser } from '@wine-match/testkit';
import { afterEach, inject } from 'vitest';

export const ARTIFACTS = fileURLToPath(new URL('../../test-results/e2e', import.meta.url));

/**
 * One browser session per test file, unique so runs never share cookies. Call it at the top of a
 * `describe`: the failure hook has to be registered there. A failing test leaves a screenshot in the
 * CI artifacts.
 */
export function e2eSuite(name: string): { browser: AgentBrowser; baseUrl: () => string } {
  const browser = new AgentBrowser(`wm-${name}-${randomUUID().slice(0, 8)}`);
  afterEach(async ({ task }) => {
    if (task.result?.state !== 'fail') return;
    mkdirSync(ARTIFACTS, { recursive: true });
    const safe = task.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 80);
    await browser.screenshot(`${ARTIFACTS}/${name}-${safe}.png`).catch(() => undefined);
  });
  return { browser, baseUrl: () => inject('e2e').baseUrl };
}
