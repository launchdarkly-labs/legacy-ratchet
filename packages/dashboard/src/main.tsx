import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { type LoadState, readSnapshot } from './data';
import './styles.css';

async function resolveState(): Promise<LoadState> {
  const state = readSnapshot(document);
  if (import.meta.env.DEV && state.status !== 'ready') {
    const { sampleSnapshot } = await import('./sample-data');
    return { status: 'ready', snapshot: sampleSnapshot, sample: true };
  }
  return state;
}

const root = document.getElementById('root');
if (root) {
  void resolveState().then((state) => {
    createRoot(root).render(
      <StrictMode>
        <App state={state} />
      </StrictMode>,
    );
  });
}
