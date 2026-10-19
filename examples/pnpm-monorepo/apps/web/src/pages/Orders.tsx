import { formatMoney } from '@acme/legacy-utils';
import { DatePicker } from '@acme/ui';
import moment from 'moment';
import { useState } from 'react';

export function Orders() {
  const [from, setFrom] = useState(() => moment().subtract(30, 'days').toDate());
  return (
    <section>
      <h1>Orders since {moment(from).format('LL')}</h1>
      <DatePicker value={from} onChange={setFrom} />
      <p>Total: {formatMoney(1234.5)}</p>
    </section>
  );
}
