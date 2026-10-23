import { z } from 'zod';
import { configDigest } from './config.js';
import { groupFileKey, groupFileKeyOfId, migrateSiteIdV1 } from './identity.js';
import type { Baseline, BaselineDiff, BaselineRevision, ImportSite, LegacyConfig } from './types.js';
import { sortedUnique } from './util.js';

export interface BaselineMeta {
  config: LegacyConfig;
  scannerVersion: string;
  revision?: BaselineRevision;
  now?: Date;
}

function buildBaseline(allowed: string[], meta: BaselineMeta): Baseline {
  const baseline: Baseline = {
    schemaVersion: 2,
    configDigest: configDigest(meta.config),
    scannerVersion: meta.scannerVersion,
    generatedAt: (meta.now ?? new Date()).toISOString(),
    allowed,
  };
  if (meta.revision) baseline.revision = meta.revision;
  return orderBaseline(baseline);
}

function cleanRevision(revision: BaselineRevision): BaselineRevision {
  const out: BaselineRevision = {};
  if (revision.commit !== undefined) out.commit = revision.commit;
  if (revision.branch !== undefined) out.branch = revision.branch;
  return out;
}

function orderBaseline(b: Baseline): Baseline {
  return {
    schemaVersion: b.schemaVersion,
    configDigest: b.configDigest,
    scannerVersion: b.scannerVersion,
    generatedAt: b.generatedAt,
    ...(b.revision ? { revision: cleanRevision(b.revision) } : {}),
    allowed: b.allowed,
  };
}

export function createBaseline(sites: readonly ImportSite[], meta: BaselineMeta): Baseline {
  return buildBaseline(sortedUnique(sites.map((s) => s.id)), meta);
}

export function updateBaseline(
  previous: Baseline,
  sites: readonly ImportSite[],
  meta: BaselineMeta,
): { baseline: Baseline; removed: string[] } {
  const current = new Set(sites.map((s) => s.id));
  const currentFiles = new Set(sites.map(groupFileKey));
  const prev = sortedUnique(previous.allowed);
  const isRetained = (id: string): boolean => {
    if (current.has(id)) return true;
    const key = groupFileKeyOfId(id);
    return key !== undefined && currentFiles.has(key);
  };
  const allowed = prev.filter(isRetained);
  const removed = prev.filter((id) => !isRetained(id));
  return { baseline: buildBaseline(allowed, meta), removed };
}

function kindlessKey(id: string): string | undefined {
  const parts = id.split('|');
  if (parts.length !== 4) return undefined;
  return `${parts[0]}|${parts[1]}|${parts[3]}`;
}

function kindlessKeys(ids: Iterable<string>): Set<string> {
  const keys = new Set<string>();
  for (const id of ids) {
    const key = kindlessKey(id);
    if (key !== undefined) keys.add(key);
  }
  return keys;
}

export function diffBaselines(base: Baseline, candidate: Baseline): BaselineDiff {
  const baseSet = new Set(base.allowed);
  const candidateSet = new Set(candidate.allowed);
  const baseKeys = base.upgradedFrom === 1 ? kindlessKeys(base.allowed) : undefined;
  const isAdded = (id: string): boolean => {
    if (baseSet.has(id)) return false;
    if (baseKeys) {
      const key = kindlessKey(id);
      if (key !== undefined && baseKeys.has(key)) return false;
    }
    return true;
  };
  return {
    added: sortedUnique(candidate.allowed.filter(isAdded)),
    removed: sortedUnique(base.allowed.filter((id) => !candidateSet.has(id))),
  };
}

export function reconcileMigratedBaseline(
  v1: Baseline,
  current: readonly ImportSite[],
  meta: BaselineMeta,
): { baseline: Baseline; added: string[]; dropped: string[] } {
  const mapped = sortedUnique(v1.allowed.map((id) => migrateSiteIdV1(id) ?? id));
  const mappedSet = new Set(mapped);
  const mappedKeys = kindlessKeys(mapped);
  const present = new Set(current.map((s) => s.id));
  const allowed = new Set(mapped.filter((id) => present.has(id)));
  const added: string[] = [];
  for (const id of sortedUnique(present)) {
    if (allowed.has(id)) continue;
    const key = kindlessKey(id);
    if (key === undefined || !mappedKeys.has(key)) continue;
    allowed.add(id);
    if (!mappedSet.has(id)) added.push(id);
  }
  return {
    baseline: buildBaseline(sortedUnique(allowed), meta),
    added,
    dropped: mapped.filter((id) => !present.has(id)),
  };
}

const revisionSchema = z
  .object({
    commit: z.string().optional(),
    branch: z.string().optional(),
  })
  .optional();

const baselineSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)], { error: 'schemaVersion must be 1 or 2' }),
  configDigest: z.string(),
  scannerVersion: z.string(),
  generatedAt: z.string(),
  revision: revisionSchema,
  allowed: z.array(z.string()),
});

export function parseBaseline(json: string): Baseline {
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid baseline: not valid JSON (${detail})`);
  }
  const result = baselineSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.map(String).join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');
    throw new Error(`Invalid baseline: ${details}`);
  }
  const data = result.data;
  if (data.schemaVersion === 1) {
    const allowed = sortedUnique(data.allowed.flatMap((id) => migrateSiteIdV1(id) ?? []));
    return { ...orderBaseline({ ...data, schemaVersion: 2, allowed } as Baseline), upgradedFrom: 1 };
  }
  return orderBaseline(data as Baseline);
}

export function serializeBaseline(b: Baseline): string {
  const ordered = orderBaseline({ ...b, allowed: sortedUnique(b.allowed) });
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
