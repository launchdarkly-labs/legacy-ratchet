import { evaluate, parseSiteId, type Baseline, type ImportSite, type LegacyConfig } from '@legacy-ratchet/core';
import type { ScanError } from '@legacy-ratchet/scanner';

import { warningsFor, type CheckOutcome } from './format/types.js';

export interface CheckInput {
  config: LegacyConfig;
  sites: ImportSite[];
  baseline: Baseline | undefined;
  restrictTo?: readonly string[];
  errors?: readonly ScanError[];
  unlocated?: readonly ImportSite[];
  fileCount: number;
  changed?: { ref: string; files: string[] };
  baselineAdditions?: string[];
  now?: Date;
}

export function ratchetGroupsWithoutBaseline(config: LegacyConfig, baseline: Baseline | undefined): string[] {
  if (baseline) return [];
  return Object.entries(config.groups)
    .filter(([, g]) => g.enforcement.mode === 'ratchet')
    .map(([id]) => id);
}

export function restrictBaseline(baseline: Baseline, files: readonly string[]): Baseline {
  const scanned = new Set(files);
  const allowed = baseline.allowed.filter((id) => {
    try {
      return scanned.has(parseSiteId(id).filePath);
    } catch {
      return false;
    }
  });
  return { ...baseline, allowed };
}

export function buildCheckOutcome(input: CheckInput): CheckOutcome {
  const baseline =
    input.baseline && input.restrictTo ? restrictBaseline(input.baseline, input.restrictTo) : input.baseline;
  const result = evaluate(input.config, input.sites, baseline, input.now ? { now: input.now } : {});
  return {
    result,
    sites: input.sites,
    warnings: warningsFor(input.sites, input.errors ?? [], input.unlocated ?? []),
    fileCount: input.fileCount,
    failed: result.failed || (input.baselineAdditions?.length ?? 0) > 0,
    ...(input.baselineAdditions !== undefined ? { baselineAdditions: input.baselineAdditions } : {}),
    ...(input.changed ? { changed: input.changed } : {}),
  };
}
