import { describe, expect, it } from 'vitest';

import { formatHash, parseHash } from './route';

describe('route hash', () => {
  it('round-trips group and file', () => {
    const hash = formatHash({ groupId: 'my group', file: 'src/a&b.ts' });
    expect(hash).toBe('#group=my%20group&file=src/a%26b.ts');
    expect(parseHash(hash)).toEqual({ groupId: 'my group', file: 'src/a&b.ts' });
  });

  it('ignores files without a group and malformed values', () => {
    expect(formatHash({ file: 'a.ts' })).toBe('');
    expect(parseHash('#group=%E0%A4%A&file=x')).toEqual({ file: 'x' });
    expect(parseHash('')).toEqual({});
    expect(parseHash('#group=forms')).toEqual({ groupId: 'forms' });
  });
});
