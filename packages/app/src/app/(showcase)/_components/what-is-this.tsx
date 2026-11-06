import type { Dictionary } from '@/i18n/en';

/** The fixed block "What this is" (R3): assumptions of the team, no promise of a result. Shown on the calculator and on the printout. */
export function WhatIsThis({ t }: { t: Dictionary }) {
  return (
    <section aria-labelledby="what-title" data-what-is-this className="rounded-lg border border-border bg-muted p-4">
      <h2 id="what-title" className="font-serif text-xl">{t.showcase.roi.what.title}</h2>
      <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-sm">
        {t.showcase.roi.what.points.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </section>
  );
}
