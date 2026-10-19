import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { LegacyConfig, ValidationIssue, ValidationResult } from './types.js';
import { stableStringify } from './util.js';

export const GROUP_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
export const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const nonEmpty = (label: string) =>
  z
    .string()
    .min(1, { error: `${label} must not be empty`, abort: true })
    .refine((s) => s.trim().length > 0, { error: `${label} must not be blank` });

const packageName = z
  .string()
  .regex(PACKAGE_NAME_PATTERN, { error: 'Must be a valid npm package name ("name" or "@scope/name", no subpaths)' });

const enforcementSchema = z
  .strictObject({
    mode: z.enum(['report', 'ratchet', 'ban']).default('report'),
    scope: z.literal('imports').default('imports'),
    severity: z.enum(['error', 'warn']).default('error'),
  })
  .default({ mode: 'report', scope: 'imports', severity: 'error' });

const groupSchema = z.strictObject({
  description: z.string().optional(),
  owner: z.string().optional(),
  old: z.array(packageName).min(1, { error: 'At least one old package is required' }),
  new: z.array(packageName).default([]),
  enforcement: enforcementSchema,
  docs: z.url({ error: 'Must be a URL' }).optional(),
  start: z
    .number({ error: 'Must be a number' })
    .int({ error: 'Must be an integer' })
    .min(0, { error: 'Must be at least 0' })
    .optional(),
});

const exceptionSchema = z.strictObject({
  groupId: z.string(),
  files: z
    .array(nonEmpty('Glob'))
    .min(1, { error: 'At least one file glob is required' }),
  reason: nonEmpty('Reason'),
  owner: nonEmpty('Owner'),
  issue: z.string().optional(),
  expires: z
    .string()
    .regex(DATE_PATTERN, { error: 'Must be a date in YYYY-MM-DD format' })
    .refine((v) => !DATE_PATTERN.test(v) || isRealDate(v), { error: 'Must be a real calendar date' }),
});

const groupsSchema = z.record(
  z.string().regex(GROUP_ID_PATTERN, { error: `Group id must match ${GROUP_ID_PATTERN}` }),
  groupSchema,
);

export const legacyConfigSchema = z
  .strictObject({
    $schema: z.string().optional(),
    version: z.literal(1, { error: 'version must be 1' }),
    groups: groupsSchema,
    ignore: z.array(nonEmpty('Glob')).optional(),
    exceptions: z.array(exceptionSchema).optional(),
  })
  .meta({
    title: 'migration-tracker configuration (migrations.json)',
    description: 'Declares deprecated ("old") packages, their preferred replacements, and how new import sites are enforced.',
  });

export function legacyConfigJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(legacyConfigSchema, {
    io: 'input',
    override: (ctx) => {
      if (ctx.zodSchema === groupsSchema) ctx.jsonSchema.minProperties = 1;
    },
  }) as Record<string, unknown>;
}

function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out === '' ? String(seg) : `.${String(seg)}`;
  }
  return out;
}

function toIssues(error: z.ZodError): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        issues.push({ path: formatPath([...issue.path, key]), message: `Unknown key "${key}"` });
      }
    } else if (issue.code === 'invalid_key') {
      const inner = issue.issues[0]?.message ?? issue.message;
      issues.push({ path: formatPath(issue.path), message: inner });
    } else {
      issues.push({ path: formatPath(issue.path), message: issue.message });
    }
  }
  return issues;
}

function conflictIssues(config: LegacyConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const oldOwner = new Map<string, string>();

  for (const [groupId, group] of Object.entries(config.groups)) {
    const seen = new Set<string>();
    group.old.forEach((pkg, i) => {
      const path = `groups.${groupId}.old[${i}]`;
      if (seen.has(pkg)) {
        issues.push({ path, message: `Duplicate package "${pkg}"` });
        return;
      }
      seen.add(pkg);
      const owner = oldOwner.get(pkg);
      if (owner !== undefined) {
        issues.push({ path, message: `Package "${pkg}" is already listed in old of group "${owner}"` });
      } else {
        oldOwner.set(pkg, groupId);
      }
    });
    const seenNew = new Set<string>();
    group.new.forEach((pkg, i) => {
      if (seenNew.has(pkg)) {
        issues.push({ path: `groups.${groupId}.new[${i}]`, message: `Duplicate package "${pkg}"` });
      }
      seenNew.add(pkg);
    });
  }

  for (const [groupId, group] of Object.entries(config.groups)) {
    group.new.forEach((pkg, i) => {
      const owner = oldOwner.get(pkg);
      if (owner !== undefined) {
        issues.push({
          path: `groups.${groupId}.new[${i}]`,
          message: `Package "${pkg}" cannot be both new here and old in group "${owner}"`,
        });
      }
    });
  }

  (config.exceptions ?? []).forEach((exception, i) => {
    if (!Object.hasOwn(config.groups, exception.groupId)) {
      issues.push({ path: `exceptions[${i}].groupId`, message: `Unknown group "${exception.groupId}"` });
    }
  });

  return issues;
}

export function validateConfig(input: unknown): ValidationResult {
  const result = legacyConfigSchema.safeParse(input);
  if (!result.success) return { ok: false, issues: toIssues(result.error) };
  const config: LegacyConfig = result.data;
  const issues: ValidationIssue[] = [];
  if (Object.keys(config.groups).length === 0) {
    issues.push({ path: 'groups', message: 'At least one group is required' });
  }
  issues.push(...conflictIssues(config));
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, config, issues: [] };
}

export function parseConfig(json: string): ValidationResult {
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, issues: [{ path: '', message: `Invalid JSON: ${detail}` }] };
  }
  return validateConfig(input);
}

export function configDigest(config: LegacyConfig): string {
  const json = stableStringify({ version: config.version, groups: config.groups });
  return `sha256:${createHash('sha256').update(json).digest('hex')}`;
}
