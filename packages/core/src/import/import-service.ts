import type { Actor } from '../auth/types';
import type { Dish, Pairing, Wine } from '../domain/types';
import { draftDishProfile, draftWineProfile } from '../engine/drafts';
import { generateSuggestions } from '../engine/suggest';
import { NotFoundError, ValidationError } from '../errors';
import type { CatalogImportPlan, ImportRepository, SalesImportPlan } from '../ports/import';
import type { Repositories } from '../ports/repositories';
import type { Clock, IdGenerator } from '../ports/runtime';
import { linesToRows, mapTable } from './mapping';
import { STYLE_COLOURS } from './normalize';
import { planDishTranslations, planWineTranslations } from '../services/catalog/translation-rules';
import type { DishTranslations, WineTranslations } from '../i18n/content';
import { IMPORT_LIMITS, type ImportFileParser, type ImportJob, type ImportKind, type ImportResult, type RowEdit } from './types';
import { buildRows, revalidate, type ExistingItems } from './validate';
import { applyValueMap, buildSalesRows, completeChecks, revalidateSales, unmappedValues } from './validate-sales';
import { aggregateChecks, computeSalesKpis, type SalesKpis } from '../services/sales/sales-kpis';
import { SALES_ITEM_TYPES, type SalesItemType } from '../services/sales/types';
import type { ValueMapEntry } from './types';

export type ImportServiceDeps = Pick<Repositories, 'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'pairingRepository' | 'pairingWriteRepository' | 'salesRepository' | 'recommendationCodeRepository'> & {
  importRepository: ImportRepository;
  importFileParser: ImportFileParser;
  clock: Clock;
  idGenerator: IdGenerator;
};

const num = (s: string) => Number(s);
const KINDS: readonly ImportKind[] = ['menu', 'wines', 'sales'];

/** The preview card of a sales import (A13): what a confirm would save, read from the ticked lines of complete checks. */
export interface SalesPreview {
  summary: {
    /** first and last business day of the lines to save; null when nothing would be saved */
    from: string | null;
    to: string | null;
    /** complete checks to save */
    checks: number;
    /** lines to save, per type */
    lines: Record<SalesItemType, number>;
    /** checks with a ticked line that are left out because another line is unticked or has an error (R6) */
    incompleteChecks: number;
    /** checks to save that are already saved (active) and will be replaced (Q4) */
    replacedChecks: number;
    /** saved checks that carry a recommendation code (spec 2026-10-16-recommendation-code, R9) */
    checksWithCode: number;
    /** distinct (business day, code) pairs of those checks that match no issued recommendation code (Q11) */
    unmatchedCodes: number;
  };
  /** the file's own Wine Attach Rate and KPIs, as they will count once saved */
  kpis: SalesKpis;
  /** the distinct unrecognised categories, each mapped once (Q3) */
  unmappedValues: Array<{ value: string; lines: number }>;
}

/**
 * The translations a row brings: `{ pl: { name } }` from `name_pl` etc. Only non-empty cells: an empty translation
 * cell changes nothing (spec 2026-10-15-bilingual-content, edge cases). Keys come from our own field list.
 */
function rowTranslations(f: Record<string, string>, map: Record<string, string>): Record<string, Record<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const [column, field] of Object.entries(map)) {
    const v = Object.hasOwn(f, column) ? f[column].trim() : '';
    if (!v) continue;
    const lang = column.slice(-2);
    if (!out.has(lang)) out.set(lang, new Map());
    out.get(lang)!.set(field, v);
  }
  return Object.fromEntries([...out].map(([l, m]) => [l, Object.fromEntries(m)]));
}
const DISH_COLUMNS = { name_pl: 'name', name_en: 'name', description_pl: 'description', description_en: 'description' };
const WINE_COLUMNS = {
  tasting_note_pl: 'tastingNote', tasting_note_en: 'tastingNote', region_pl: 'region', region_en: 'region', country_pl: 'country', country_en: 'country'
};
/** Merges the row's values into the current translations, per field (a language the row leaves out is kept). */
function mergeInto<T extends DishTranslations | WineTranslations>(current: T, add: Record<string, Record<string, string>>): T {
  return Object.fromEntries((['pl', 'en'] as const).flatMap((l) => {
    const merged = { ...(current[l] ?? {}), ...(Object.hasOwn(add, l) ? add[l] : {}) };
    return Object.keys(merged).length ? [[l, merged]] : [];
  })) as T;
}

/**
 * Import of the menu or the wine list: upload → preview with checks → corrections → one atomic save.
 * Nothing reaches the restaurant's data before `confirm`. New dishes arrive as drafts (they go live on
 * publish); new wines are on the list at once; the engine prepares suggestions for the new items.
 */
export class ImportService {
  private readonly d: ImportServiceDeps;

  constructor(deps: ImportServiceDeps) {
    this.d = deps;
  }

  private async restaurant(slug: string) {
    const r = await this.d.restaurantRepository.findBySlug(slug);
    if (!r) throw new NotFoundError('Restaurant');
    return r;
  }

  private async existing(restaurantId: string): Promise<ExistingItems> {
    const [dishes, wines] = await Promise.all([
      this.d.dishRepository.listByRestaurant(restaurantId),
      this.d.wineRepository.listByRestaurant(restaurantId)
    ]);
    return { dishes, wines };
  }

  /** The business day of "now" (UTC date): a business day later than the next one is refused. */
  private today(): string {
    return this.d.clock.now().toISOString().slice(0, 10);
  }

  /** Reads the file and stores a preview. Problems with the file itself are thrown as ValidationError. */
  async upload(slug: string, kind: ImportKind, file: { name: string; bytes: Uint8Array }, actor: Actor): Promise<ImportJob> {
    if (!KINDS.includes(kind)) throw new ValidationError('invalid_kind', 'Import the menu, the wine list or sales.');
    const restaurant = await this.restaurant(slug);
    const parsed = await this.d.importFileParser.parse(file);
    let rows: ImportJob['rows'];
    let notes: string[];
    if (kind === 'sales') {
      // a POS export is a table (Q14)
      if (parsed.parser === 'pdf-text') throw new ValidationError('unsupported_format', 'Sales are imported from a CSV or Excel (.xlsx) file, not a PDF.');
      const mapped = mapTable(kind, parsed.rows);
      this.assertRowCount(mapped.records.length);
      // no dishes, wines or pairings are loaded: sales lines are never matched with them (Q10, G13)
      const built = buildSalesRows(mapped.records, this.today());
      rows = built.rows;
      notes = [...mapped.notes, ...built.notes];
    } else {
      const table = parsed.parser === 'pdf-text' ? linesToRows(kind, parsed.lines) : { rows: parsed.rows, notes: [] as string[] };
      const mapped = mapTable(kind, table.rows);
      this.assertRowCount(mapped.records.length);
      rows = buildRows(kind, mapped.records, await this.existing(restaurant.id));
      notes = [...table.notes, ...mapped.notes];
    }
    const job: ImportJob = {
      id: this.d.idGenerator.uuid(), restaurantId: restaurant.id, kind, fileName: file.name.slice(0, 200), fileType: parsed.parser === 'pdf-text' ? 'pdf' : parsed.parser === 'xlsx' ? 'xlsx' : 'csv',
      fileSize: file.bytes.length, status: 'preview_ready', parser: parsed.parser, rows, notes, error: null,
      createdBy: actor.name, createdAt: this.d.clock.now().toISOString(), confirmedAt: null, result: null
    };
    await this.d.importRepository.create(job);
    return job;
  }

  private assertRowCount(n: number) {
    if (n === 0) throw new ValidationError('no_rows', 'The file has a header but no rows. Add at least one row.');
    if (n > IMPORT_LIMITS.maxRows) throw new ValidationError('too_many_rows', `The file has more than ${IMPORT_LIMITS.maxRows} rows. Split it and import in parts.`);
  }

  async get(slug: string, jobId: string): Promise<ImportJob> {
    const restaurant = await this.restaurant(slug);
    const job = await this.d.importRepository.find(restaurant.id, jobId);
    if (!job) throw new NotFoundError('Import');
    return job;
  }

  async recent(slug: string, kind: ImportKind, limit = 5): Promise<ImportJob[]> {
    const restaurant = await this.restaurant(slug);
    return (await this.d.importRepository.listRecent(restaurant.id, 25)).filter((j) => j.kind === kind).slice(0, limit);
  }

  /**
   * Applies corrections and ticks, checks all rows again, returns the updated preview. `valueMap` (sales only) maps
   * each unrecognised category once for all its lines (Q3).
   */
  async updateRows(slug: string, jobId: string, edits: RowEdit[], valueMap: ValueMapEntry[] = []): Promise<ImportJob> {
    const restaurant = await this.restaurant(slug);
    const job = await this.get(slug, jobId);
    this.assertOpen(job);
    this.assertKnownRows(job, edits);
    const rows = job.kind === 'sales'
      ? revalidateSales(job.rows, applyValueMap(job.rows, edits, valueMap), this.today())
      : revalidate(job.kind, job.rows, edits, await this.existing(restaurant.id));
    if (!(await this.d.importRepository.saveRows(restaurant.id, job.id, rows))) throw new ValidationError('job_closed', 'This import is already finished.');
    return { ...job, rows };
  }

  async cancel(slug: string, jobId: string): Promise<void> {
    const restaurant = await this.restaurant(slug);
    const job = await this.get(slug, jobId);
    this.assertOpen(job);
    await this.d.importRepository.cancel(restaurant.id, job.id);
  }

  private assertKnownRows(job: ImportJob, edits: RowEdit[]) {
    const known = new Set(job.rows.map((r) => r.rowNumber));
    const unknown = edits.find((e) => !known.has(e.rowNumber));
    if (unknown) throw new ValidationError('unknown_row', `Row ${unknown.rowNumber} does not exist in this import.`);
  }

  /** Saves the ticked rows. Rows with errors can never be saved; an empty selection is refused. */
  async confirm(slug: string, jobId: string, actor: Actor, edits: RowEdit[] = [], valueMap: ValueMapEntry[] = []): Promise<ImportResult> {
    const restaurant = await this.restaurant(slug);
    let job = await this.get(slug, jobId);
    this.assertOpen(job);
    if (job.kind === 'sales') return this.confirmSales(restaurant.id, job, edits, valueMap);
    const existing = await this.existing(restaurant.id);
    // the corrections sent with the confirm button count: a user must not lose what they typed last
    if (edits.length) job = { ...job, rows: revalidate(job.kind, job.rows, edits, existing) };
    // revalidate() never ticks a row with an error, so every chosen row is importable
    const chosen = job.rows.filter((r) => r.include);
    if (chosen.length === 0) throw new ValidationError('no_rows_selected', 'Tick at least one row to import.');

    const now = this.d.clock.now().toISOString();
    const [dishes, wines, pairings] = await Promise.all([
      this.d.dishRepository.listByRestaurant(restaurant.id),
      this.d.wineRepository.listByRestaurant(restaurant.id),
      this.d.pairingRepository.listByRestaurant(restaurant.id)
    ]);
    const plan = this.plan(job, chosen.length, { dishes, wines, pairings, now });
    await this.d.importRepository.confirm(restaurant.id, job.id, plan, now);
    void actor;
    return plan.result;
  }

  /**
   * A sales import (R6, R7): whole checks only; the repository replaces the active lines of the same checks and inserts
   * these, in one transaction. The same file twice leaves the same active lines.
   */
  private async confirmSales(restaurantId: string, job: ImportJob, edits: RowEdit[], valueMap: ValueMapEntry[]): Promise<ImportResult> {
    this.assertKnownRows(job, edits);
    const rows = edits.length || valueMap.length ? revalidateSales(job.rows, applyValueMap(job.rows, edits, valueMap), this.today()) : job.rows;
    if (!rows.some((r) => r.include)) throw new ValidationError('no_rows_selected', 'Tick at least one row to import.');
    const { lines, checks } = completeChecks(rows);
    if (!checks.length) throw new ValidationError('no_complete_checks', 'No check can be saved: each ticked line belongs to a check with an unticked line or an error.');
    const plan: SalesImportPlan = {
      kind: 'sales', checks, records: lines.map((l) => ({ id: this.d.idGenerator.uuid(), ...l })),
      result: { created: lines.length, updated: 0, skipped: rows.length - lines.length, suggestions: 0 }
    };
    const { replacedChecks } = await this.d.importRepository.confirm(restaurantId, job.id, plan, this.d.clock.now().toISOString());
    return { ...plan.result, replaced: replacedChecks };
  }

  /** The summary card of an open sales import (A13): what a confirm would save and the file's own Wine Attach Rate. */
  async salesPreview(slug: string, jobId: string): Promise<SalesPreview> {
    const restaurant = await this.restaurant(slug);
    const job = await this.get(slug, jobId);
    if (job.kind !== 'sales') throw new ValidationError('invalid_kind', 'This is not a sales import.');
    const { lines, checks, incomplete, checksWithCode, codes } = completeChecks(job.rows);
    const days = lines.map((l) => l.businessDate).sort();
    const from = days[0] ?? null;
    const to = days[days.length - 1] ?? null;
    const perType = Object.fromEntries(SALES_ITEM_TYPES.map((t) => [t, lines.filter((l) => l.itemType === t).length])) as Record<SalesItemType, number>;
    return {
      summary: {
        from, to, checks: checks.length, lines: perType, incompleteChecks: incomplete,
        replacedChecks: job.status === 'preview_ready' && checks.length ? await this.d.salesRepository.countChecks(restaurant.id, checks) : 0,
        checksWithCode,
        unmatchedCodes: codes.length ? await this.d.recommendationCodeRepository.countUnmatched(restaurant.id, codes) : 0
      },
      kpis: computeSalesKpis({ from: from ?? '', to: to ?? '' }, aggregateChecks(lines)),
      unmappedValues: unmappedValues(job.rows)
    };
  }

  private plan(job: ImportJob, total: number, ctx: { dishes: Dish[]; wines: Wine[]; pairings: Pairing[]; now: string }): CatalogImportPlan {
    const id = () => this.d.idGenerator.uuid();
    const chosen = job.rows.filter((r) => r.include);
    const plan: CatalogImportPlan = { kind: 'catalog', newDishes: [], dishUpdates: [], newWines: [], wineUpdates: [], newPairings: [], result: { created: 0, updated: 0, skipped: job.rows.length - total, suggestions: 0 } };

    if (job.kind === 'menu') {
      for (const r of chosen) {
        const f = r.fields;
        const tr = rowTranslations(f, DISH_COLUMNS);
        const has = Object.keys(tr).length > 0;
        if (r.action === 'update' && r.matchId) {
          const current = ctx.dishes.find((d) => d.id === r.matchId)?.translations ?? {};
          plan.dishUpdates.push({
            id: r.matchId, description: f.description, category: f.category as Dish['category'], price: num(f.price),
            ...(has ? { translations: planDishTranslations(current, mergeInto(current, tr)).next } : {})
          });
        } else {
          plan.newDishes.push({
            id: id(), name: f.name, description: f.description, category: f.category as Dish['category'], price: num(f.price),
            status: 'draft', profile: draftDishProfile(f.name, f.description, f.category as Dish['category']),
            translations: has ? planDishTranslations({}, tr).next : {}
          });
        }
      }
    } else {
      let next = Math.max(100, ...ctx.wines.map((w) => w.listNumber ?? 0)) + 1;
      for (const r of chosen) {
        const f = r.fields;
        const tr = rowTranslations(f, WINE_COLUMNS);
        const has = Object.keys(tr).length > 0;
        if (r.action === 'update' && r.matchId) {
          const current = ctx.wines.find((w) => w.id === r.matchId)?.translations ?? {};
          plan.wineUpdates.push({
            id: r.matchId, glassPrice: f.glassPrice ? num(f.glassPrice) : null, bottlePrice: num(f.bottlePrice),
            ...(has ? { translations: planWineTranslations(current, mergeInto(current, tr)).next } : {})
          });
        } else {
          const profile = draftWineProfile(f.grape, f.style);
          plan.newWines.push({
            id: id(), producer: f.producer, name: f.name, vintage: f.vintage === 'NV' ? 'NV' : num(f.vintage), region: f.region, country: f.country,
            grapes: f.grape ? f.grape.split(/\s*[,/]\s*/).filter(Boolean) : [], glassPrice: f.glassPrice ? num(f.glassPrice) : null,
            glassPour: profile.style === 'sweet' ? 75 : 150, bottlePrice: num(f.bottlePrice), bottleSize: 750, active: true, listNumber: next++,
            colour: STYLE_COLOURS[profile.style], tastingNote: '', profile, translations: has ? planWineTranslations({}, tr).next : {}
          });
        }
      }
    }
    plan.result.created = plan.newDishes.length + plan.newWines.length;
    plan.result.updated = plan.dishUpdates.length + plan.wineUpdates.length;
    plan.newPairings = this.suggestionsFor(plan.newDishes, plan.newWines, ctx);
    plan.result.suggestions = plan.newPairings.length;
    return plan;
  }

  /** Engine suggestions only for pairs that involve something new and do not exist yet. */
  private suggestionsFor(newDishes: Dish[], newWines: Wine[], ctx: { dishes: Dish[]; wines: Wine[]; pairings: Pairing[]; now: string }): Pairing[] {
    const taken = new Set(ctx.pairings.map((p) => `${p.dishId}:${p.wineId}`));
    const allWines = [...ctx.wines, ...newWines];
    const newDishIds = new Set(newDishes.map((d) => d.id));
    const newWineIds = new Set(newWines.map((w) => w.id));
    const dishes = [...ctx.dishes.filter((d) => d.status !== 'hidden'), ...newDishes];
    return generateSuggestions(dishes, allWines, { generatedAt: ctx.now, idFor: () => this.d.idGenerator.uuid() })
      .filter((p) => (newDishIds.has(p.dishId) || newWineIds.has(p.wineId)) && !taken.has(`${p.dishId}:${p.wineId}`));
  }

  /** Prepares suggestions for dishes and wines that have none yet (Setup: "Generate suggestions"). */
  async regenerateSuggestions(slug: string): Promise<number> {
    const restaurant = await this.restaurant(slug);
    const [dishes, wines, pairings] = await Promise.all([
      this.d.dishRepository.listByRestaurant(restaurant.id),
      this.d.wineRepository.listByRestaurant(restaurant.id),
      this.d.pairingRepository.listByRestaurant(restaurant.id)
    ]);
    const taken = new Set(pairings.map((p) => `${p.dishId}:${p.wineId}`));
    const fresh = generateSuggestions(dishes.filter((d) => d.status !== 'hidden'), wines, { generatedAt: this.d.clock.now().toISOString(), idFor: () => this.d.idGenerator.uuid() })
      .filter((p) => !taken.has(`${p.dishId}:${p.wineId}`));
    return fresh.length ? this.d.pairingWriteRepository.addSuggestions(restaurant.id, fresh) : 0;
  }

  private assertOpen(job: ImportJob) {
    if (job.status !== 'preview_ready') throw new ValidationError('job_closed', 'This import is already finished.');
  }
}
