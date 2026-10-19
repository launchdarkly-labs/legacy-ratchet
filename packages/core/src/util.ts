export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareStrings);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compareStrings)) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeysDeep(v);
    }
    return out;
  }
  return value;
}

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
