import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const DEPCRUISE_DIR = fileURLToPath(new URL('../../../depcruise/node_modules/dependency-cruiser/', import.meta.url));
export const DEPCRUISE_BIN = path.join(DEPCRUISE_DIR, 'bin', 'dependency-cruise.mjs');
export const EXAMPLES_DIR = fileURLToPath(new URL('../../../../examples/', import.meta.url));
export const PLUGIN_DIST = fileURLToPath(new URL('../../dist/depcruise-plugin.js', import.meta.url));

type CruiseModule = typeof import('dependency-cruiser');

export async function loadDepcruise(): Promise<CruiseModule> {
  return (await import(pathToFileURL(path.join(DEPCRUISE_DIR, 'src', 'main', 'index.mjs')).href)) as CruiseModule;
}
