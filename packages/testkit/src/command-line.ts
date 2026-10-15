/**
 * Pure helpers for driving the agent-browser CLI. No process is started here, so every rule about how
 * a command is built and how its output is read is covered by fast unit tests.
 */

/** Arguments for one agent-browser call inside a named session (sessions have their own cookies and tabs). */
export function sessionArgs(session: string, args: readonly string[]): string[] {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(session)) throw new Error(`Invalid browser session name: "${session}"`);
  return ['--session', session, ...args];
}

/** `true` / `false` from `agent-browser is visible <sel>`. Anything else is a broken answer, not a guess. */
export function parseBoolean(output: string): boolean {
  const answer = output.trim();
  if (answer === 'true') return true;
  if (answer === 'false') return false;
  throw new Error(`Expected true or false from agent-browser, got: ${JSON.stringify(answer.slice(0, 200))}`);
}

/** A number from `agent-browser get count <sel>`. */
export function parseCount(output: string): number {
  const answer = output.trim();
  if (!/^\d+$/.test(answer)) throw new Error(`Expected a count from agent-browser, got: ${JSON.stringify(answer.slice(0, 200))}`);
  return Number(answer);
}

/** The text of an element, without the trailing line break the CLI prints. */
export function parseText(output: string): string {
  return output.replace(/\r?\n$/, '');
}

/** agent-browser prints its own failures on stdout or stderr with a leading cross mark. */
export function looksLikeFailure(output: string): boolean {
  return /^\s*✗/m.test(output);
}
