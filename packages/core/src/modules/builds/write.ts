import type { BuildInput as BuildInputPayload } from '@dossier/shared';
import type { Db } from '../../platform/db/index.js';
import { logEvent, withTransaction, WriteError, type WriteResult } from '../../platform/journal/index.js';
import { resolveItem, resolveOptionalItem } from '../catalog/index.js';
import * as repo from './repo/builds.js';

export function buildSnapshot(db: Db, slug: string) {
  const build = repo.getBuild(db, slug);
  if (!build) return null;
  return {
    slug: build.slug,
    title: build.title,
    short: build.short,
    tag: build.tag,
    goal: build.goal,
    containerItemId: build.container_item_id,
    slots: build.slots,
    eff: build.eff,
    budget: build.budget,
    total: build.total,
    verdict: build.verdict,
    position: build.position,
    metrics: repo.listBuildMetrics(db, build.id).map((metric) => ({
      l: metric.label,
      v: metric.value,
      s: metric.sub,
    })),
    rows: repo.listBuildSlots(db, build.id).map((slot) => ({
      itemId: slot.item_id,
      label: slot.label,
      quality: slot.quality,
      rank: slot.rank,
      price: slot.price,
      lots: slot.lots,
      eff: slot.eff,
      bonus: slot.bonus,
      minus: slot.minus,
      why: slot.why,
    })),
  };
}

export function saveBuild(db: Db, input: BuildInputPayload): WriteResult {
  const existing = buildSnapshot(db, input.slug);
  const container = input.container ? resolveItem(db, input.container, 'container') : null;
  const rows = input.rows.map((row) => {
    const item = resolveOptionalItem(db, row.name ?? row.label ?? null);
    return {
      itemId: item?.id ?? null,
      label: row.name ?? row.label ?? null,
      quality: row.quality ?? null,
      rank: row.rank ?? null,
      price: row.price ?? null,
      lots: row.lots ?? null,
      eff: row.eff ?? null,
      bonus: row.bonus ?? null,
      minus: row.minus ?? null,
      why: row.why ?? null,
    };
  });
  const after = {
    slug: input.slug,
    title: input.title,
    short: input.short ?? null,
    tag: input.tag ?? null,
    goal: input.goal ?? null,
    containerItemId: container?.id ?? null,
    slots: input.slots ?? null,
    eff: input.eff ?? null,
    budget: input.budget ?? null,
    total: input.total ?? null,
    metrics: input.metrics?.map((metric) => ({ l: metric.l, v: metric.v ?? null, s: metric.s ?? null })) ?? null,
    verdict: input.verdict ?? null,
    position: existing?.position ?? repo.listBuilds(db).length,
    rows,
  };
  const human = existing ? `Build "${input.title}" updated` : `Build "${input.title}" created`;

  if (input.dryRun) return { dryRun: true, diff: { before: existing, after, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    repo.saveBuild(db, after);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'build.save',
      entity: 'build',
      entityId: input.slug,
      before: existing,
      after,
    });
  });
  return { dryRun: false, diff: { before: existing, after, human }, eventId };
}

export function deleteBuild(db: Db, slug: string, dryRun: boolean): WriteResult {
  const before = buildSnapshot(db, slug);
  if (!before) throw new WriteError(404, 'BUILD_NOT_FOUND', 'Build not found');
  const human = `Build "${before.title}" deleted`;

  if (dryRun) return { dryRun: true, diff: { before, after: null, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    repo.deleteBuild(db, slug);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'build.delete',
      entity: 'build',
      entityId: slug,
      before,
      after: null,
    });
  });
  return { dryRun: false, diff: { before, after: null, human }, eventId };
}

/** Restores a build snapshot. Assumes the caller holds the transaction. */
export function restoreBuildTx(db: Db, snapshot: any): void {
  if (snapshot) repo.saveBuild(db, snapshot);
}

/** Deletes one build without logging. Assumes the caller holds the transaction. */
export function deleteBuildTx(db: Db, slug: string): void {
  repo.deleteBuild(db, slug);
}

/** Deletes every build and returns the snapshots needed to restore them. */
export function clearBuildsTx(db: Db) {
  const builds = repo.listBuilds(db);
  const snapshots = builds.map((build) => buildSnapshot(db, build.slug)).filter(Boolean);
  for (const build of builds) repo.deleteBuild(db, build.slug);
  return snapshots;
}
