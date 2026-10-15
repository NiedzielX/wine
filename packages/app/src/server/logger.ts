import { createLogger, type LogLevel, type Logger } from '@wine-match/core';
import { env } from './env';

/**
 * The application's only logger, and the only module allowed to print (oxlint: no-console is off here
 * and nowhere else). Every line is JSON and passes through the redaction in @wine-match/core, so a
 * password, token, cookie or hash cannot reach the output. Log through this, never with console.*.
 */
let instance: Logger | undefined;

function level(): LogLevel {
  try {
    return env().logLevel;
  } catch {
    return 'info'; // a broken configuration is itself reported through this logger: do not recurse
  }
}

function get(): Logger {
  instance ??= createLogger((line, lvl) => (lvl === 'error' || lvl === 'warn' ? console.error(line) : console.log(line)), { level: level() });
  return instance;
}

export const logger: Logger = {
  debug: (m, f) => get().debug(m, f),
  info: (m, f) => get().info(m, f),
  warn: (m, f) => get().warn(m, f),
  error: (m, f) => get().error(m, f),
  child: (b) => get().child(b)
};
