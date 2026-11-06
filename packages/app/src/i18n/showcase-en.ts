import type { RoiKey, RoiUnit } from '@wine-match/core';

/**
 * Texts of the public sales showcase (spec 2026-11-04-sales-demo-and-roi-calculator, R3, R13), `showcase.*` in the dictionaries.
 * Kept in its own file so the other epics that edit en.ts / pl.ts do not collide with it. Rules for every text here:
 * every number is an ASSUMPTION of the Wine Match team (decision D19), never a measurement or a promise; no "AI" wording;
 * the result of the formula is never called a profit.
 */
export interface RoiFieldText {
  label: string;
  /** the symbol used in the formulas */
  symbol: string;
  help: string;
}

export const showcaseEn = {
  meta: {
    roiTitle: 'Return calculator',
    summaryTitle: 'Assumptions summary: Wine Match return calculator',
    description: 'A calculator for restaurant owners: editable assumptions of the Wine Match team and the formula behind every number.'
  },
  header: {
    brand: 'Wine Match',
    language: 'Language',
    skip: 'Skip to the content'
  },
  roi: {
    title: 'Return calculator',
    lead: 'Enter your restaurant’s numbers and see how much extra margin from wine the Wine Match team’s assumptions would give. This is a calculation on assumptions, not a promise of a result.',
    what: {
      title: 'What this is',
      points: [
        'These are the Wine Match team’s own assumptions, not checked against your restaurant’s data. They are not measurements and they do not promise a result.',
        'We assume the whole change comes from Wine Match; we do not account for seasonality, a ramp-up period or costs on the restaurant’s side.',
        'We calculate Wine Attach Rate in the product per bill; here we approximate it with the share of guests.',
        'You can change every number. The result is recalculated from your values and the formula is written out below it.'
      ]
    },
    replaced: (names: string[]) => `We used the default instead of these values because they were not a plain number in the allowed range: ${names.join(', ')}.`,
    groups: {
      restaurant: { title: 'Your restaurant’s numbers', hint: 'Replace the working values with your own.' },
      assumptions: { title: 'Assumptions about Wine Match', hint: 'What we assume the product changes, and the price of the plan.' }
    },
    fields: {
      customers: { label: 'Guests per month', symbol: 'C', help: 'How many guests you serve in a month.' },
      attachRate: { label: 'Share of guests who order wine', symbol: 'a0', help: 'An approximation of Wine Attach Rate: what share of guests orders wine today.' },
      wineSpend: { label: 'Average wine spend per guest who orders wine', symbol: 's', help: 'What a guest who orders wine spends on it today.' },
      margin: { label: 'Margin on wine', symbol: 'm', help: 'The part of wine revenue that stays after the cost of the wine.' },
      attachChange: { label: 'Change in the share who order wine', symbol: 'Δa', help: 'In percentage points (pp): +5 means 30% becomes 35%.' },
      spendChange: { label: 'Change in spend per guest who orders wine', symbol: 'Δs', help: 'Extra spend on wine per guest who orders wine; a minus is allowed.' },
      planPrice: { label: 'Plan price per month', symbol: 'P', help: 'What the restaurant pays for the plan each month.' }
    } satisfies Record<RoiKey, RoiFieldText>,
    units: { count: 'guests', percent: '%', points: 'pp', pln: 'zł' } satisfies Record<RoiUnit, string>,
    default: (value: string) => `default: ${value}`,
    origin: {
      concept: 'team assumption: from the product concept',
      working: 'team assumption: working value, no source',
      own: (value: string) => `assumption: your value (default ${value})`,
      formula: 'result of the formula'
    },
    guests: (n: number, formatted: string) => (n === 1 ? `${formatted} guest` : `${formatted} guests`),
    actions: { submit: 'Show the result', reset: 'Restore defaults', summary: 'Printable summary' },
    result: {
      title: 'Result of the formula',
      headline: 'Extra margin after the plan fee (assumption)',
      headlineNote: 'Extra gross margin from wine minus the price of the plan. It does not include rollout costs, staff time or any other effects, so it is not the restaurant’s financial result.',
      perMonth: 'per month',
      negative: 'The value is negative: with these numbers the extra margin would not cover the plan.',
      revenue: 'Extra wine revenue',
      margin: 'Extra margin'
    },
    steps: {
      title: 'How we calculate',
      note: 'Every line is shown with the symbols, then with your numbers. Amounts are rounded to whole złoty only for display.',
      clamped: (requested: string, effective: string) => `The change in the share is limited to the range 0–100%: we apply ${effective} instead of ${requested}.`,
      clampedSpend: (requested: string, effective: string) => `Spend cannot go below 0: we apply ${effective} instead of ${requested}.`,
      none: 'no result',
      noneMargin: 'no result: the margin is 0%',
      noneSpend: 'no result: the margin or the spend is 0',
      after: { attach: 'Share ordering wine after the change', spend: 'Spend after the change' },
      effect: { attach: 'Effect of more guests ordering wine', spend: 'Effect of higher spend' },
      revenue: 'Extra wine revenue',
      margin: 'Extra margin',
      net: 'Extra margin after the plan fee (assumption)',
      breakEvenRevenue: 'Break-even: revenue that pays for the plan',
      breakEvenGuests: 'Break-even: extra guests ordering wine that pay for the plan, at today’s spend',
      perMonthSuffix: (value: string) => `${value} per month`,
      guestsMore: (value: string) => `${value} more per month`,
      symbolic: {
        attachAfter: 'a1 = min(100%, max(0%, a0 + Δa))',
        spendAfter: 's1 = max(0, s + Δs)',
        attachEffect: 'C × (a1 − a0) × s',
        spendEffect: 'C × a1 × (s1 − s)',
        revenue: 'attach effect + spend effect',
        margin: 'm × extra revenue',
        net: 'extra margin − P',
        breakEvenRevenue: 'P ÷ m',
        breakEvenGuests: 'P ÷ (m × s)'
      }
    }
  },
  summary: {
    title: 'Assumptions summary: Wine Match return calculator',
    dateLabel: 'Date',
    dateEmpty: 'not set',
    setDate: 'Set the date',
    back: 'Back to the calculator',
    print: 'Print / Save as PDF',
    printHint: 'Use Ctrl/Cmd+P to print or save as PDF.',
    inputsTitle: 'Numbers and assumptions',
    columns: { name: 'Number', value: 'Value', origin: 'Where it comes from' },
    note: 'These are assumptions, not measurements: the Wine Match team’s own, not checked against the restaurant’s data, and no promise of a result.',
    controls: 'Print controls'
  }
};
