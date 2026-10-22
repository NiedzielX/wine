import { LockMode, type EntityManager } from '@mikro-orm/postgresql';
import {
  ENGINE_VERSION, InvariantError, NotFoundError, type CatalogImportPlan, type ImportJob, type ImportPlan, type ImportRepository, type ImportRow, type SalesImportPlan
} from '@wine-match/core';
import { DishEntity, ImportJobEntity, PairingEntity, RestaurantEntity, SalesRecordEntity, WineEntity } from '../entities';
import { toImportJob } from '../mappers';
import { translate } from './errors';

interface Deps { em: EntityManager }

export class PgImportRepository implements ImportRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async create(job: ImportJob) {
    this.em.create(ImportJobEntity, {
      id: job.id, restaurant: this.em.getReference(RestaurantEntity, job.restaurantId), kind: job.kind, fileName: job.fileName, fileType: job.fileType,
      fileSize: job.fileSize, storageKey: null, status: job.status, parser: job.parser, rows: job.rows, notes: job.notes, error: job.error,
      createdBy: job.createdBy, createdAt: new Date(job.createdAt), confirmedAt: null, result: null
    });
    await this.em.flush();
  }

  async find(restaurantId: string, jobId: string) {
    const j = await this.em.findOne(ImportJobEntity, { id: jobId, restaurant: restaurantId });
    return j ? toImportJob(j) : null;
  }

  async listRecent(restaurantId: string, limit: number) {
    const rows = await this.em.find(ImportJobEntity, { restaurant: restaurantId }, { orderBy: { createdAt: 'desc', id: 'desc' }, limit });
    return rows.map(toImportJob);
  }

  /** A conditional UPDATE: it only touches a job that is still open. */
  async saveRows(restaurantId: string, jobId: string, rows: ImportRow[]) {
    const n = await this.em.nativeUpdate(ImportJobEntity, { id: jobId, restaurant: restaurantId, status: 'preview_ready' }, { rows });
    return n > 0;
  }

  async cancel(restaurantId: string, jobId: string) {
    const n = await this.em.nativeUpdate(ImportJobEntity, { id: jobId, restaurant: restaurantId, status: 'preview_ready' }, { status: 'cancelled' });
    return n > 0;
  }

  async confirm(restaurantId: string, jobId: string, plan: ImportPlan, at: string) {
    try {
      return await this.em.transactional(async (em) => {
        // the row lock makes a double click wait, then find the job closed
        const job = await em.findOne(ImportJobEntity, { id: jobId, restaurant: restaurantId }, { lockMode: LockMode.PESSIMISTIC_WRITE });
        if (!job) throw new NotFoundError('Import');
        if (job.status !== 'preview_ready') throw new InvariantError('job_closed', 'This import is already finished.');
        const replacedChecks = plan.kind === 'sales' ? await this.applySales(em, restaurantId, jobId, plan, at) : await this.applyCatalog(em, restaurantId, plan);
        job.status = 'confirmed';
        job.confirmedAt = new Date(at);
        job.result = plan.kind === 'sales' ? { ...plan.result, replaced: replacedChecks } : plan.result;
        await em.flush();
        return { replacedChecks };
      });
    } catch (e) {
      throw translate(e);
    } finally {
      this.em.clear();
    }
  }

  /**
   * Sales (spec 2026-10-15-pos-sales-import-attach-rate, Q4, R7, R8). After the job's row lock, a transaction-scoped
   * advisory lock per restaurant: two confirms of different jobs with the same checks run one after the other, so the
   * second replaces the lines of the first and only one set stays active. The lock order is fixed (job, then
   * restaurant), so no lock cycle. Then one UPDATE marks the active lines of the same checks replaced, and one insert.
   */
  private async applySales(em: EntityManager, restaurantId: string, jobId: string, plan: SalesImportPlan, at: string): Promise<number> {
    await em.execute(`select pg_advisory_xact_lock(hashtext('sales_record:' || ?::text))`, [restaurantId]);
    let replaced = 0;
    if (plan.checks.length) {
      const rows = await em.execute<Array<{ n: string }>>(
        `with keys as (select distinct k.day, k.check_id from jsonb_to_recordset(?::jsonb) as k(day date, check_id text)),
              done as (
                update sales_record s set replaced_at = ?, replaced_by_job_id = ?
                  from keys where s.restaurant_id = ? and s.replaced_at is null and s.business_date = keys.day and s.check_id = keys.check_id
                returning s.business_date, s.check_id)
         select count(*)::text as n from (select distinct business_date, check_id from done) d`,
        [JSON.stringify(plan.checks.map((c) => ({ day: c.businessDate, check_id: c.checkId }))), new Date(at), jobId, restaurantId]
      );
      replaced = Number(rows[0]?.n ?? 0);
    }
    if (plan.records.length) {
      await em.insertMany(SalesRecordEntity, plan.records.map((r) => ({
        id: r.id, restaurant: restaurantId, importJob: jobId, businessDate: r.businessDate, checkId: r.checkId, covers: r.covers,
        itemType: r.itemType, quantity: r.quantity, netAmount: r.netAmount, recommendationCode: r.recommendationCode, replacedAt: null, replacedByJob: null, createdAt: new Date(at)
      })));
    }
    return replaced;
  }

  private async applyCatalog(em: EntityManager, restaurantId: string, plan: CatalogImportPlan): Promise<number> {
    const restaurant = em.getReference(RestaurantEntity, restaurantId);

    for (const u of plan.dishUpdates) {
      const d = await em.findOne(DishEntity, { id: u.id, restaurant: restaurantId, deletedAt: null });
      if (!d) throw new NotFoundError('Dish');
      Object.assign(d, { description: u.description, category: u.category, price: u.price });
      if (u.translations) d.translations = { ...u.translations };
    }
    for (const u of plan.wineUpdates) {
      const w = await em.findOne(WineEntity, { id: u.id, restaurant: restaurantId, deletedAt: null });
      if (!w) throw new NotFoundError('Wine');
      Object.assign(w, { glassPrice: u.glassPrice, bottlePrice: u.bottlePrice });
      if (u.translations) w.translations = { ...u.translations };
    }

    const last = await em.find(DishEntity, { restaurant: restaurantId }, { orderBy: { sortOrder: 'desc' }, limit: 1 });
    let order = (last[0]?.sortOrder ?? -1) + 1;
    for (const d of plan.newDishes) {
      em.create(DishEntity, {
        id: d.id, restaurant, name: d.name, description: d.description, category: d.category, price: d.price, status: d.status, sortOrder: order++, translations: d.translations ?? {},
        profile: { ...d.profile, draftedBy: 'rules-1.0', confirmedAt: null }
      });
    }
    for (const w of plan.newWines) {
      em.create(WineEntity, {
        id: w.id, restaurant, producer: w.producer, name: w.name, vintage: w.vintage === 'NV' ? null : w.vintage, region: w.region, country: w.country,
        grapes: w.grapes, listNumber: w.listNumber ?? 0, glassPrice: w.glassPrice, glassPourMl: w.glassPour, bottlePrice: w.bottlePrice,
        bottleSizeMl: w.bottleSize, active: w.active, colourHex: w.colour, tastingNote: w.tastingNote, translations: w.translations ?? {}, profile: { ...w.profile, source: 'grape_defaults' }
      });
    }
    await em.flush();
    for (const p of plan.newPairings) {
      em.create(PairingEntity, {
        id: p.id, restaurant, dish: em.getReference(DishEntity, p.dishId), wine: em.getReference(WineEntity, p.wineId), status: 'suggested', role: null,
        rank: null, comment: null, commentTranslations: {}, modelScore: p.modelScore, factors: null, engineVersion: ENGINE_VERSION, source: 'engine', dirty: false,
        updatedBy: p.updatedBy, updatedAt: new Date(p.updatedAt)
      });
    }
    return 0;
  }
}
