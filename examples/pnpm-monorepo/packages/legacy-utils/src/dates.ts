import moment from 'moment';

export function relativeDay(value: Date): string {
  return moment(value).calendar();
}
