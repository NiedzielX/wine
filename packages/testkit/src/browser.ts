import { execFile } from 'node:child_process';
import { looksLikeFailure, parseBoolean, parseCount, parseText, sessionArgs } from './command-line';

/**
 * agent-browser 0.39.1 is a CLI, not a library, so it is not a dependency of the project: its package
 * declares Node 24 while the project runs on Node 22 (it works there). CI installs the pinned version
 * globally; locally point AGENT_BROWSER_BIN at a copy. The version is checked before any test runs.
 */
export const AGENT_BROWSER_VERSION = '0.39.1';

export function agentBrowserBinary(env: Record<string, string | undefined> = process.env): string {
  return env.AGENT_BROWSER_BIN?.trim() || 'agent-browser';
}

export class BrowserCommandError extends Error {
  constructor(readonly args: readonly string[], readonly exitCode: number | null, readonly output: string) {
    super(`agent-browser ${args.join(' ')} failed (exit ${exitCode}):\n${output.trim()}`);
    this.name = 'BrowserCommandError';
  }
}

/**
 * A browser session driven through the agent-browser CLI. Every method is one command; a command that
 * fails (exit code, or a failure line) throws BrowserCommandError with what the browser said.
 */
export class AgentBrowser {
  constructor(readonly session: string, private readonly binary = agentBrowserBinary(), private readonly timeoutMs = 60_000) {}

  /** Fails fast when the wrong CLI version is on the PATH: selectors and output formats differ between versions. */
  static async verifyVersion(binary = agentBrowserBinary()): Promise<string> {
    const version = await new Promise<string>((resolve, reject) => {
      execFile(binary, ['--version'], { timeout: 20_000 }, (error, stdout) => (error ? reject(new Error(`agent-browser is not runnable (${binary}): ${error.message}`)) : resolve(stdout.trim())));
    });
    if (!version.includes(AGENT_BROWSER_VERSION)) throw new Error(`Expected agent-browser ${AGENT_BROWSER_VERSION}, found: ${version}`);
    return version;
  }

  run(...args: string[]): Promise<string> {
    const full = sessionArgs(this.session, args);
    return new Promise((resolve, reject) => {
      execFile(this.binary, full, { timeout: this.timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
        const output = `${stdout}${stderr}`;
        const exitCode = error && typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : error ? null : 0;
        if (error || looksLikeFailure(output)) reject(new BrowserCommandError(args, exitCode, output));
        else resolve(stdout);
      });
    });
  }

  open(url: string) { return this.run('open', url); }
  async url(): Promise<string> { return (await this.run('get', 'url')).trim(); }
  async text(selector: string): Promise<string> { return parseText(await this.run('get', 'text', selector)); }
  async count(selector: string): Promise<number> { return parseCount(await this.run('get', 'count', selector)); }
  async visible(selector: string): Promise<boolean> { return parseBoolean(await this.run('is', 'visible', selector)); }
  fill(selector: string, value: string) { return this.run('fill', selector, value); }
  click(selector: string) { return this.run('click', selector); }
  clickRole(role: string, name: string) { return this.run('find', 'role', role, 'click', '--name', name); }
  waitForText(text: string) { return this.run('wait', '--text', text); }
  screenshot(path: string) { return this.run('screenshot', path); }
  async close(): Promise<void> {
    await this.run('close').catch(() => undefined);
  }

  /**
   * Polls the whole page text until it contains `text`. Pages stream in (a skeleton first, then the content),
   * so reading a region once right after navigation can see the skeleton only.
   */
  async waitForPageText(text: string, timeoutMs = 15_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let last = '';
    while (Date.now() < deadline) {
      last = await this.text('body');
      if (last.includes(text)) return last;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Expected the page to show "${text}". Last text: ${JSON.stringify(last.slice(0, 300))}`);
  }

  /** Polls the address bar until it contains `fragment` (a redirect or a form post has finished). */
  async waitForUrl(fragment: string, timeoutMs = 15_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let current = '';
    while (Date.now() < deadline) {
      current = await this.url();
      if (current.includes(fragment)) return current;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Expected the address to contain "${fragment}", still at ${current}`);
  }
}
