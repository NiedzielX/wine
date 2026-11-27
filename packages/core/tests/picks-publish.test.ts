import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { PICKS_MAX } from '../src/ranking/restaurant-picks';
import { picksVersion } from '../src/services/picks/picks-rules';
import { PublishService } from '../src/services/publishing/publish-service';
import { loadPublishedView } from '../src/services/publishing/published-view';

/** Spec 2026-11-18-restaurant-picks, PR1a: the picks in the publish (R5, R7) and the fingerprint of the working set. */

const ds = buildDemoDataset({ ids: 'uuid' });
const RID = ds.restaurant.id;
const ACTOR = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Marta Wierzbicka' };
const wines = ds.wines.filter((w) => w.active).map((w) => w.id).sort();
let ids = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

function setup() {
  const repos = createMemoryRepositories(MemoryStore.from(ds));
  const publish = new PublishService({ ...repos, clock: { now: () => new Date('2026-11-19T12:00:00.000Z') }, idGenerator: { uuid } });
  const mark = (wineId: string, enabled = true) =>
    repos.picksRepository.set(RID, { wineId, enabled, editId: uuid(), actor: 'Marta', actorId: ACTOR.id, at: '2026-11-19T09:00:00.000Z', max: PICKS_MAX });
  return { repos, publish, mark };
}

describe('picks in the publish', () => {
  it('a marked wine is an unpublished change; publishing writes it to the version, counts it in changesCount and clears it', async () => {
    const { repos, publish, mark } = setup();
    const base = await publish.preview('halka');
    expect(base.pendingPicks).toBe(0);
    await mark(wines[0]);
    await mark(wines[1]);
    const preview = await publish.preview('halka');
    expect(preview.pendingPicks).toBe(2);
    expect(preview.pendingChanges).toBe(base.pendingChanges + 2);
    const info = await publish.publish('halka', ACTOR);
    expect(info.changesCount).toBe(base.pendingChanges + 2);
    expect((await repos.publishRepository.effective(RID))!.snapshot.picks!.wineIds).toEqual([wines[0], wines[1]]);
    expect((await publish.preview('halka')).pendingPicks).toBe(0);
  });

  it('unmarking a published pick is a change as well', async () => {
    const { publish, mark } = setup();
    await mark(wines[0]);
    await publish.publish('halka', ACTOR);
    await mark(wines[0], false);
    expect((await publish.preview('halka')).pendingPicks).toBe(1);
  });

  it('a pick is the only reason to publish: with nothing else pending it is enough, and without it there is nothing to publish', async () => {
    const { repos, publish, mark } = setup();
    await publish.publish('halka', ACTOR);
    await expect(publish.publish('halka', ACTOR)).rejects.toMatchObject({ code: 'nothing_to_publish' });
    await mark(wines[2]);
    expect((await publish.publish('halka', ACTOR)).number).toBe(3);
    expect((await loadPublishedView(repos, ds.restaurant)).picks).toEqual(new Set([wines[2]]));
  });

  it('a wine switched off is a live change, not an unpublished one', async () => {
    const { repos, publish, mark } = setup();
    await publish.publish('halka', ACTOR);
    await mark(wines[0]);
    expect((await publish.preview('halka')).pendingPicks).toBe(1);
    await repos.wineWriteRepository.setActive(RID, wines[0], false);
    expect((await publish.preview('halka')).pendingPicks).toBe(0);
  });
});

describe('picksVersion', () => {
  it('does not depend on order or repeats, and tells different sets apart', () => {
    expect(picksVersion([wines[1], wines[0]])).toBe(picksVersion([wines[0], wines[1], wines[1]]));
    expect(picksVersion([wines[0]])).not.toBe(picksVersion([wines[1]]));
    expect(picksVersion([])).not.toBe(picksVersion([wines[0]]));
    expect(picksVersion([])).toMatch(/^[0-9a-f]{8}-\d+$/);
  });
});
