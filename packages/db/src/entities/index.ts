import { DishEntity, DishProfileEmbeddable } from './catalog/dish';
import { GuestInteractionEntity } from './guests/guest-interaction';
import { ImportJobEntity } from './imports/import-job';
import { OpportunityDismissalEntity } from './opportunities/opportunity-dismissal';
import { RecommendationCodeEntity } from './recommendations/recommendation-code';
import { SalesRecordEntity } from './sales/sales-record';
import { PairingEntity } from './pairings/pairing';
import { PublishedVersionEntity } from './publishing/published-version';
import { RestaurantEntity } from './restaurants/restaurant';
import { SommelierDecisionEntity } from './pairings/sommelier-decision';
import { MembershipEntity, SessionEntity, UserEntity } from './auth/user';
import { WineEntity, WineProfileEmbeddable } from './catalog/wine';

export * from './restaurants/restaurant';
export * from './catalog/dish';
export * from './catalog/wine';
export * from './pairings/pairing';
export * from './publishing/published-version';
export * from './pairings/sommelier-decision';
export * from './guests/guest-interaction';
export * from './imports/import-job';
export * from './auth/user';
export * from './opportunities/opportunity-dismissal';
export * from './recommendations/recommendation-code';
export * from './sales/sales-record';

/** Every entity and embeddable known to the ORM. Register new entities here. */
export const ENTITIES = [
  RestaurantEntity, DishEntity, DishProfileEmbeddable, WineEntity, WineProfileEmbeddable,
  PairingEntity, PublishedVersionEntity, SommelierDecisionEntity, GuestInteractionEntity, ImportJobEntity,
  UserEntity, MembershipEntity, SessionEntity, OpportunityDismissalEntity, RecommendationCodeEntity, SalesRecordEntity
];
