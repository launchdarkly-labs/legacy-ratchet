import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { legacyConfigJsonSchema } from './config.js';

const schemaUrl = new URL('../schema.json', import.meta.url);
const expected = `${JSON.stringify(legacyConfigJsonSchema(), null, 2)}\n`;

describe('schema.json', () => {
  it('is up to date with the zod schema (run `pnpm --filter @legacy-ratchet/core generate:schema`)', () => {
    if (process.env.UPDATE_SCHEMA === '1') writeFileSync(schemaUrl, expected);
    expect(readFileSync(schemaUrl, 'utf8')).toBe(expected);
  });

  it('allows $schema and rejects unknown top-level keys', () => {
    const schema = JSON.parse(expected) as { properties: Record<string, unknown>; additionalProperties: boolean };
    expect(schema.properties).toHaveProperty('$schema');
    expect(schema.additionalProperties).toBe(false);
  });
});
