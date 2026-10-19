import { lazy, Suspense } from 'react';

import { DateLabel } from './components/DateLabel';
import { PaymentForm } from './features/checkout/PaymentForm';
import { ReportFilters } from './features/reports/ReportFilters';

const LegacyAddressForm = lazy(() => import('./legacy/checkout/LegacyAddressForm'));

export function App() {
  return (
    <main>
      <header>
        <h1>Acme Store</h1>
        <DateLabel value={new Date()} />
      </header>
      <PaymentForm onSubmit={(values) => console.log(values)} />
      <Suspense fallback={null}>
        <LegacyAddressForm />
      </Suspense>
      <ReportFilters />
    </main>
  );
}
