/**
 * The fetch of the smoke test (spec 2026-10-15-production-deployment, R6 and R7). Every request is our own traffic: it
 * carries `X-Wine-Match-Synthetic: 1`, so guest pages render as usual but record no usage events (E02 Q12). The header
 * is set LAST, so no call can drop or change it. In `getOnly` mode (smoke --production) anything but GET is refused
 * before it is sent, so a mistake in a check cannot change data on a real installation.
 */
export const SYNTHETIC_HEADER = 'x-wine-match-synthetic';

export function syntheticFetch({ baseFetch = globalThis.fetch, getOnly = false, sent = [] } = {}) {
  return (url, init = {}) => {
    const method = String(init.method ?? 'GET').toUpperCase();
    if (getOnly && method !== 'GET') return Promise.reject(new Error(`smoke --production sends GET only: refused ${method} ${String(url)}`));
    const given = init.headers instanceof Headers ? Object.fromEntries(init.headers) : (init.headers ?? {});
    sent.push({ method, url: String(url) });
    return baseFetch(url, { ...init, headers: { ...given, [SYNTHETIC_HEADER]: '1' } });
  };
}
