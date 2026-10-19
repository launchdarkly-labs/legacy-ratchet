import { format, formatDistanceToNow } from 'date-fns';
import moment from 'moment';

export function formatOrderDate(value: Date): string {
  return format(value, 'MMM d, yyyy');
}

export function timeAgo(value: Date): string {
  return formatDistanceToNow(value, { addSuffix: true });
}

export function parseLegacyTimestamp(value: string): Date {
  return moment(value, 'DD/MM/YYYY HH:mm').toDate();
}
