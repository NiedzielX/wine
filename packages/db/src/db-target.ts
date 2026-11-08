import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Which database does an operator command act on? (lesson 18: an exported DATABASE_URL silently pointed the seeder at an unrelated
 * database.) Operator commands print `host:port/dbname` to stderr BEFORE acting and warn loudly when the process environment
 * overrides `.env` (a variable already in the environment wins over the file, see `process.loadEnvFile`).
 * Credentials never leave this module: only host, port and database name are ever formatted, and an unparseable value is not echoed.
 */

type Environment = Record<string, string | undefined>;

const blank = (value: string | undefined) => value === undefined || value.trim() === '';

/** The repository's `.env` (this file lives in packages/db/src, the commands in packages/db/scripts or scripts/ read the same file). */
const REPO_DOTENV = fileURLToPath(new URL('../../../.env', import.meta.url));

/** `host:port/dbname` of a connection string; never the user, password or query. */
export function describeDbTarget(url: string | undefined): string {
  if (blank(url)) return '(DATABASE_URL is not set)';
  try {
    const parsed = new URL(url!.trim());
    if (!parsed.hostname) return '(DATABASE_URL is not a valid URL)';
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    return `${parsed.hostname}:${parsed.port || '5432'}/${name || '(no database name)'}`;
  } catch {
    return '(DATABASE_URL is not a valid URL)';
  }
}

/** The value of `key` in dotenv text: `KEY=value`, optional `export`, quotes, inline ` #` comments; the last assignment wins. */
export function parseDotenvValue(text: string, key: string): string | undefined {
  let found: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || m[1] !== key) continue;
    let value = m[2].trim();
    const quoted = /^(["'])(.*?)\1/.exec(value);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, '').trim();
    found = value;
  }
  return found;
}

/** A loud warning when the process value differs from the `.env` one (the process value wins); null when there is nothing to say. */
export function shadowWarning(processUrl: string | undefined, dotenvUrl: string | undefined): string | null {
  if (blank(processUrl) || blank(dotenvUrl) || processUrl!.trim() === dotenvUrl!.trim()) return null;
  const actual = describeDbTarget(processUrl);
  const filed = describeDbTarget(dotenvUrl);
  const detail = actual === filed
    ? `Both point at the same database (${actual}) but with different credentials.`
    : `This command acts on ${actual}, NOT on ${filed} from .env.`;
  return `WARNING: DATABASE_URL in the process environment differs from .env. The process value wins. ${detail} If that is not what you meant, run "unset DATABASE_URL" and try again.`;
}

export interface AnnounceOptions {
  /** Shown in front of the line, e.g. `restaurant:create`. */
  command: string;
  environment?: Environment;
  dotenvPath?: string;
  write?: (line: string) => void;
}

let announced = false;
/** For tests only: the announcement is once per process. */
export function resetDbTargetAnnouncement(): void { announced = false; }

/** Prints the target (and the shadow warning, if any) once per process; call it after `.env` is loaded and before anything is read or written. */
export function announceDbTarget(options: AnnounceOptions): void {
  if (announced) return;
  announced = true;
  const environment = options.environment ?? process.env;
  const write = options.write ?? ((line: string) => { process.stderr.write(`${line}\n`); });
  let dotenvUrl: string | undefined;
  try {
    dotenvUrl = parseDotenvValue(readFileSync(options.dotenvPath ?? REPO_DOTENV, 'utf8'), 'DATABASE_URL');
  } catch {
    dotenvUrl = undefined; // no .env (CI, container) or unreadable: nothing to compare with
  }
  const url = environment.DATABASE_URL;
  const source = blank(url) ? '' : ` (DATABASE_URL from ${!blank(dotenvUrl) && dotenvUrl!.trim() === url!.trim() ? '.env' : 'the process environment'})`;
  write(`${options.command}: database target ${describeDbTarget(url)}${source}`);
  const warning = shadowWarning(url, dotenvUrl);
  if (warning) write(warning);
}
