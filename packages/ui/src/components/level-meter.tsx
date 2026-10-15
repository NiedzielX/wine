import { cn } from '../lib/utils';

/** A 0–5 taste or structure level as five dots (dashboard theme). Accessible: announces "n of 5". */
export function LevelMeter({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span role="img" aria-label={`${v} of 5`} className={cn('inline-flex gap-1', className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={cn('block size-2.5 rounded-full', i <= v ? 'bg-primary' : 'bg-border')} />
      ))}
    </span>
  );
}
