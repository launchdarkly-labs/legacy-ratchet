export const EVERY_FORM_TS = `#!/usr/bin/env node
/** header */
import def, { a } from 'redux-form';
import * as ns from 'redux-form/immutable';
import type { T } from 'redux-form';
import { type A, type B } from 'redux-form';
import { type C, D } from 'redux-form';
import {} from 'redux-form';
import 'redux-form';
import eq = require('redux-form');
import type eqt = require('redux-form');
export import eqx = require('redux-form');
export * from 'redux-form';
export * as forms from 'redux-form';
export type * from 'redux-form';
export { x } from 'redux-form';
export type { Y } from 'redux-form';
export { type Z } from 'redux-form';
export {} from 'redux-form';
const r = require('redux-form');
const rt = require(\`redux-form\`);
const opt = require?.('redux-form');
const dyn = import('redux-form');
const dynt = import(\`redux-form\`);
const dynAttrs = import('redux-form', { with: { type: 'json' } });
async function lazy() {
  return (await import('moment')).default;
}
const nested = {
  // migration-tracker-disable-next-line forms -- nested call
  a: require('redux-form'),
  b: [require('moment'), require("request")],
};
function f() {
  const x = require(
    // migration-tracker-disable-line -- specifier line
    'redux-form'
  );
}
// not counted:
require.resolve('redux-form');
jest.mock('redux-form');
vi.mock('redux-form');
type TT = typeof import('redux-form');
const name = 'x';
import(name);
require(name);
require('redux-form', 2);
(require)('redux-form');
require(('redux-form'));
import(('redux-form'));
require(\`redux-\${name}\`);
foo.require('redux-form');
new require('redux-form');
declare module 'redux-form' {}
const s = "// migration-tracker-disable-next-line -- inside a string";
import('lodash');
// migration-tracker-disable-next-line forms,dates -- comma list
import { m1 } from 'moment';
// migration-tracker-disable-next-line forms dates
import { m2 } from 'moment';
/* migration-tracker-disable-next-line http -- block */
import req from 'request';
/**
 * migration-tracker-disable-next-line -- multi-line block ending right above
 */
import req2 from 'request';
/* migration-tracker-disable-next-line -- multi-line
   block, last line above */ import req3 from 'request';
import req4 from 'request'; // migration-tracker-disable-line http -- trailing
import req5 from 'request'; /* migration-tracker-disable-line */
// migration-tracker-disable-next-line -- next wins
import req6 from 'request'; // migration-tracker-disable-line other -- line loses
/// migration-tracker-disable-next-line -- triple slash
import req7 from 'request';
// migration-tracker-disable-next-lines -- not a directive
import req8 from 'request';
//migration-tracker-disable-next-line--no spaces
import req9 from 'request';
export {
  // migration-tracker-disable-line -- inside braces
  q,
} from 'redux-form';
`;

export const JSX_FILE = `import React from 'react';
import { reduxForm } from 'redux-form';
export function Form() {
  return (
    <div title="// migration-tracker-disable-next-line -- jsx attr">
      {/* migration-tracker-disable-next-line -- jsx comment */}
      {require('redux-form').x}
      text
      {require('moment').y}
    </div>
  );
}
const lazy = () => import('redux-form');
`;

export const PLAIN_JS = `'use strict';
const a = require('redux-form');
// migration-tracker-disable-next-line -- cjs
const b = require('moment');
module.exports = { a, b, c: () => import(\`request\`) };
`;

export const CRLF_BOM = `\uFEFFimport a from 'redux-form';\r\n// migration-tracker-disable-next-line -- crlf\r\nimport b from 'moment';\r\n`;
