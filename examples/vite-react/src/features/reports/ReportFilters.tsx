import { useState } from 'react';
// migration-tracker-disable-next-line dates -- fiscal-week math needs moment's isoWeek parity until DATA-142 ships
import moment from 'moment';

import { exportOrdersCsv } from './exportCsv';

export function ReportFilters() {
  const [week, setWeek] = useState(() => moment().isoWeek());
  return (
    <section>
      <label>
        Fiscal week
        <input type="number" value={week} onChange={(event) => setWeek(Number(event.target.value))} />
      </label>
      <button type="button" onClick={() => void exportOrdersCsv()}>
        Export CSV
      </button>
    </section>
  );
}
