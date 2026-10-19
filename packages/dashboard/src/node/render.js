import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DATA_PLACEHOLDER = '__LEGACY_RATCHET_DATA__';

export function templatePath() {
  return fileURLToPath(new URL('../dist/index.html', import.meta.url));
}

export function serializeSnapshot(snapshot) {
  const json = JSON.stringify(snapshot);
  if (typeof json !== 'string') {
    throw new TypeError('legacy-ratchet dashboard: snapshot is not JSON-serializable');
  }
  return json.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function renderHtml(snapshot, template) {
  const html = template === undefined ? readFileSync(templatePath(), 'utf8') : template;
  const index = html.indexOf(DATA_PLACEHOLDER);
  if (index === -1) {
    throw new Error(
      `legacy-ratchet dashboard: template does not contain the ${DATA_PLACEHOLDER} placeholder`,
    );
  }
  return html.slice(0, index) + serializeSnapshot(snapshot) + html.slice(index + DATA_PLACEHOLDER.length);
}
