/**
 * In-process metrics in the Prometheus text format (spec E21 F1, Q1/Q2). No SDK, no network: a counter map in
 * `globalThis` (like the container, so Next.js dev reloads and separate bundles share it) and a text renderer.
 * Per process; the scraper aggregates replicas. Labels are LOW-CARDINALITY by construction: a route pattern, a
 * status class, a result or a rule name. Never a slug, session id, id or IP: every value passes `labelValue()`.
 */

const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export type CodeIssueResult = 'issued' | 'timeout' | 'limit' | 'rate_limited' | 'error';
export type UnhandledSource = 'render' | 'route' | 'action' | 'proxy' | 'unhandledRejection' | 'uncaughtException' | 'unknown';

interface Histogram { buckets: number[]; sum: number; count: number }
interface Registry {
  counters: Map<string, Map<string, number>>;
  histograms: Map<string, Map<string, Histogram>>;
}

const g = globalThis as unknown as { __wineMatchMetrics?: Registry };
const registry = (): Registry => (g.__wineMatchMetrics ??= { counters: new Map(), histograms: new Map() });

/** Every metric the endpoint exposes, with its help text. Metrics without samples still print HELP and TYPE. */
const DEFINITIONS = [
  ['http_requests_total', 'counter', 'API requests by route pattern and status class.'],
  ['http_request_duration_seconds', 'histogram', 'API request duration by route pattern.'],
  ['guest_code_issue_total', 'counter', 'Recommendation code issue attempts on guest pages by result.'],
  ['usage_event_write_failed_total', 'counter', 'Usage event writes that failed (the page was still served).'],
  ['rate_limit_denied_total', 'counter', 'Requests refused by a rate limit rule.'],
  ['db_health_check_duration_seconds', 'histogram', 'Duration of the database health check.'],
  ['unhandled_errors_total', 'counter', 'Errors that reached onRequestError or the process-level handlers, by source.']
] as const;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** A label value that is safe to print: a UUID becomes `{id}`, anything outside a small alphabet becomes `_`, at most 100 chars. */
export function labelValue(raw: string): string {
  return raw.replace(UUID, '{id}').replace(/[^A-Za-z0-9_/{}.:-]/g, '_').slice(0, 100) || 'unknown';
}

/** `200` → `2xx`. A status outside 100–599 is `other`. */
export function statusClass(status: number): string {
  return status >= 100 && status < 600 ? `${Math.floor(status / 100)}xx` : 'other';
}

const labelKey = (labels: Record<string, string>) => Object.entries(labels).map(([k, v]) => `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');

function inc(name: string, labels: Record<string, string> = {}): void {
  const series = registry().counters.get(name) ?? new Map<string, number>();
  registry().counters.set(name, series);
  const key = labelKey(labels);
  series.set(key, (series.get(key) ?? 0) + 1);
}

function observe(name: string, labels: Record<string, string>, seconds: number): void {
  const series = registry().histograms.get(name) ?? new Map<string, Histogram>();
  registry().histograms.set(name, series);
  const key = labelKey(labels);
  const h = series.get(key) ?? { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
  series.set(key, h);
  BUCKETS.forEach((upper, i) => { if (seconds <= upper) h.buckets[i]++; });
  h.sum += seconds;
  h.count++;
}

/** One API request: `route` is the PATTERN passed by the route (`/api/v1/pairings/{id}`), never the URL. */
export function recordHttpRequest(route: string, status: number, durationSeconds: number): void {
  const group = labelValue(route);
  inc('http_requests_total', { group, status_class: statusClass(status) });
  observe('http_request_duration_seconds', { group }, durationSeconds);
}

export const countCodeIssue = (result: CodeIssueResult): void => inc('guest_code_issue_total', { result });
export const countUsageWriteFailed = (): void => inc('usage_event_write_failed_total');
export const countRateLimitDenied = (rule: string): void => inc('rate_limit_denied_total', { rule: labelValue(rule) });
export const countUnhandledError = (source: UnhandledSource): void => inc('unhandled_errors_total', { source });
export const observeDbHealthCheck = (seconds: number): void => observe('db_health_check_duration_seconds', {}, seconds);

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(6).replace(/0+$/, ''));
const braces = (key: string) => (key ? `{${key}}` : '');

/** The Prometheus text exposition (version 0.0.4) of everything recorded in this process. */
export function renderMetrics(): string {
  const out: string[] = [];
  for (const [name, type, help] of DEFINITIONS) {
    out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
    if (type === 'counter') {
      for (const [key, value] of registry().counters.get(name) ?? []) out.push(`${name}${braces(key)} ${value}`);
      continue;
    }
    for (const [key, h] of registry().histograms.get(name) ?? []) {
      const prefix = key ? `${key},` : '';
      BUCKETS.forEach((upper, i) => out.push(`${name}_bucket{${prefix}le="${upper}"} ${h.buckets[i]}`));
      out.push(`${name}_bucket{${prefix}le="+Inf"} ${h.count}`, `${name}_sum${braces(key)} ${fmt(h.sum)}`, `${name}_count${braces(key)} ${h.count}`);
    }
  }
  return `${out.join('\n')}\n`;
}

/** For tests only. */
export function resetMetrics(): void {
  g.__wineMatchMetrics = { counters: new Map(), histograms: new Map() };
}
