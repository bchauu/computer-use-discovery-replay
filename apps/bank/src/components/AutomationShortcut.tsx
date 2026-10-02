import { useAutomation } from '../hooks/useAutomation.ts';

export function AutomationShortcut() {
  const {
    sessionId,
    controlToken,
    goal,
    setGoal,
    status,
    runStatus,
    mode,
    step,
    handoffEpoch,
    employeePin,
    setEmployeePin,
    events,
    runDetails,
    running,
    navigating,
    start,
    cancel,
    claimControl,
    reauthenticate,
    proceedAndResume,
  } = useAutomation();
  if (!sessionId || !controlToken) return null;
  return (
    <aside
      className={`ai-shortcut${navigating ? ' navigating' : ''}`}
      aria-label="AI navigation shortcut"
    >
      <div className="ai-title">
        <span aria-hidden="true">✦</span>
        <div>
          <strong>AI navigation</strong>
          <small>{mode ? mode.replace('_', ' ') : 'Ready'} · Read-only</small>
        </div>
      </div>
      <form onSubmit={start}>
        <label htmlFor="automation-goal">What does the customer need?</label>
        <textarea
          id="automation-goal"
          required
          minLength={8}
          maxLength={500}
          disabled={running}
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="Show this member’s checking transactions for the last 7 days."
        />
        <button className="button primary" disabled={running} type="submit">
          {running ? 'Navigating…' : 'Start automation'}
        </button>
        {running && (
          <button className="button" type="button" onClick={cancel}>
            Cancel
          </button>
        )}
      </form>
      <div className="ai-status" role="status">
        <strong>{status}</strong>
        {mode && <span>{mode.replace('_', ' ')}</span>}
        {step > 0 && <span>Step {step}</span>}
      </div>
      {runStatus === 'awaiting_human' && handoffEpoch === null && (
        <button className="button handoff-button" type="button" onClick={claimControl}>
          Claim control
        </button>
      )}
      {runStatus === 'awaiting_human' &&
        handoffEpoch !== null &&
        runDetails.code === 'REAUTHENTICATION_REQUIRED' && (
          <form className="handoff-form" onSubmit={reauthenticate} autoComplete="off">
            <label htmlFor="relay-employee-pin">Employee PIN</label>
            <input
              id="relay-employee-pin"
              type="password"
              required
              value={employeePin}
              onChange={(event) => setEmployeePin(event.target.value)}
              autoComplete="off"
            />
            <button className="button primary" type="submit">
              Re-authenticate and resume
            </button>
          </form>
        )}
      {runStatus === 'awaiting_human' &&
        handoffEpoch !== null &&
        runDetails.code === 'HUMAN_DECISION_REQUIRED' && (
          <div className="handoff-form">
            <strong>Unknown dialog requires judgment</strong>
            <p>Automation cannot approve this action. Proceed explicitly or cancel the run.</p>
            <button className="button primary" type="button" onClick={proceedAndResume}>
              Proceed and resume
            </button>
            <button className="button" type="button" onClick={cancel}>
              Cancel run
            </button>
          </div>
        )}
      {runDetails.code && (
        <dl className="ai-result" aria-label="Run result">
          <div>
            <dt>Outcome</dt>
            <dd>
              {runDetails.category?.replace('_', ' ')} · {runDetails.code}
            </dd>
          </div>
          <div>
            <dt>Execution</dt>
            <dd>
              {mode?.replace('_', ' ')} · {runDetails.modelRequests} model request
              {runDetails.modelRequests === 1 ? '' : 's'}
            </dd>
          </div>
          {runDetails.artifactStatus && (
            <div>
              <dt>Capability</dt>
              <dd>{runDetails.artifactStatus}</dd>
            </div>
          )}
          {runDetails.transactionCount !== null && (
            <div>
              <dt>Output</dt>
              <dd>
                {runDetails.transactionCount} transaction
                {runDetails.transactionCount === 1 ? '' : 's'}
                {runDetails.accountLastFour ? ` · •••• ${runDetails.accountLastFour}` : ''}
              </dd>
            </div>
          )}
          {runDetails.diagnosticPhase && (
            <div>
              <dt>Diagnostic</dt>
              <dd>{runDetails.diagnosticPhase.replace('_', ' ')}</dd>
            </div>
          )}
        </dl>
      )}
      {events.length > 0 && (
        <ol className="ai-events">
          {events.map((item) => (
            <li key={item.sequence}>
              <span>{item.type.replace('_', ' ')}</span>
              <strong>{item.purpose || item.code}</strong>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
