import ky from 'ky';

export const api = ky.create({
  prefixUrl: '/api',
  timeout: 10_000,
  retry: { limit: 2 },
});

export async function getOrders(): Promise<Array<{ id: string; placedAt: string; total: number }>> {
  return api.get('orders').json();
}
