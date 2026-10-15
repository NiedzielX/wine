import { z } from 'zod';

export const wineAvailabilitySchema = z.strictObject({ active: z.boolean() });
export type WineAvailabilityInput = z.output<typeof wineAvailabilitySchema>;
