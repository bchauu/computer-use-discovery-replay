import { useEffect } from 'react';

export function SlowHistory({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onReady, 700);
    return () => window.clearTimeout(timer);
  }, [onReady]);
  return (
    <section className="panel runtime-state">
      <div className="runtime-loading" role="progressbar" aria-busy="true">
        Loading transaction history…
      </div>
    </section>
  );
}
