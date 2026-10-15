'use client';

import { useEffect, useState } from 'react';

/**
 * Progressive enhancement for the table form: shows how many dishes are ticked and keeps the
 * submit button disabled below two. Without JavaScript the form still submits and the server
 * answers "Add at least two dishes".
 */
export function SelectionCount({ formId, name, min = 2 }: { formId: string; name: string; min?: number }) {
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
  return (
    <span aria-live="polite" className="text-center text-sm text-ink-2">
      {count === null ? `Choose at least ${min} dishes` : n === 0 ? 'No dishes selected' : n < min ? `${n} dish selected, add one more` : `${n} dishes selected`}
    </span>
  );
}
