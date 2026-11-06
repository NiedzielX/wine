import type { Dictionary } from '@/i18n/en';
import type { RoiStepView } from '@/server/showcase-roi';

/** The formula written out (R3): for every step the symbols, then the person's numbers, then the outcome marked as a result of the formula. */
export function RoiSteps({ steps, t }: { steps: RoiStepView[]; t: Dictionary }) {
  return (
    <section aria-labelledby="steps-title" className="grid gap-3">
      <div>
        <h2 id="steps-title" className="font-serif text-xl">{t.showcase.roi.steps.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.showcase.roi.steps.note}</p>
      </div>
      <ol className="grid gap-3">
        {steps.map((s) => (
          <li key={s.id} data-step={s.id} className="min-w-0 rounded-lg border border-border bg-card p-3 text-sm">
            <p className="font-medium">{s.label}</p>
            <p className="mt-1 text-muted-foreground"><code className="font-sans">{s.formula}</code></p>
            <p className="mt-1 break-words tabular-nums">{s.filled}</p>
            <p className="mt-1 font-medium tabular-nums">= <span data-step-value>{s.value}</span> <span data-origin="formula" className="ml-1 text-xs font-normal text-muted-foreground">({t.showcase.roi.origin.formula})</span></p>
            {s.note && <p data-step-note className="mt-1 text-muted-foreground">{s.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
