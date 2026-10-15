import { cn } from '../lib/utils';

/**
 * A 0–5 taste or structure level as five dots (dashboard theme). Accessible: announces "n of 5"; the caller passes
 * `label` for another language (e.g. "3 z 5").
 */
export function LevelMeter({ value, className, label = (v) => `${v} of 5` }: { value: number; className?: string; label?: (value: number) => string }) {
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span role="img" aria-label={label(v)} className={cn('inline-flex gap-1', className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={cn('block size-2.5 rounded-full', i <= v ? 'bg-primary' : 'bg-border')} />
      ))}
    </span>
  );
}
