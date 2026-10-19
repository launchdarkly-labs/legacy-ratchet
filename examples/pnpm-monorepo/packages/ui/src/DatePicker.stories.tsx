import moment from 'moment';

import { DatePicker } from './DatePicker';

export default { title: 'DatePicker', component: DatePicker };

export const LastWeek = () => <DatePicker value={moment().subtract(7, 'days').toDate()} onChange={() => {}} />;
