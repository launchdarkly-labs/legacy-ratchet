export interface View {
  groupId?: string;
  file?: string;
}

function decode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function parseHash(hash: string): View {
  const view: View = {};
  for (const part of hash.replace(/^#/, '').split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = part.slice(0, eq);
    const value = decode(part.slice(eq + 1));
    if (!value) {
      continue;
    }
    if (key === 'group') {
      view.groupId = value;
    } else if (key === 'file') {
      view.file = value;
    }
  }
  return view;
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(/%2F/g, '/');
}

export function formatHash(view: View): string {
  if (!view.groupId) {
    return '';
  }
  return `#group=${encode(view.groupId)}${view.file ? `&file=${encode(view.file)}` : ''}`;
}
