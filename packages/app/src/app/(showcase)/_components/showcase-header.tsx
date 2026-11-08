import { LOCALES, type Locale, type ShowcaseMode } from '@wine-match/core';
import type { Dictionary } from '@/i18n/en';

/**
 * The top of a showcase page: the name, and the language as two plain links that keep the numbers in the address (the calculator's
 * state lives only in the URL). Hidden on paper. The links carry `lang` explicitly, so the choice survives the next click without a cookie.
 */
export function ShowcaseHeader({ path, query, locale, t, mode }: { path: string; query: URLSearchParams; locale: Locale; t: Dictionary; mode: ShowcaseMode }) {
  const href = (lang: Locale) => {
    const q = new URLSearchParams(query);
    q.set('lang', lang);
    return `${path}?${q.toString()}`;
  };
  // the pages of the guide carry only `lang`: the calculator's numbers do not belong on other pages
  const to = (target: string) => `${target}?lang=${locale}`;
  const links = [
    ...(mode === 'demo' ? [{ href: to('/demo'), label: t.showcase.header.links.guide, here: path === '/demo' }] : []),
    { href: to('/demo/tour'), label: t.showcase.header.links.tour, here: path === '/demo/tour' },
    { href: to('/demo/roi'), label: t.showcase.header.links.roi, here: path.startsWith('/demo/roi') }
  ];
  return (
    <header className="border-b border-border bg-background print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
        <p className="font-serif text-xl">{t.showcase.header.brand}</p>
        <nav aria-label={t.showcase.header.brand} className="flex flex-wrap items-center gap-x-4 text-sm">
          {links.map((l) => (
            <a key={l.href} href={l.href} aria-current={l.here ? 'page' : undefined} className="inline-flex min-h-9 items-center underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=page]:font-semibold">{l.label}</a>
          ))}
        </nav>
        <nav aria-label={t.showcase.header.language} className="flex items-center gap-1 text-sm">
          {LOCALES.map((lang) => (
            <a
              key={lang}
              href={href(lang)}
              lang={lang}
              hrefLang={lang}
              aria-current={lang === locale ? 'true' : undefined}
              className={`inline-flex min-h-9 items-center rounded-md px-3 font-medium underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${lang === locale ? 'bg-primary text-primary-foreground' : 'text-foreground hover:underline'}`}
            >
              {t.common.languageNames[lang]}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
