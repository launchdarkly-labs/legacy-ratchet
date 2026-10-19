import moment from 'moment';

export interface OrderDto {
  id: string;
  placedAt: moment.Moment;
  total: number;
}

export function decodeOrder(raw: { id: string; placedAt: string; total: number }): OrderDto {
  return { ...raw, placedAt: moment(raw.placedAt) };
}
