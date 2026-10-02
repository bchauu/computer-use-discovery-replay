import type { ReactNode } from 'react';

export function Badge({ children, neutral = false }: { children: ReactNode; neutral?: boolean }) {
  return <span className={`badge ${neutral ? 'neutral' : ''}`}>{children}</span>;
}
