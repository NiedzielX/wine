import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import { SALES_ITEM_TYPES } from '@wine-match/core';
import { ImportJobEntity } from '../imports/import-job';
import { RestaurantEntity } from '../restaurants/restaurant';

/**
 * One line of a check imported from the POS (spec 2026-10-15-pos-sales-import-attach-rate, data model). No personal
 * data and no item name (Q18). Lines are never edited or deleted: a newer import of the same check (business day and
 * check number) sets `replaced_at` / `replaced_by_job_id`, and every read takes `replaced_at IS NULL` only.
 */
export const SalesRecordEntity = defineEntity({
  name: 'SalesRecord',
  tableName: 'sales_record',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    importJob: () => p.manyToOne(ImportJobEntity),
    businessDate: p.date(),
    checkId: p.string().length(64),
    covers: p.integer().columnType('smallint').nullable().check('covers between 0 and 999'),
    itemType: p.enum([...SALES_ITEM_TYPES]),
    quantity: p.decimal('number').precision(10).scale(3).check('quantity <> 0'),
    netAmount: p.decimal('number').precision(12).scale(2),
    /** the recommendation code of the line (spec 2026-10-16-recommendation-code, R8): a code or null, never a comment */
    recommendationCode: p.string().length(4).nullable(),
    replacedAt: p.datetime().nullable(),
    replacedByJob: () => p.manyToOne(ImportJobEntity).nullable(),
    createdAt: p.datetime().onCreate(() => new Date())
  },
  indexes: [
    { properties: ['restaurant', 'businessDate', 'checkId'] },
    {
      // the POS match of a code (R9) reads the lines that carry one; partial, so the common null is not indexed
      name: 'sales_record_recommendation_code_idx',
      expression: 'create index sales_record_recommendation_code_idx on sales_record (restaurant_id, business_date, recommendation_code) where recommendation_code is not null'
    }
  ]
});

export type SalesRecordRow = InferEntity<typeof SalesRecordEntity>;
