export function RuntimeFault({ scenario, onDismiss }: { scenario: string; onDismiss: () => void }) {
  if (scenario === 'permission-denied-on-history')
    return (
      <header className="page-heading">
        <div>
          <p className="eyebrow">Access control</p>
          <h1>Permission denied</h1>
          <p>Your employee role cannot access this account history.</p>
        </div>
      </header>
    );
  if (scenario === 'app-error-on-history')
    return (
      <header className="page-heading">
        <div>
          <p className="eyebrow">Application error</p>
          <h1>Application unavailable</h1>
          <p>The account-history service could not complete this request.</p>
        </div>
      </header>
    );
  if (scenario === 'unknown-dialog-on-history')
    return (
      <div className="runtime-dialog" role="dialog" aria-modal="true">
        <h2>Unexpected security message</h2>
        <p>This injected dialog has no approved automated recovery.</p>
        <button className="button" onClick={onDismiss}>
          Proceed anyway
        </button>
      </div>
    );
  if (scenario === 'known-notice-on-history')
    return (
      <div className="runtime-dialog" role="dialog" aria-modal="true">
        <h2>Scheduled maintenance notice</h2>
        <p>Posted history remains available during this synthetic notice.</p>
        <button className="button" onClick={onDismiss}>
          Dismiss notice
        </button>
      </div>
    );
  return null;
}
