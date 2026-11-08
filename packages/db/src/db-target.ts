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

const INVALID = '(DATABASE_URL is not a valid URL)';
const HOST = /^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9._~-]+|(?:%2[Ff][A-Za-z0-9._~%-]*))(?::(\d{1,5}))?$/;

/**
 * `host:port/dbname` of a connection string; never the user, password or query, and never any part of a value that cannot be read
 * unambiguously (a password with an unescaped `/`, `?` or `#` makes WHATWG `URL` take the user as the host and the password as the port,
 * so the string is parsed here instead: the authority ends at the first `/`, `?` or `#`, the userinfo at the last `@` inside it).
 */
export function describeDbTarget(url: string | undefined): string {
  if (blank(url)) return '(DATABASE_URL is not set)';
  const rest = /^postgres(?:ql)?:\/\/(.*)$/is.exec(url!.trim())?.[1];
  if (rest === undefined) return INVALID;
  const cut = rest.search(/[/?#]/);
  const authority = cut === -1 ? rest : rest.slice(0, cut);
  // an `@` only after the delimiter means the password (or user) contains a delimiter: the split is a guess, so say nothing about it
  if (!authority.includes('@') && rest.slice(authority.length).includes('@')) return INVALID;
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
  if (hostPort === '') return rest.slice(authority.length).includes('@') ? INVALID : '(DATABASE_URL has no host)';
  const m = HOST.exec(hostPort);
  if (!m) return INVALID;
  let name = '';
  if (cut !== -1 && rest[cut] === '/') {
    try {
      name = decodeURIComponent(rest.slice(cut + 1).split(/[?#]/)[0]);
    } catch {
      return INVALID;
    }
  }
  const database = name || '(no database name)';
  if (m[1].toLowerCase().startsWith('%2f')) {
    let socket: string;
    try { socket = decodeURIComponent(m[1]); } catch { return INVALID; }
    return `unix socket ${socket}${m[2] ? ` (port ${m[2]})` : ''}/${database}`;
  }
  return `${m[1]}:${m[2] ?? '5432'}/${database}`;
}

// the same pattern as Node's own dotenv parser (lib/internal/util/parse_env): quoted values may span lines
const DOTENV_LINE = /^\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?$/gm;

/** The value of `key` in dotenv text, read like Node's `loadEnvFile` (quotes, `\n` in double quotes, multi-line values, inline comments; the last assignment wins). No variable expansion. */
export function parseDotenvValue(text: string, key: string): string | undefined {
  let found: string | undefined;
  for (const m of text.replace(/\r\n?/g, '\n').matchAll(DOTENV_LINE)) {
    if (m[1] !== key) continue;
    let value = (m[2] ?? '').trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'" || quote === '`') && value.endsWith(quote) && value.length >= 2) value = value.slice(1, -1);
    if (quote === '"') value = value.replace(/\\n/g, '\n');
    found = value;
  }
  return found;
}

/** A loud warning when the process value differs from the `.env` one (the process value wins); null when there is nothing to say. */
export function shadowWarning(processUrl: string | undefined, dotenvUrl: string | undefined): string | null {
  if (processUrl === undefined || blank(dotenvUrl)) return null;
  const filed = describeDbTarget(dotenvUrl);
  // `process.loadEnvFile` does not override a variable that is set, even to the empty string
  if (blank(processUrl)) return `WARNING: DATABASE_URL is set but empty in the process environment, so it hides the value in .env (${filed}). The empty value wins. If that is not what you meant, run "unset DATABASE_URL" and try again.`;
  if (processUrl.trim() === dotenvUrl!.trim()) return null;
  const actual = describeDbTarget(processUrl);
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
    dotenvUrl = parseDotenvValue(readFileSync(options.dotenvPath ?? environment.DB_TARGET_DOTENV ?? REPO_DOTENV, 'utf8'), 'DATABASE_URL');
  } catch {
    dotenvUrl = undefined; // no .env (CI, container) or unreadable: nothing to compare with
  }
  const url = environment.DATABASE_URL;
  const source = blank(url) ? '' : ` (DATABASE_URL from ${!blank(dotenvUrl) && dotenvUrl!.trim() === url!.trim() ? '.env' : 'the process environment'})`;
  write(`${options.command}: database target ${describeDbTarget(url)}${source}`);
  const warning = shadowWarning(url, dotenvUrl);
  if (warning) write(warning);
}
