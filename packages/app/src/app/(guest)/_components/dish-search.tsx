'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

const noop = () => () => {};

/** Lower case without diacritics, so "zur" finds "Żurek", "baltycki" finds "bałtycki" and "creme" finds "Crème". */
const fold = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l');

/**
 * "Find a dish" on the waiter's whole-table form (spec 2026-10-16-whole-table-waiter-path, R5b): an enhancement with
 * JavaScript only — without it nothing is rendered and the section anchors do the job. It hides the tiles
 * (`[data-dish-name]`) that do not match and the sections (`[data-dish-section]`) left empty; hidden checkboxes keep
 * their state and are still submitted. The box has no `name`, so it is never sent, and Enter does not submit the form.
 */
export function DishSearch({ containerId, label }: { containerId: string; label: string }) {
  // false in the server HTML and while hydrating, true once the script runs: without JavaScript there is no box
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const root = document.getElementById(containerId);
    if (!root) return;
    const needle = fold(query.trim());
    for (const tile of root.querySelectorAll<HTMLElement>('[data-dish-name]')) tile.hidden = needle !== '' && !fold(tile.dataset.dishName ?? '').includes(needle);
    for (const section of root.querySelectorAll<HTMLElement>('[data-dish-section]')) section.hidden = needle !== '' && !section.querySelector('[data-dish-name]:not([hidden])');
  }, [containerId, query]);

  if (!ready) return null;
  return (
    <label className="mt-3 block">
      <span className="sr-only">{label}</span>
      <input
        type="search" value={query} placeholder={label} autoComplete="off" enterKeyHint="done"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        className="min-h-11 w-full rounded-full border border-control bg-surface px-4 text-body focus-visible:outline-2 focus-visible:outline-wine"
      />
    </label>
  );
}
