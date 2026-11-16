import { LOCALES, type Locale } from '@wine-match/core';
import type { Dictionary } from '@/i18n/en';

/**
 * The top of `/start` (spec 2026-11-16-interactive-demo-entry, R2): its OWN header. `ShowcaseHeader` links to `/demo/tour` and `/demo/roi`
 * unconditionally, and on the interactive instance the calculator may be switched off. The language is two plain links with `lang`.
 */
export function StartHeader({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
        <p className="font-serif text-xl">{t.showcase.header.brand}</p>
        <nav aria-label={t.showcase.header.language} className="flex items-center gap-1 text-sm">
          {LOCALES.map((lang) => (
            <a
              key={lang}
              href={`/start?lang=${lang}`}
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
