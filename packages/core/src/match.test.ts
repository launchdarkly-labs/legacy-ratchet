import { describe, expect, it } from 'vitest';
import { findGroup, matchPackage, packageNameOf } from './index.js';
import { config } from './__fixtures__/helpers.js';

describe('matchPackage', () => {
  it('matches exact names and subpaths', () => {
    expect(matchPackage('redux-form', ['redux-form'])).toBe('redux-form');
    expect(matchPackage('redux-form/immutable', ['redux-form'])).toBe('redux-form');
    expect(matchPackage('lodash/fp/map', ['lodash'])).toBe('lodash');
  });

  it('does not match on bare prefixes', () => {
    expect(matchPackage('redux-form-extra', ['redux-form'])).toBeUndefined();
    expect(matchPackage('redux', ['redux-form'])).toBeUndefined();
    expect(matchPackage('lodash.get', ['lodash'])).toBeUndefined();
  });

  it('handles scoped packages', () => {
    expect(matchPackage('@company/legacy-forms', ['@company/legacy-forms'])).toBe('@company/legacy-forms');
    expect(matchPackage('@company/legacy-forms/x', ['@company/legacy-forms'])).toBe('@company/legacy-forms');
    expect(matchPackage('@company/legacy-forms-v2', ['@company/legacy-forms'])).toBeUndefined();
    expect(matchPackage('@company/other', ['@company/legacy-forms'])).toBeUndefined();
  });

  it('never matches relative, absolute, node: or URL specifiers', () => {
    const pkgs = ['fs', 'redux-form', 'https', 'node'];
    for (const spec of ['./redux-form', '../redux-form', '/redux-form', 'node:fs', 'https://cdn/redux-form', 'file:///x', '.', '..', '']) {
      expect(matchPackage(spec, pkgs)).toBeUndefined();
    }
  });

  it('prefers the longest match', () => {
    expect(matchPackage('a/b/c', ['a', 'a/b'])).toBe('a/b');
    expect(matchPackage('a/b/c', ['a/b', 'a'])).toBe('a/b');
    expect(matchPackage('a/x', ['a/b', 'a'])).toBe('a');
  });

  it('returns undefined for an empty package list', () => {
    expect(matchPackage('x', [])).toBeUndefined();
  });
});

describe('packageNameOf', () => {
  it('extracts package names', () => {
    expect(packageNameOf('@a/b/c')).toBe('@a/b');
    expect(packageNameOf('@a/b')).toBe('@a/b');
    expect(packageNameOf('lodash/fp')).toBe('lodash');
    expect(packageNameOf('lodash')).toBe('lodash');
  });

  it('returns undefined for non-package specifiers', () => {
    for (const spec of ['./x', '../x', '/abs/x', 'node:fs', 'https://esm.sh/react', 'data:text/javascript,1', '@scope', '#internal', '']) {
      expect(packageNameOf(spec)).toBeUndefined();
    }
  });
});

describe('findGroup', () => {
  const cfg = config({
    version: 1,
    groups: {
      forms: { old: ['redux-form', '@company/legacy-forms'], new: ['react-hook-form'] },
      dates: { old: ['moment'] },
    },
  });

  it('returns the group and the configured package name', () => {
    expect(findGroup(cfg, 'redux-form/immutable')).toEqual({ groupId: 'forms', packageName: 'redux-form' });
    expect(findGroup(cfg, '@company/legacy-forms/x')).toEqual({ groupId: 'forms', packageName: '@company/legacy-forms' });
    expect(findGroup(cfg, 'moment')).toEqual({ groupId: 'dates', packageName: 'moment' });
  });

  it('returns undefined for unmatched or replacement packages', () => {
    expect(findGroup(cfg, 'react-hook-form')).toBeUndefined();
    expect(findGroup(cfg, 'moment-timezone')).toBeUndefined();
    expect(findGroup(cfg, './moment')).toBeUndefined();
  });
});
