import { getOrders } from '../../api/client';

export async function exportOrdersCsv(): Promise<string> {
  const [{ default: moment }, orders] = await Promise.all([import('moment'), getOrders()]);
  const rows = orders.map((order) =>
    [order.id, moment(order.placedAt).format('YYYY-MM-DD'), order.total.toFixed(2)].join(','),
  );
  return ['id,placed_at,total', ...rows].join('\n');
}
