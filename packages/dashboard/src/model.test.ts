import { describe, expect, it } from 'vitest';

import { aggregateFiles, directoryOf, filterSites, formatRevision, inDirectory, siteOwners } from './model';
import { sampleSnapshot } from './sample-data';

describe('filterSites', () => {
  it('matches text against path and specifier case-insensitively', () => {
    const hits = filterSites(sampleSnapshot.sites, { text: 'LIB/FIELD', packageName: '' });
    expect(hits.map((s) => s.moduleSpecifier)).toEqual(['redux-form/lib/Field']);
  });

  it('filters on the module-system kind', () => {
    const hits = filterSites(sampleSnapshot.sites, { text: '', packageName: '', importKind: 'require' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((s) => s.importKind === 'require')).toBe(true);
  });

  it('filters on owner, falling back to the group owner for sites without owners', () => {
    const forms = sampleSnapshot.sites.filter((s) => s.groupId === 'forms');
    const fallback = filterSites(forms, { text: '', packageName: '', owner: '@acme/web-platform' }, '@acme/web-platform');
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback.every((s) => !s.owners)).toBe(true);
    const security = filterSites(forms, { text: '', packageName: '', owner: '@acme/security' });
    expect(security.every((s) => s.filePath.startsWith('src/features/admin/'))).toBe(true);
  });

  it('filters on directory prefix', () => {
    const hits = filterSites(sampleSnapshot.sites, { text: '', packageName: '', directory: 'server' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((s) => s.filePath.startsWith('server/'))).toBe(true);
  });
});

describe('directories', () => {
  it('uses the first two directory segments', () => {
    expect(directoryOf('static/ld/components/Button.tsx')).toBe('static/ld');
    expect(directoryOf('scripts/seed.js')).toBe('scripts');
    expect(directoryOf('index.ts')).toBe('.');
    expect(inDirectory('static/ld/a.ts', 'static/ld')).toBe(true);
    expect(inDirectory('static/ldx/a.ts', 'static/ld')).toBe(false);
    expect(inDirectory('index.ts', '.')).toBe(true);
    expect(inDirectory('src/index.ts', '.')).toBe(false);
  });
});

describe('siteOwners and aggregateFiles', () => {
  it('falls back to the given owner and aggregates per file', () => {
    expect(siteOwners({ owners: ['@a', '@b'] })).toEqual(['@a', '@b']);
    expect(siteOwners({ owners: [] }, '@team')).toEqual(['@team']);
    expect(siteOwners({})).toEqual(['Unowned']);
    const files = aggregateFiles(
      sampleSnapshot.sites.filter((s) => s.groupId === 'forms'),
      '@acme/web-platform',
    );
    expect(files[0]?.count).toBeGreaterThanOrEqual(files[files.length - 1]?.count ?? 0);
    expect(files.find((f) => f.filePath === 'src/features/admin/UserEditor.tsx')?.owners).toEqual([
      '@acme/identity',
      '@acme/security',
    ]);
  });
});

describe('formatRevision', () => {
  it('shortens commits and handles missing parts', () => {
    expect(formatRevision({ commit: 'abcdef1234', branch: 'main' })).toBe('abcdef1 on main');
    expect(formatRevision({ branch: 'feature' })).toBe('feature');
    expect(formatRevision({})).toBeUndefined();
    expect(formatRevision(undefined)).toBeUndefined();
  });
});
