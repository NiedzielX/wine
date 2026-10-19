import type { Dictionary } from '@/i18n/en';
import { markCode } from './actions';

/** One recommendation as G9 shows it: every text already localised and formatted by the page. */
export interface CodeCard {
  code: string;
  /** null when the wine is no longer in the restaurant's data */
  wine: { title: string; listNumber?: number } | null;
  serving: string;
  dishes: string;
  /** `HH:mm` in the restaurant's time zone */
  issuedAt: string;
  confirmedAt: string | null;
}

const fieldClass = 'min-h-11 w-full min-w-0 rounded-lg border border-[#d4ccd0] bg-surface px-3';
const buttonClass = 'inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-5 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine';

/**
 * "Order from a code" on G9 (spec 2026-10-16-recommendation-code, phase 2, UI/UX): a GET form for the code, the
 * recommendation it names, and one POST form — "Ordered", or the time it was marked and "Undo". Server component, no
 * logic; works without JavaScript. Every form carries the staff session (`sid`) and an explicit `lang`.
 */
export function CodeSection({ path, slug, input, lang, sid, message, card, t }: {
  path: string; slug: string; input: string; lang?: string; sid: string; message: string | null; card: CodeCard | null; t: Dictionary;
}) {
  const c = t.guest.staff.code;
  const state = (
    <>
      {lang && <input type="hidden" name="lang" value={lang} />}
      <input type="hidden" name="sid" value={sid} />
    </>
  );
  return (
    <section aria-labelledby="staff-code-title" data-staff-code className="mb-5 grid gap-2.5 rounded-xl border border-line bg-surface px-4 py-3.5">
      <h2 id="staff-code-title" className="text-body font-semibold">{c.title}</h2>
      <form action={path} method="get" className="grid gap-1.5">
        {state}
        <label htmlFor="staff-code" className="text-small font-semibold text-ink-2">{c.label}</label>
        <div className="flex gap-2">
          <input id="staff-code" name="code" defaultValue={input} maxLength={16} autoComplete="off" autoCapitalize="characters" spellCheck={false} className={`${fieldClass} font-serif text-lead tracking-[0.14em] uppercase`} />
          <button type="submit" className={`${buttonClass} border-[#d4ccd0] bg-surface`}>{c.find}</button>
        </div>
      </form>
      {message && <p role="status" className="text-body text-ink-2">{message}</p>}
      {card && (
        <article data-code-card={card.code} data-confirmed={card.confirmedAt ? 'true' : 'false'} className="grid gap-1 border-t border-line pt-3">
          <div className="flex items-baseline justify-between gap-2.5">
            <h3 className="min-w-0 font-serif text-lead">{card.wine?.title ?? c.wineGone}</h3>
            {card.wine?.listNumber !== undefined && <span className="shrink-0 text-ink-3 tabular-nums">{t.guest.staff.listNo(card.wine.listNumber)}</span>}
          </div>
          {card.serving && <p className="font-semibold tabular-nums">{card.serving}</p>}
          <p className="text-body text-ink-2">{card.dishes}</p>
          <p className="text-small text-ink-3 tabular-nums">{c.issuedAt(card.code, card.issuedAt)}</p>
          <form action={markCode} className="mt-1.5 flex flex-wrap items-center gap-3">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="code" value={card.code} />
            <input type="hidden" name="intent" value={card.confirmedAt ? 'undo' : 'confirm'} />
            {state}
            {card.confirmedAt ? (
              <>
                <span className="font-semibold text-sage">{c.markedAt(card.confirmedAt)}</span>
                <button type="submit" className={`${buttonClass} border-[#d4ccd0] bg-surface`}>{c.undo}</button>
              </>
            ) : (
              <button type="submit" className={`${buttonClass} border-wine bg-wine text-on-wine hover:bg-wine-deep`}>{c.confirm}</button>
            )}
          </form>
        </article>
      )}
    </section>
  );
}
