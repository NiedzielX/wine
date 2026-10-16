import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface InfoDisclosureProps {
  /**
   * The question the guest or the sommelier taps, e.g. "Why these wines?". Plain text only: a `<summary>` must not
   * hold headings, links or buttons.
   */
  summary: string;
  /** the explanation, shown when the disclosure is open (in the normal page flow, never positioned over it) */
  children: ReactNode;
  /** only the "i" icon is visible; the summary stays the accessible name (`sr-only`) */
  compact?: boolean;
  /** open on first render; closed by default */
  open?: boolean;
  id?: string;
  /**
   * Which screen's explanation this is, written to `data-explain` (the hook for tests and for other specs that add a
   * paragraph to the same explanation). Not `name`: `<details name>` turns disclosures into an exclusive accordion.
   */
  explainId?: string;
  className?: string;
  summaryClassName?: string;
  bodyClassName?: string;
  iconClassName?: string;
}

/** The "i" in a circle. Decorative: the summary text names the control. */
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('size-5 shrink-0', className)} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="6.25" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * "How it works" explanation (spec 2026-10-16-how-it-works-explanations, R1–R2): a native `<details>` / `<summary>`,
 * so it opens with a tap, Enter or Space, announces its state natively and works without JavaScript. No `title`,
 * no hover, no client code. Colours, spacing and the touch target come from the caller's classes (guest: Tailwind
 * theme of the guest app; dashboard: panel theme), so the component has no theme of its own.
 */
export function InfoDisclosure({ summary, children, compact = false, open = false, id, explainId, className, summaryClassName, bodyClassName, iconClassName }: InfoDisclosureProps) {
  return (
    <details id={id} data-explain={explainId} open={open || undefined} className={className}>
      <summary className={cn('flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden', summaryClassName)}>
        <InfoIcon className={iconClassName} />
        {compact ? <span className="sr-only">{summary}</span> : <span>{summary}</span>}
      </summary>
      <div className={bodyClassName}>{children}</div>
    </details>
  );
}
