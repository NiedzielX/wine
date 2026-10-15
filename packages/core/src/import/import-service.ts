import type { Actor } from '../auth/types';
import type { Dish, Pairing, Wine } from '../domain/types';
import { draftDishProfile, draftWineProfile } from '../engine/drafts';
import { generateSuggestions } from '../engine/suggest';
import { NotFoundError, ValidationError } from '../errors';
import type { ImportPlan, ImportRepository } from '../ports/import';
import type { Repositories } from '../ports/repositories';
import type { Clock, IdGenerator } from '../ports/runtime';
import { linesToRows, mapTable } from './mapping';
import { STYLE_COLOURS } from './normalize';
import { planDishTranslations, planWineTranslations } from '../services/catalog/translation-rules';
import type { DishTranslations, WineTranslations } from '../i18n/content';
import { IMPORT_LIMITS, type ImportFileParser, type ImportJob, type ImportKind, type ImportResult, type RowEdit } from './types';
import { buildRows, revalidate, type ExistingItems } from './validate';

export type ImportServiceDeps = Pick<Repositories, 'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'pairingRepository' | 'pairingWriteRepository'> & {
  importRepository: ImportRepository;
  importFileParser: ImportFileParser;
  clock: Clock;
  idGenerator: IdGenerator;
};

const num = (s: string) => Number(s);

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

  /** Reads the file and stores a preview. Problems with the file itself are thrown as ValidationError. */
  async upload(slug: string, kind: ImportKind, file: { name: string; bytes: Uint8Array }, actor: Actor): Promise<ImportJob> {
    if (kind !== 'menu' && kind !== 'wines') throw new ValidationError('invalid_kind', 'Import either the menu or the wine list.');
    const restaurant = await this.restaurant(slug);
    const parsed = await this.d.importFileParser.parse(file);
    const table = parsed.parser === 'pdf-text' ? linesToRows(kind, parsed.lines) : { rows: parsed.rows, notes: [] as string[] };
    const mapped = mapTable(kind, table.rows);
    if (mapped.records.length === 0) throw new ValidationError('no_rows', 'The file has a header but no rows. Add at least one dish or wine.');
    if (mapped.records.length > IMPORT_LIMITS.maxRows) throw new ValidationError('too_many_rows', `The file has more than ${IMPORT_LIMITS.maxRows} rows. Split it and import in parts.`);
    const rows = buildRows(kind, mapped.records, await this.existing(restaurant.id));
    const job: ImportJob = {
      id: this.d.idGenerator.uuid(), restaurantId: restaurant.id, kind, fileName: file.name.slice(0, 200), fileType: parsed.parser === 'pdf-text' ? 'pdf' : parsed.parser === 'xlsx' ? 'xlsx' : 'csv',
      fileSize: file.bytes.length, status: 'preview_ready', parser: parsed.parser, rows, notes: [...table.notes, ...mapped.notes], error: null,
      createdBy: actor.name, createdAt: this.d.clock.now().toISOString(), confirmedAt: null, result: null
    };
    await this.d.importRepository.create(job);
    return job;
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

  /** Applies corrections and ticks, checks all rows again, returns the updated preview. */
  async updateRows(slug: string, jobId: string, edits: RowEdit[]): Promise<ImportJob> {
    const restaurant = await this.restaurant(slug);
    const job = await this.get(slug, jobId);
    this.assertOpen(job);
    const known = new Set(job.rows.map((r) => r.rowNumber));
    const unknown = edits.find((e) => !known.has(e.rowNumber));
    if (unknown) throw new ValidationError('unknown_row', `Row ${unknown.rowNumber} does not exist in this import.`);
    const rows = revalidate(job.kind, job.rows, edits, await this.existing(restaurant.id));
    if (!(await this.d.importRepository.saveRows(restaurant.id, job.id, rows))) throw new ValidationError('job_closed', 'This import is already finished.');
    return { ...job, rows };
  }

  async cancel(slug: string, jobId: string): Promise<void> {
    const restaurant = await this.restaurant(slug);
    const job = await this.get(slug, jobId);
    this.assertOpen(job);
    await this.d.importRepository.cancel(restaurant.id, job.id);
  }

  /** Saves the ticked rows. Rows with errors can never be saved; an empty selection is refused. */
  async confirm(slug: string, jobId: string, actor: Actor, edits: RowEdit[] = []): Promise<ImportResult> {
    const restaurant = await this.restaurant(slug);
    let job = await this.get(slug, jobId);
    this.assertOpen(job);
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

  private plan(job: ImportJob, total: number, ctx: { dishes: Dish[]; wines: Wine[]; pairings: Pairing[]; now: string }): ImportPlan {
    const id = () => this.d.idGenerator.uuid();
    const chosen = job.rows.filter((r) => r.include);
    const plan: ImportPlan = { newDishes: [], dishUpdates: [], newWines: [], wineUpdates: [], newPairings: [], result: { created: 0, updated: 0, skipped: job.rows.length - total, suggestions: 0 } };

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
