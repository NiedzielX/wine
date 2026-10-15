import { redact, redactText } from './redact';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Where a finished log line goes. The application decides (stdout, a file, a service); core never prints. */
export type LogSink = (line: string, level: LogLevel) => void;

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  /** A logger that adds `bindings` to every line (a request id, a restaurant). */
  child(bindings: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  bindings?: Record<string, unknown>;
  now?: () => Date;
}

/**
 * One JSON object per line: `{"level","time","msg", …fields}`. Every value passes through `redact`, so a
 * password, token, cookie or hash cannot reach the output by accident, even inside an error message.
 */
export function createLogger(sink: LogSink, options: LoggerOptions = {}): Logger {
  const min = ORDER[options.level ?? 'info'];
  const bindings = options.bindings ?? {};
  const now = options.now ?? (() => new Date());

  const write = (level: LogLevel, message: string, fields: Record<string, unknown> = {}) => {
    if (ORDER[level] < min) return;
    const line = JSON.stringify({ level, time: now().toISOString(), msg: redactText(message), ...(redact({ ...bindings, ...fields }) as Record<string, unknown>) });
    sink(line, level);
  };

  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
    child: (extra) => createLogger(sink, { ...options, bindings: { ...bindings, ...extra } })
  };
}

/** Collects lines in memory: for tests. */
export function memorySink(): { sink: LogSink; lines: string[] } {
  const lines: string[] = [];
  return { sink: (line) => { lines.push(line); }, lines };
}
