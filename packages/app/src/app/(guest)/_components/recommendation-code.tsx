import type { Dictionary } from '@/i18n/en';

/**
 * The recommendation code on G8 (spec 2026-10-16-recommendation-code, UI/UX). Server component, no logic: the page
 * issues the code. The characters are shown large and hidden from screen readers, which read them one by one from
 * an `sr-only` text instead (`aria-label` on a plain element is not read reliably). Without a code — the session
 * reached its limit, the write failed, the request was not a guest's — one quiet line says so, and the rest of the
 * screen is unchanged.
 */
export function CodeForWaiter({ code, t }: { code: string | null; t: Dictionary }) {
  const l = t.guest.selected.code;
  if (!code) return <p data-recommendation-code="none" className="text-[14.5px] text-ink-2">{l.unavailable}</p>;
  return (
    <section data-recommendation-code={code} aria-labelledby="recommendation-code-title" className="grid w-full justify-items-center gap-1.5 rounded-[18px] border border-dashed border-[#d4ccd0] px-5 py-4">
      <h2 id="recommendation-code-title" className="text-sm font-semibold text-ink-2">{l.title}</h2>
      <p className="m-0">
        <span aria-hidden="true" className="font-serif text-[40px] leading-none tracking-[0.18em] tabular-nums">{code}</span>
        <span className="sr-only">{l.spoken(code)}</span>
      </p>
      <p className="text-[14.5px] text-ink-2">{l.hint}</p>
    </section>
  );
}
