import request from 'request';

export function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request(url, { json: true }, (error: unknown, _response: unknown, body: T) => {
      if (error) reject(error);
      else resolve(body);
    });
  });
}
