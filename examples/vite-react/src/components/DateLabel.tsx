import { format } from 'date-fns';
import type { Moment } from 'moment';

type DateLike = Date | Moment;

function toDate(value: DateLike): Date {
  return value instanceof Date ? value : value.toDate();
}

export function DateLabel({ value }: { value: DateLike }) {
  const date = toDate(value);
  return <time dateTime={date.toISOString()}>{format(date, 'PPP')}</time>;
}
