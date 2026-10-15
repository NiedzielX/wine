export type Params = Record<string, string>;

export interface View {
  /** document title */
  title: (p: Params) => string;
  render: (p: Params, q: URLSearchParams) => string;
  /** bind events; `rerender` re-renders the current route in place */
  mount?: (root: HTMLElement, p: Params, q: URLSearchParams, rerender: () => void) => void;
  /** guard: return a redirect hash or null */
  guard?: () => string | null;
  shell: 'guest' | 'admin' | 'plain';
}

interface Route { pattern: RegExp; keys: string[]; view: View }

const routes: Route[] = [];
let notFound: View | null = null;

export function route(path: string, view: View): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' + path.replace(/\//g, '\\/').replace(/:(\w+)/g, (_, k: string) => { keys.push(k); return '([^/]+)'; }) + '$'
  );
  routes.push({ pattern, keys, view });
}

export function setNotFound(view: View): void { notFound = view; }

export function navigate(hash: string): void {
  if (location.hash === hash) render(); else location.hash = hash;
}

export function currentPath(): { path: string; query: URLSearchParams } {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, query: new URLSearchParams(qs) };
}

let lastPath = '';

export function render(): void {
  const app = document.getElementById('app')!;
  const { path, query } = currentPath();
  let view: View | null = notFound;
  let params: Params = {};
  for (const r of routes) {
    const m = r.pattern.exec(path);
    if (m) {
      view = r.view;
      params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      break;
    }
  }
  if (!view) return;
  const redirect = view.guard?.();
  if (redirect) { navigate(redirect); return; }

  const el = document.createElement('div');
  el.className = `view shell-${view.shell}`;
  el.innerHTML = view.render(params, query);
  app.replaceChildren(el);
  document.title = `${view.title(params)} | Wine Match`;
  document.body.dataset.shell = view.shell;
  if (path !== lastPath) { window.scrollTo(0, 0); lastPath = path; }
  view.mount?.(el, params, query, render);
  const h = el.querySelector<HTMLElement>('[data-autofocus]');
  h?.focus();
}

export function start(): void {
  window.addEventListener('hashchange', render);
  render();
}
