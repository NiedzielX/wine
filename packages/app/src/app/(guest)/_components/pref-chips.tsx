import {
  WINE_STYLES, budgetOptions, styleLabel, withBudget, withMood, withServing, withStyleToggled, withWeight,
  type GuestPreferences, type Locale
} from '@wine-match/core';
import type { Dictionary } from '@/i18n/en';
import { formatPrice } from '@/server/i18n';
import { Chip } from './guest-ui';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2.5 text-body font-semibold">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

/**
 * The preference chips of the guest app. Every chip is a link to the same page with the
 * changed preference in the URL (`hrefFor` builds it), so filtering works without JavaScript.
 * `full` adds body and mood; `scale` picks the budget thresholds (glass or bottle).
 * Labels are translated; the values in the URL (`styles=red`) never are.
 */
export function PrefChips({ prefs, hrefFor, full = false, t, locale }: { prefs: GuestPreferences; hrefFor: (p: GuestPreferences) => string; full?: boolean; t: Dictionary; locale: Locale }) {
  const budgets = budgetOptions(prefs.serving);
  const l = t.guest.prefs;
  return (
    <div>
      <Group title={l.glassOrBottle}>
        <Chip href={hrefFor(withServing(prefs, 'any'))} active={prefs.serving === 'any'}>{l.either}</Chip>
        <Chip href={hrefFor(withServing(prefs, 'glass'))} active={prefs.serving === 'glass'}>{l.glass}</Chip>
        <Chip href={hrefFor(withServing(prefs, 'bottle'))} active={prefs.serving === 'bottle'}>{l.bottle}</Chip>
      </Group>
      <Group title={l.colour}>
        {WINE_STYLES.map((s) => <Chip key={s} href={hrefFor(withStyleToggled(prefs, s))} active={prefs.styles.includes(s)}>{styleLabel(s, locale)}</Chip>)}
      </Group>
      <Group title={prefs.serving === 'glass' ? l.budgetPerGlass : l.budget}>
        <Chip href={hrefFor(withBudget(prefs, null))} active={prefs.maxPrice === null}>{l.any}</Chip>
        {budgets.map((b) => <Chip key={b} href={hrefFor(withBudget(prefs, b))} active={prefs.maxPrice === b}>{l.upTo(formatPrice(b, locale))}</Chip>)}
      </Group>
      {full && (
        <>
          <Group title={l.body}>
            <Chip href={hrefFor(withWeight(prefs, 'any'))} active={prefs.weight === 'any'}>{l.noPreference}</Chip>
            <Chip href={hrefFor(withWeight(prefs, 'lighter'))} active={prefs.weight === 'lighter'}>{l.lighter}</Chip>
            <Chip href={hrefFor(withWeight(prefs, 'fuller'))} active={prefs.weight === 'fuller'}>{l.fuller}</Chip>
          </Group>
          <Group title={l.mood}>
            <Chip href={hrefFor(withMood(prefs, 'any'))} active={prefs.mood === 'any'}>{l.noPreference}</Chip>
            <Chip href={hrefFor(withMood(prefs, 'classic'))} active={prefs.mood === 'classic'}>{l.classic}</Chip>
            <Chip href={hrefFor(withMood(prefs, 'adventurous'))} active={prefs.mood === 'adventurous'}>{l.adventurous}</Chip>
          </Group>
        </>
      )}
    </div>
  );
}
