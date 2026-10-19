export * from './dates';
export * from './http';

export function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}
