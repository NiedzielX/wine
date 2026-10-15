import {
  STYLE_LABELS, WINE_STYLES, budgetOptions, withBudget, withMood, withServing, withStyleToggled, withWeight,
  type GuestPreferences
} from '@wine-match/core';
import { Chip } from './guest-ui';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2.5 text-[15px] font-semibold">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

/**
 * The preference chips of the guest app. Every chip is a link to the same page with the
 * changed preference in the URL (`hrefFor` builds it), so filtering works without JavaScript.
 * `full` adds body and mood; `scale` picks the budget thresholds (glass or bottle).
 */
export function PrefChips({ prefs, hrefFor, full = false }: { prefs: GuestPreferences; hrefFor: (p: GuestPreferences) => string; full?: boolean }) {
  const budgets = budgetOptions(prefs.serving);
  return (
    <div>
      <Group title="Glass or bottle">
        <Chip href={hrefFor(withServing(prefs, 'any'))} active={prefs.serving === 'any'}>Either</Chip>
        <Chip href={hrefFor(withServing(prefs, 'glass'))} active={prefs.serving === 'glass'}>By the glass</Chip>
        <Chip href={hrefFor(withServing(prefs, 'bottle'))} active={prefs.serving === 'bottle'}>By the bottle</Chip>
      </Group>
      <Group title="Colour or style">
        {WINE_STYLES.map((s) => <Chip key={s} href={hrefFor(withStyleToggled(prefs, s))} active={prefs.styles.includes(s)}>{STYLE_LABELS[s]}</Chip>)}
      </Group>
      <Group title={`Budget${prefs.serving === 'glass' ? ' per glass' : ''}`}>
        <Chip href={hrefFor(withBudget(prefs, null))} active={prefs.maxPrice === null}>Any</Chip>
        {budgets.map((b) => <Chip key={b} href={hrefFor(withBudget(prefs, b))} active={prefs.maxPrice === b}>Up to {b} zł</Chip>)}
      </Group>
      {full && (
        <>
          <Group title="Body">
            <Chip href={hrefFor(withWeight(prefs, 'any'))} active={prefs.weight === 'any'}>No preference</Chip>
            <Chip href={hrefFor(withWeight(prefs, 'lighter'))} active={prefs.weight === 'lighter'}>Lighter</Chip>
            <Chip href={hrefFor(withWeight(prefs, 'fuller'))} active={prefs.weight === 'fuller'}>Fuller</Chip>
          </Group>
          <Group title="Mood">
            <Chip href={hrefFor(withMood(prefs, 'any'))} active={prefs.mood === 'any'}>No preference</Chip>
            <Chip href={hrefFor(withMood(prefs, 'classic'))} active={prefs.mood === 'classic'}>Classic</Chip>
            <Chip href={hrefFor(withMood(prefs, 'adventurous'))} active={prefs.mood === 'adventurous'}>Adventurous</Chip>
          </Group>
        </>
      )}
    </div>
  );
}
