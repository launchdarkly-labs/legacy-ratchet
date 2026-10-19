import { relativeDay } from '@acme/legacy-utils/dates';
import { Button } from '@acme/ui';
import { format } from 'date-fns';
import ky from 'ky';

export function Settings() {
  const lastSaved = new Date();
  return (
    <section>
      <h1>Settings</h1>
      <p>
        Last saved {format(lastSaved, 'PPpp')} ({relativeDay(lastSaved)})
      </p>
      <Button onPress={() => void ky.post('/api/settings', { json: {} })}>Save</Button>
    </section>
  );
}
