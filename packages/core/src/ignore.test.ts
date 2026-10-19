import { describe, expect, it } from 'vitest';

import { isIgnoredPath } from './ignore.js';

describe('isIgnoredPath', () => {
  it('returns false with no patterns', () => {
    expect(isIgnoredPath({}, 'src/a.ts')).toBe(false);
  });

  it('matches config.ignore globs', () => {
    expect(isIgnoredPath({ ignore: ['**/generated/**'] }, 'src/generated/x.ts')).toBe(true);
    expect(isIgnoredPath({ ignore: ['**/generated/**'] }, 'src/x.ts')).toBe(false);
  });

  it('matches extra patterns and dotfiles', () => {
    expect(isIgnoredPath({}, '.storybook/main.ts', ['.storybook/**'])).toBe(true);
  });
});
