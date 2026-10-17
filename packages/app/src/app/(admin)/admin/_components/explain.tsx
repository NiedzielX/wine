import { InfoDisclosure } from '@wine-match/ui/brand/info-disclosure';

/**
 * "How it works" on a dashboard card (spec 2026-10-16-how-it-works-explanations, R1–R4, Q2): the shared native
 * disclosure in the panel theme. One per card, closed by default; `compact` shows only the "i" (24 px target,
 * the question stays its accessible name) for a crowded card header. Never inside a link, a button or a `<p>`
 * (a page `description` is a `<p>`: put it under the header instead). Texts: `admin.explain.<screen>` (phase 3).
 */
export function PanelExplain({ id, summary, points, compact = false, className = '' }: { id: string; summary: string; points: string[]; compact?: boolean; className?: string }) {
  return (
    <InfoDisclosure
      explainId={id}
      summary={summary}
      compact={compact}
      className={className}
      summaryClassName={`w-fit rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${compact ? 'size-6 justify-center' : 'min-h-6'}`}
      iconClassName={compact ? 'size-5' : 'size-4'}
      bodyClassName="clear-both mt-2 rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground"
    >
      <ul className="grid list-disc gap-1.5 pl-4">
        {points.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </InfoDisclosure>
  );
}
