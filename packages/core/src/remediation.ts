import type { Violation } from './types.js';

export const REASON_PLACEHOLDER = '<why this import must stay>';
export const OWNER_PLACEHOLDER = '<team>';
export const EXPIRES_PLACEHOLDER = '<YYYY-MM-DD>';

export interface RemediationException {
  groupId: string;
  files: string[];
  reason: string;
  owner: string;
  expires: string;
}

export interface Remediation {
  replacements: string[];
  suppressionComment: string;
  exception: RemediationException;
}

export function suppressionComment(groupId: string, reason: string = REASON_PLACEHOLDER): string {
  return `// migration-tracker-disable-next-line ${groupId} -- ${reason}`;
}

function exceptionEntry(groupId: string, files: string[]): RemediationException {
  return { groupId, files, reason: REASON_PLACEHOLDER, owner: OWNER_PLACEHOLDER, expires: EXPIRES_PLACEHOLDER };
}

export function remediationFor(v: Violation): Remediation {
  return {
    replacements: [...v.replacements],
    suppressionComment: suppressionComment(v.site.groupId),
    exception: exceptionEntry(v.site.groupId, [v.site.filePath]),
  };
}

export function exceptionEntries(violations: readonly Violation[]): RemediationException[] {
  const byGroup = new Map<string, Set<string>>();
  for (const v of violations) {
    const files = byGroup.get(v.site.groupId) ?? new Set<string>();
    files.add(v.site.filePath);
    byGroup.set(v.site.groupId, files);
  }
  return [...byGroup.keys()].sort().map((groupId) => exceptionEntry(groupId, [...(byGroup.get(groupId) ?? [])].sort()));
}

export function exceptionsSnippet(violations: readonly Violation[]): string {
  return JSON.stringify({ exceptions: exceptionEntries(violations) }, null, 2);
}
