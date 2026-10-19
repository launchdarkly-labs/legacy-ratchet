import { describe, expect, it } from 'vitest';
import { formatViolation } from './index.js';
import type { ImportSite, Violation } from './index.js';

const site: ImportSite = {
  id: 'forms|src/features/checkout/PaymentForm.tsx|import|redux-form',
  groupId: 'forms',
  filePath: 'src/features/checkout/PaymentForm.tsx',
  packageName: 'redux-form',
  moduleSpecifier: 'redux-form',
  importKind: 'import',
  kinds: ['import'],
  typeOnly: false,
  sourceFingerprint: '0000000000000000',
  occurrences: 1,
  line: 8,
  column: 22,
};

const violation: Violation = {
  site,
  reason: 'new-site',
  severity: 'error',
  message: 'New import of "redux-form" is not allowed.',
  replacements: ['react-hook-form'],
  docs: 'https://engineering.example.com/migrations/forms',
};

describe('formatViolation', () => {
  it('matches the contract example byte-for-byte', () => {
    expect(formatViolation(violation)).toBe(
      '✖ forms: src/features/checkout/PaymentForm.tsx:8\n' +
        '  New import of "redux-form" is not allowed.\n' +
        '  Preferred replacement: "react-hook-form"\n' +
        '  Migration guide: https://engineering.example.com/migrations/forms',
    );
  });

  it('uses ⚠ for warnings', () => {
    expect(formatViolation({ ...violation, severity: 'warn' }).startsWith('⚠ forms: ')).toBe(true);
  });

  it('lists multiple replacements', () => {
    expect(formatViolation({ ...violation, replacements: ['a', 'b'] })).toContain('\n  Preferred replacements: "a", "b"\n');
  });

  it('omits the replacement and guide lines when absent', () => {
    const { docs: _docs, ...noDocs } = violation;
    expect(formatViolation({ ...noDocs, replacements: [], reason: 'banned', message: 'Import of "redux-form" is banned.' })).toBe(
      '✖ forms: src/features/checkout/PaymentForm.tsx:8\n  Import of "redux-form" is banned.',
    );
  });

  it('prints the file alone when the site has no line', () => {
    const { line: _line, column: _column, ...unlocated } = site;
    expect(formatViolation({ ...violation, site: unlocated }).split('\n')[0]).toBe('✖ forms: src/features/checkout/PaymentForm.tsx');
  });
});
