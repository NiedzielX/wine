import { useId } from 'react';
import { cn } from '../lib/utils';

export interface MatchGlassProps {
  /** match score 0–100 */
  score: number;
  /** the wine's own colour, e.g. "#7D2234" */
  colour: string;
  size?: number;
  className?: string;
}

/**
 * The Wine Match signature element: a wine glass filled to the match level in the wine's colour.
 * Pure SVG + Tailwind, no shadcn — usable on guest pages and in the dashboard.
 */
export function MatchGlass({ score, colour, size = 44, className }: MatchGlassProps) {
  const id = useId();
  const clamped = Math.max(0, Math.min(100, score));
  const top = 6;
  const bottom = 30;
  const fillY = bottom - ((bottom - top) * clamped) / 100;
  return (
    <svg
      className={cn('shrink-0 text-current', className)}
      width={size}
      height={Math.round(size * 1.3)}
      viewBox="0 0 40 52"
      role="img"
      aria-label={`Match ${clamped} percent`}
    >
      <defs>
        <clipPath id={id}>
          <path d="M8 6h24c0 15-5 24-12 24S8 21 8 6z" />
        </clipPath>
      </defs>
      <rect x="0" y={fillY.toFixed(1)} width="40" height="40" fill={colour} clipPath={`url(#${id})`} />
      <path d="M8 6h24c0 15-5 24-12 24S8 21 8 6z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M20 30v14M13 46h14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
