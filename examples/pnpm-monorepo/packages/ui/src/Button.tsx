import type { ReactNode } from 'react';

export function Button({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  );
}
