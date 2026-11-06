import { LOCALES, type Locale } from '@wine-match/core';
import type { Dictionary } from '@/i18n/en';

/**
 * The top of a showcase page: the name, and the language as two plain links that keep the numbers in the address (the calculator's
 * state lives only in the URL). Hidden on paper. The links carry `lang` explicitly, so the choice survives the next click without a cookie.
 */
export function ShowcaseHeader({ path, query, locale, t }: { path: string; query: URLSearchParams; locale: Locale; t: Dictionary }) {
  const href = (lang: Locale) => {
    const q = new URLSearchParams(query);
    q.set('lang', lang);
    return `${path}?${q.toString()}`;
  };
  return (
    <header className="border-b border-border bg-background print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <p className="font-serif text-xl">{t.showcase.header.brand}</p>
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
