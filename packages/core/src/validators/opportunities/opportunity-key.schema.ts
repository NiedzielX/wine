import { z } from 'zod';

/**
 * The key of an opportunity: its rule and its subject (spec 2026-10-16-sommelier-opportunities, "Klucz").
 *   dish_no_primary:{dishId}:{none|no_primary|primary_hidden} · glass_match_unpaired:{dishId} · wine_unpaired:{wineId}
 *   shown_rarely_chosen:{dishId}:{wineId} · ordered_not_reviewed:{dishId}:{wineId}
 * Identifiers are 1–64 characters of [A-Za-z0-9_-] (uuids and the demo's readable ids).
 */
const ID = '[A-Za-z0-9_-]{1,64}';
export const OPPORTUNITY_KEY_PATTERN = new RegExp(
  `^(?:dish_no_primary:${ID}:(?:none|no_primary|primary_hidden)|glass_match_unpaired:${ID}|wine_unpaired:${ID}|(?:shown_rarely_chosen|ordered_not_reviewed):${ID}:${ID})$`
);

export const opportunityKeySchema = z.strictObject({ key: z.string().min(1).max(200).regex(OPPORTUNITY_KEY_PATTERN) });
export type OpportunityKeyInput = z.output<typeof opportunityKeySchema>;
