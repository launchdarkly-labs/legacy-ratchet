import { format, parseISO } from 'date-fns';
import type { MomentInput } from 'moment';

export function DatePicker({ value, onChange }: { value: Date | MomentInput; onChange: (next: Date) => void }) {
  const date = value instanceof Date ? value : new Date(String(value));
  return (
    <input
      type="date"
      value={format(date, 'yyyy-MM-dd')}
      onChange={(event) => onChange(parseISO(event.target.value))}
    />
  );
}
