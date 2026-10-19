import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkgDir = fileURLToPath(new URL('..', import.meta.url));
const placeholder = '__MIGRATION_TRACKER_DATA__';
const template = `${pkgDir}dist/index.html`;

if (!existsSync(template)) {
  console.error(`build-node: ${template} is missing; run vite build first`);
  process.exit(1);
}

const html = readFileSync(template, 'utf8');
const occurrences = html.split(placeholder).length - 1;
if (occurrences !== 1) {
  console.error(`build-node: expected exactly one ${placeholder} in dist/index.html, found ${occurrences}`);
  process.exit(1);
}
if (/<script[^>]+src=|<link[^>]+rel="stylesheet"/i.test(html)) {
  console.error('build-node: dist/index.html references external assets; expected a single inlined file');
  process.exit(1);
}

mkdirSync(`${pkgDir}dist-node`, { recursive: true });
copyFileSync(`${pkgDir}src/node/render.js`, `${pkgDir}dist-node/index.js`);
copyFileSync(`${pkgDir}src/node/render.d.ts`, `${pkgDir}dist-node/index.d.ts`);
console.log('build-node: wrote dist-node/index.js and dist-node/index.d.ts');
