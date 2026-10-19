import { describe, expect, it } from 'vitest';

import { parseSnapshotText } from '../data';
import { sampleSnapshot } from '../sample-data';
import { DATA_PLACEHOLDER, renderHtml } from './render.js';

const template = `<!doctype html><html><head><script type="module">console.log(1)</script></head><body><div id="root"></div><script id="migration-tracker-data" type="application/json">${DATA_PLACEHOLDER}</script></body></html>`;

function dataOf(html: string): string {
  const open = '<script id="migration-tracker-data" type="application/json">';
  const start = html.indexOf(open) + open.length;
  const end = html.indexOf('</script>', start);
  return html.slice(start, end);
}

describe('renderHtml', () => {
  it('embeds the snapshot with < escaped so the data cannot close the script element', () => {
    const hostile = {
      ...sampleSnapshot,
      groups: [
        {
          ...sampleSnapshot.groups[0]!,
          description: 'evil </script><script>alert(1)</script> <!-- comment --> $& $\' $` \u2028',
        },
      ],
    };
    const html = renderHtml(hostile, template);
    const data = dataOf(html);

    expect(html).not.toContain(DATA_PLACEHOLDER);
    expect(data).not.toContain('</script');
    expect(data).not.toContain('<!--');
    expect(data).not.toContain('<');
    expect(html.match(/<\/script>/g)).toHaveLength(2);

    const state = parseSnapshotText(data);
    expect(state.status).toBe('ready');
    expect(JSON.parse(data)).toEqual(JSON.parse(JSON.stringify(hostile)));
  });

  it('throws when the template has no placeholder', () => {
    expect(() => renderHtml(sampleSnapshot, '<html></html>')).toThrow(/placeholder/);
  });
});
