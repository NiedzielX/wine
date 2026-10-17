import type { GuestInteractionInput, GuestInteractionRepository } from '../ports/repositories';

/**
 * Writes usage events with the given `createdAt` straight through the port — for unit and end-to-end tests of what
 * reads them (the KPI dashboard, E04). Goes through `record`, so both data sources accept exactly these rows.
 */
export async function seedUsageEvents(repo: GuestInteractionRepository, restaurantId: string, events: GuestInteractionInput[]): Promise<void> {
  await repo.record(restaurantId, events);
}
