'use client';

import { useEffect, useState } from 'react';

/**
 * The texts of the counter, from the page's dictionary. `below[n]` is shown for 1 ≤ n < min and `selected[n]` from
 * `min` up (indexed by the count, so each language keeps its own plural forms); the last entry covers larger counts.
 */
export interface SelectionCountLabels {
  initial: string;
  none: string;
  below: string[];
  selected: string[];
}

/**
 * Progressive enhancement for the table form: shows how many dishes are ticked and keeps the
 * submit button disabled below two. Without JavaScript the form still submits and the server
 * answers "Add at least two dishes". A client component gets plain strings, not the dictionary's functions.
 */
export function SelectionCount({ formId, name, min = 2, labels }: { formId: string; name: string; min?: number; labels: SelectionCountLabels }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const update = () => {
      const n = form.querySelectorAll(`input[name="${name}"]:checked`).length;
      setCount(n);
      if (submit) submit.disabled = n < min;
    };
    update();
    form.addEventListener('change', update);
    return () => form.removeEventListener('change', update);
  }, [formId, name, min]);

  const n = count ?? 0;
  const pick = (list: string[]) => list[n] ?? list[list.length - 1];
  const text = count === null ? labels.initial : n === 0 ? labels.none : n < min ? pick(labels.below) : pick(labels.selected);
  return <span aria-live="polite" className="text-center text-small text-ink-2">{text}</span>;
}
