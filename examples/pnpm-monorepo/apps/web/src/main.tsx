import { createRoot } from 'react-dom/client';

import { Orders } from './pages/Orders';
import { Settings } from './pages/Settings';

const page = window.location.pathname.startsWith('/settings') ? <Settings /> : <Orders />;

createRoot(document.getElementById('root')!).render(page);
