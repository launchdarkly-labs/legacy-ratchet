import { describe, expect, it } from 'vitest';
import { scanSource } from './index.js';

const sup = (code: string, file = 'a.ts') => scanSource(code, file).map((i) => [i.moduleSpecifier, i.suppression]);

describe('inline suppressions', () => {
  it('next-line with groupIds and reason', () => {
    const code = "// migration-tracker-disable-next-line forms -- migrating in REL-1\nimport { reduxForm } from 'redux-form';";
    expect(sup(code)).toEqual([['redux-form', { groupIds: ['forms'], reason: 'migrating in REL-1' }]]);
  });

  it('next-line with multiple comma-separated groupIds (spaces tolerated)', () => {
    const code = "// migration-tracker-disable-next-line forms, dates,http -- why\nimport m from 'moment';";
    expect(sup(code)).toEqual([['moment', { groupIds: ['forms', 'dates', 'http'], reason: 'why' }]]);
  });

  it('next-line without groupIds means all groups', () => {
    const code = "// migration-tracker-disable-next-line -- legacy page\nimport m from 'moment';";
    expect(sup(code)).toEqual([['moment', { groupIds: [], reason: 'legacy page' }]]);
  });

  it('missing reason yields empty reason', () => {
    expect(sup("// migration-tracker-disable-next-line forms\nimport m from 'm';")).toEqual([
      ['m', { groupIds: ['forms'], reason: '' }],
    ]);
    expect(sup("// migration-tracker-disable-next-line\nimport m from 'm';")).toEqual([['m', { groupIds: [], reason: '' }]]);
    expect(sup("// migration-tracker-disable-next-line forms --   \nimport m from 'm';")).toEqual([
      ['m', { groupIds: ['forms'], reason: '' }],
    ]);
  });

  it('reason may contain further -- sequences', () => {
    const code = "// migration-tracker-disable-next-line a -- see foo -- bar\nimport m from 'm';";
    expect(sup(code)).toEqual([['m', { groupIds: ['a'], reason: 'see foo -- bar' }]]);
  });

  it('allows "--" with no surrounding space', () => {
    const code = "// migration-tracker-disable-next-line--reason here\nimport m from 'm';";
    expect(sup(code)).toEqual([['m', { groupIds: [], reason: 'reason here' }]]);
  });

  it('same-line trailing comment', () => {
    const code = "import m from 'moment'; // migration-tracker-disable-line dates -- tz math\nimport n from 'n';";
    expect(sup(code)).toEqual([
      ['moment', { groupIds: ['dates'], reason: 'tz math' }],
      ['n', undefined],
    ]);
  });

  it('same-line without groupIds or reason', () => {
    expect(sup("const m = require('m'); // migration-tracker-disable-line", 'a.js')).toEqual([
      ['m', { groupIds: [], reason: '' }],
    ]);
  });

  it('block comments work for both forms', () => {
    const code = [
      "/* migration-tracker-disable-next-line forms -- block */",
      "import a from 'a';",
      "import b from 'b'; /* migration-tracker-disable-line -- trailing block */",
      '/**',
      ' * migration-tracker-disable-next-line x,y -- multi',
      ' * line block',
      ' */',
      "import c from 'c';",
    ].join('\n');
    expect(sup(code)).toEqual([
      ['a', { groupIds: ['forms'], reason: 'block' }],
      ['b', { groupIds: [], reason: 'trailing block' }],
      ['c', { groupIds: ['x', 'y'], reason: 'multi line block' }],
    ]);
  });

  it('a leading block comment on the same line suppresses with disable-line', () => {
    expect(sup("/* migration-tracker-disable-line -- ok */ import a from 'a';")).toEqual([
      ['a', { groupIds: [], reason: 'ok' }],
    ]);
  });

  it('next-line only applies to the immediately following line', () => {
    const code = ["// migration-tracker-disable-next-line -- gap", '', "import a from 'a';"].join('\n');
    expect(sup(code)).toEqual([['a', undefined]]);
  });

  it('next-line does not apply to the line after the next', () => {
    const code = ["// migration-tracker-disable-next-line -- one", "import a from 'a';", "import b from 'b';"].join('\n');
    expect(sup(code)).toEqual([
      ['a', { groupIds: [], reason: 'one' }],
      ['b', undefined],
    ]);
  });

  it('next-line anchors on the statement start for multi-line imports', () => {
    const code = [
      '// migration-tracker-disable-next-line -- multi',
      'import {',
      '  a,',
      '  b,',
      "} from 'm';",
      'export {',
      '  c,',
      "} from 'n';",
    ].join('\n');
    expect(sup(code)).toEqual([
      ['m', { groupIds: [], reason: 'multi' }],
      ['n', undefined],
    ]);
  });

  it('disable-line matches the specifier line of a multi-line import too', () => {
    const code = ['import {', '  a,', "} from 'm'; // migration-tracker-disable-line -- tail"].join('\n');
    expect(sup(code)).toEqual([['m', { groupIds: [], reason: 'tail' }]]);
  });

  it('next-line anchors on the require/import() call start, including nested', () => {
    const code = [
      'function f() {',
      '  // migration-tracker-disable-next-line http -- legacy client',
      "  const r = require('request');",
      '  return () =>',
      '    // migration-tracker-disable-next-line -- lazy',
      "    import('old');",
      '}',
    ].join('\n');
    expect(sup(code, 'a.js')).toEqual([
      ['request', { groupIds: ['http'], reason: 'legacy client' }],
      ['old', { groupIds: [], reason: 'lazy' }],
    ]);
  });

  it('works inside JSX via expression-container comments', () => {
    const code = [
      'export const C = () => (',
      '  <div>',
      '    {/* migration-tracker-disable-next-line ui -- jsx */}',
      "    {require('old-ui').el}",
      '  </div>',
      ');',
    ].join('\n');
    expect(sup(code, 'C.jsx')).toEqual([['old-ui', { groupIds: ['ui'], reason: 'jsx' }]]);
  });

  it('ignores directive text inside strings and unrelated comments', () => {
    const code = [
      "const s = '// migration-tracker-disable-next-line -- nope';",
      "import a from 'a';",
      '// some migration-tracker-disable-next-line -- not at start',
      "import b from 'b';",
      '// migration-tracker-disable-next-lines -- typo',
      "import c from 'c';",
      '// eslint-disable-next-line',
      "import d from 'd';",
    ].join('\n');
    expect(sup(code)).toEqual([
      ['a', undefined],
      ['b', undefined],
      ['c', undefined],
      ['d', undefined],
    ]);
  });

  it('a disable-line comment does not affect the next line', () => {
    const code = ["import a from 'a'; // migration-tracker-disable-line -- a only", "import b from 'b';"].join('\n');
    expect(sup(code)).toEqual([
      ['a', { groupIds: [], reason: 'a only' }],
      ['b', undefined],
    ]);
  });

  it('next-line wins over a same-line directive', () => {
    const code = [
      '// migration-tracker-disable-next-line above -- above',
      "import a from 'a'; // migration-tracker-disable-line same -- same",
    ].join('\n');
    expect(sup(code)).toEqual([['a', { groupIds: ['above'], reason: 'above' }]]);
  });

  it('applies to every import on the suppressed line', () => {
    const code = "// migration-tracker-disable-next-line -- both\nconst a = require('a'), b = require('b');";
    expect(sup(code, 'a.js')).toEqual([
      ['a', { groupIds: [], reason: 'both' }],
      ['b', { groupIds: [], reason: 'both' }],
    ]);
  });

  it('returns independent suppression objects per import', () => {
    const code = "// migration-tracker-disable-next-line g -- r\nconst a = require('a'), b = require('b');";
    const [a, b] = scanSource(code, 'a.js');
    expect(a!.suppression).not.toBe(b!.suppression);
  });

  it('works at the very top of a file and after a shebang', () => {
    const code = "#!/usr/bin/env node\n// migration-tracker-disable-next-line -- cli\nconst a = require('a');";
    expect(sup(code, 'a.cjs')).toEqual([['a', { groupIds: [], reason: 'cli' }]]);
  });
});

describe('inline suppressions in odd trivia positions', () => {
  it('finds a block comment before a node on the same line inside a call', () => {
    expect(sup("f(/* migration-tracker-disable-line -- arg */ require('a'));", 'a.js')).toEqual([
      ['a', { groupIds: [], reason: 'arg' }],
    ]);
  });

  it('finds a comment at the end of the file without affecting anything', () => {
    expect(sup("import a from 'a';\n// migration-tracker-disable-next-line -- eof")).toEqual([['a', undefined]]);
  });
});
