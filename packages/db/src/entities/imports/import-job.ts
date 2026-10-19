import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import type { ImportResult, ImportRow } from '@wine-match/core';
import { RestaurantEntity } from '../restaurants/restaurant';

/**
 * Upload of a menu, a wine list or POS sales (spec 2026-10-15-pos-sales-import-attach-rate). The checked rows live in `rows` until the job is
 * confirmed or cancelled. The uploaded file itself is NOT stored (`storageKey` stays empty): only what was read from it.
 */
export const ImportJobEntity = defineEntity({
  name: 'ImportJob',
  tableName: 'import_job',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    kind: p.enum(['menu', 'wines', 'sales'] as const),
    fileName: p.string(),
    fileType: p.string().length(20),
    fileSize: p.integer(),
    storageKey: p.string().nullable(),
    status: p.enum(['uploaded', 'parsing', 'preview_ready', 'confirmed', 'failed', 'cancelled'] as const).default('uploaded'),
    parser: p.string().length(30).nullable(),
    rows: p.json<ImportRow[]>().nullable(),
    /** how the file was read: no header found, a PDF is best effort, columns not used */
    notes: p.json<string[]>().nullable(),
    result: p.json<ImportResult>().nullable(),
    error: p.text().nullable(),
    createdBy: p.string(),
    createdAt: p.datetime().onCreate(() => new Date()),
    confirmedAt: p.datetime().nullable()
  }
});

export type ImportJobRow = InferEntity<typeof ImportJobEntity>;
