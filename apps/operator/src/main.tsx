import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type RunMode = 'discovery' | 'validation_replay' | 'replay';
type RunStatus = 'created' | 'running' | 'awaiting_human' | 'succeeded' | 'failed' | 'cancelled';
interface RunSummary {
  runId: string; mode: RunMode; status: RunStatus; goalSummary: string; memberName: string;
  startedAt: string; finishedAt: string | null; durationMs: number | null;
  category: string | null; resultCode: string | null; modelRequestCount: number;
  inputTokens: number; outputTokens: number; retryCount: number; recoveryCount: number;
  handoffCount: number; eventCount: number;
  artifact: { artifactId: string; artifactVersion: number; status: string } | null;
}
interface EventItem {
  eventId: string; sequence: number; timestamp: string; type: string; step: number; attempt: number;
  durationMs: number | null; code: string; actionKind: string | null; purpose: string | null;
  model: string | null; inputTokens: number | null; outputTokens: number | null;
}
interface RunDetail {
  runId: string; mode: RunMode; status: RunStatus; goalSummary: string; startedAt: string; finishedAt: string | null;
  maxSteps: number; step: number; inputs: { accountType: string; period: string }; criteria: { memberName: string };
  result: { category: string; code: string; message: string; output: { account: { accountType: string; accountLastFour: string }; transactions: unknown[] } | null; diagnostic: { phase: string; stepId: string | null; recovery: { reason: string }; observed: { route: string; headings: string[] }; evidenceRef: string } | null } | null;
  artifact: { artifactId: string; artifactVersion: number; status: string; path: string | null } | null;
  events: EventItem[];
}
interface Capability {
  artifactId: string; artifactVersion: number; status: string; description: string;
  steps: Array<{ id: string; action: { kind: string }; target: { strategy: string; role?: string; name?: string } | null; checkpoint: { routeTemplate: string; requiredHeadings: string[] } }>;
  source: { testedModel: string; runId: string };
}

const modeLabel: Record<RunMode, string> = { discovery: 'LLM discovery', validation_replay: 'Validation replay', replay: 'Deterministic replay' };
const phaseLabel: Record<string, string> = {
  run_started: 'Start', observation: 'Observe', model_request: 'Decide', model_response: 'Decision', retry: 'Retry',
  policy: 'Policy', action: 'Act', evidence: 'Evidence', artifact: 'Capability', validation: 'Verify', handoff: 'Handoff', run_finished: 'Finish',
};
function time(value: string) { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(value)); }
function duration(value: number | null) { return value === null ? 'In progress' : value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`; }
function words(value: string | null | undefined) { return value ? value.toLowerCase().replaceAll('_', ' ') : '—'; }
function summarize(detail: RunDetail | null) {
  if (!detail) return null;
  return {
    modelCalls: detail.events.filter(event => event.type === 'model_request').length,
    inputTokens: detail.events.reduce((sum, event) => sum + (event.inputTokens ?? 0), 0),
    outputTokens: detail.events.reduce((sum, event) => sum + (event.outputTokens ?? 0), 0),
    retries: detail.events.filter(event => event.type === 'retry').length,
    handoffs: detail.events.filter(event => event.type === 'handoff').length,
  };
}

function App() {
  const [health, setHealth] = useState('Checking service');
  const [persistence, setPersistence] = useState('unknown');
  const [tokenInput, setTokenInput] = useState('');
  const [operatorToken, setOperatorToken] = useState(() => window.sessionStorage.getItem('operatorAccessToken') ?? '');
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<RunDetail | null>(null);
  const [comparison, setComparison] = useState<{ discovery: RunDetail | null; replay: RunDetail | null }>({ discovery: null, replay: null });
  const [capability, setCapability] = useState<Capability | null>(null);
  const [error, setError] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState('');

  const headers = useMemo(() => operatorToken ? { 'x-operator-token': operatorToken } : {}, [operatorToken]);
  useEffect(() => {
    Promise.all([fetch('/api/health'), fetch('/api/operator/status')])
      .then(async ([service, storage]) => {
        if (!service.ok || !storage.ok) throw new Error('Unavailable');
        const state = await storage.json() as { persistence: string };
        setHealth('Connected'); setPersistence(state.persistence);
      })
      .catch(() => setHealth('Unavailable'));
  }, []);

  const loadDetail = useCallback(async (runId: string, requestHeaders = headers) => {
    const response = await fetch(`/api/operator/runs/${runId}`, { headers: requestHeaders });
    if (!response.ok) throw new Error((await response.json() as { code?: string }).code || 'RUN_LOAD_FAILED');
    return await response.json() as RunDetail;
  }, [headers]);

  const refresh = useCallback(async (requestHeaders = headers) => {
    if (!operatorToken && !('x-operator-token' in requestHeaders)) return;
    const response = await fetch('/api/operator/runs?limit=50', { headers: requestHeaders });
    if (!response.ok) throw new Error((await response.json() as { code?: string }).code || 'RUN_HISTORY_FAILED');
    const body = await response.json() as { runs: RunSummary[] };
    setRuns(body.runs);
    const nextId = selectedId && body.runs.some(run => run.runId === selectedId) ? selectedId : body.runs[0]?.runId ?? null;
    setSelectedId(nextId);
    const discoverySummary = body.runs.find(run => run.mode === 'discovery' && run.status === 'succeeded');
    const replaySummary = body.runs.find(run => run.mode === 'replay' && run.status === 'succeeded');
    const [discovery, replay] = await Promise.all([
      discoverySummary ? loadDetail(discoverySummary.runId, requestHeaders) : Promise.resolve(null),
      replaySummary ? loadDetail(replaySummary.runId, requestHeaders) : Promise.resolve(null),
    ]);
    setComparison({ discovery, replay }); setError('');
  }, [headers, loadDetail, operatorToken, selectedId]);

  useEffect(() => { if (operatorToken) void refresh().catch(reason => setError(reason instanceof Error ? reason.message : 'RUN_HISTORY_FAILED')); }, [operatorToken]);
  useEffect(() => {
    if (!selectedId || !operatorToken) { setSelected(null); return; }
    void loadDetail(selectedId).then(async detail => {
      setSelected(detail);
      if (detail.artifact) {
        const response = await fetch(`/api/operator/capabilities/${detail.artifact.artifactId}`, { headers });
        if (response.ok) setCapability(await response.json() as Capability);
      }
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'RUN_LOAD_FAILED'));
  }, [headers, loadDetail, operatorToken, selectedId]);

  function connect(event: React.FormEvent) {
    event.preventDefault(); const value = tokenInput.trim(); if (!value) return;
    window.sessionStorage.setItem('operatorAccessToken', value); setOperatorToken(value); setTokenInput('');
  }
  function disconnect() { window.sessionStorage.removeItem('operatorAccessToken'); setOperatorToken(''); setRuns([]); setSelected(null); }
  async function launch() {
    setLaunching(true); setLaunchResult('');
    try {
      const response = await fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const body = await response.json() as { modelConfigured?: boolean; code?: string };
      if (!response.ok) throw new Error(body.code || 'LAUNCH_FAILED');
      setLaunchResult(body.modelConfigured ? 'Managed banking workspace launched.' : 'Workspace launched for replay; live discovery requires an OpenAI key.');
    } catch { setLaunchResult('Could not launch the workspace. Confirm that the banking UI and automation service are running.'); }
    finally { setLaunching(false); }
  }

  const selectedStats = summarize(selected);
  const discoveryStats = summarize(comparison.discovery);
  const replayStats = summarize(comparison.replay);
  return <div className="app-shell">
    <aside className="rail"><div className="logo"><span>IU</span><div>INTERFACE<small>Automation lab</small></div></div><nav><a href="#overview" className="active">Overview</a><a href="#runs">Run history</a><a href="#capability">Capability</a></nav><div className="rail-status"><span className={health === 'Connected' ? 'online' : 'offline'}/><strong>{health}</strong><small>MongoDB {persistence}</small></div></aside>
    <main>
      <header className="hero" id="overview"><div><p className="eyebrow">Computer-use automation system</p><h1>Discover once.<br/><span>Replay with proof.</span></h1><p>LLM-directed UI discovery becomes a typed capability with deterministic execution, explicit runtime outcomes, and same-session human control.</p></div><div className="hero-actions"><button onClick={launch} disabled={launching || health !== 'Connected'}>{launching ? 'Launching…' : 'Launch workspace'}</button><a href="#runs">Inspect evidence</a>{launchResult && <small>{launchResult}</small>}</div></header>
      {!operatorToken ? <section className="access-card"><div><p className="eyebrow">Protected evidence</p><h2>Connect the persisted run inspector</h2><p>The token stays in this browser tab and is sent only to the local automation service.</p></div><form onSubmit={connect}><label htmlFor="operator-token">Operator access token</label><div><input id="operator-token" type="password" value={tokenInput} onChange={event => setTokenInput(event.target.value)} autoComplete="off"/><button>Connect</button></div></form></section> : <>
        <section className="proof-grid" aria-label="Verified system properties"><article><span>01</span><strong>Genuine discovery</strong><p>One typed model action per observed UI state.</p></article><article><span>02</span><strong>Model-free replay</strong><p>Saved capability executes with zero model decisions.</p></article><article><span>03</span><strong>Human control</strong><p>Ownership transfers on the same live browser session.</p></article><article><span>04</span><strong>Persisted evidence</strong><p>Schema-validated runs survive process restarts.</p></article></section>
        <section className="comparison" aria-label="Discovery and replay comparison"><div className="section-title"><div><p className="eyebrow">Execution comparison</p><h2>The model discovers. The capability replays.</h2></div><button className="secondary" onClick={() => void refresh().catch(reason => setError(reason instanceof Error ? reason.message : 'REFRESH_FAILED'))}>Refresh</button></div><div className="compare-grid"><article className="compare-card discovery"><div className="compare-heading"><span>Discovery</span><b>{comparison.discovery?.status ?? 'Unavailable'}</b></div><h3>{comparison.discovery?.goalSummary ?? 'No persisted discovery'}</h3><dl><div><dt>Model decisions</dt><dd>{discoveryStats?.modelCalls ?? '—'}</dd></div><div><dt>Executed steps</dt><dd>{comparison.discovery?.step ?? '—'}</dd></div><div><dt>Tokens</dt><dd>{discoveryStats ? discoveryStats.inputTokens + discoveryStats.outputTokens : '—'}</dd></div><div><dt>Capability</dt><dd>{comparison.discovery?.artifact?.status ?? '—'}</dd></div></dl></article><div className="compile-arrow"><span>Compiled capability</span><b>→</b></div><article className="compare-card replay"><div className="compare-heading"><span>Replay</span><b>{comparison.replay?.status ?? 'Unavailable'}</b></div><h3>{comparison.replay?.goalSummary ?? 'No persisted replay'}</h3><dl><div><dt>Model decisions</dt><dd>{replayStats?.modelCalls ?? '—'}</dd></div><div><dt>Executed steps</dt><dd>{comparison.replay?.step ?? '—'}</dd></div><div><dt>Transactions</dt><dd>{comparison.replay?.result?.output?.transactions.length ?? '—'}</dd></div><div><dt>Capability</dt><dd>{comparison.replay?.artifact?.status ?? '—'}</dd></div></dl></article></div></section>
        <section className="workspace" id="runs"><aside className="run-list"><div className="list-heading"><div><p className="eyebrow">Persisted telemetry</p><h2>Run history</h2></div><button className="text-button" onClick={disconnect}>Lock</button></div>{error && <p className="error">{words(error)}</p>}{runs.map(run => <button key={run.runId} className={run.runId === selectedId ? 'run-row selected' : 'run-row'} onClick={() => setSelectedId(run.runId)}><span className={`mode-dot ${run.mode}`}/><div><strong>{modeLabel[run.mode]}</strong><small>{run.memberName} · {time(run.startedAt)}</small></div><b className={`status ${run.status}`}>{words(run.status)}</b></button>)}</aside><div className="run-detail">{selected ? <><div className="detail-heading"><div><p className="eyebrow">{modeLabel[selected.mode]}</p><h2>{selected.goalSummary}</h2><p>{selected.result?.message ?? 'Execution is still in progress.'}</p></div><div className={`result-mark ${selected.status}`}><span>{words(selected.result?.category ?? selected.status)}</span><strong>{selected.result?.code ?? selected.status}</strong></div></div><div className="metric-grid"><div><span>Model calls</span><strong>{selectedStats?.modelCalls}</strong></div><div><span>Current step</span><strong>{selected.step}/{selected.maxSteps}</strong></div><div><span>Retries</span><strong>{selectedStats?.retries}</strong></div><div><span>Handoff events</span><strong>{selectedStats?.handoffs}</strong></div><div><span>Input tokens</span><strong>{selectedStats?.inputTokens.toLocaleString()}</strong></div><div><span>Output</span><strong>{selected.result?.output ? `${selected.result.output.transactions.length} txns` : words(selected.result?.category)}</strong></div></div>{selected.result?.diagnostic && <article className="diagnostic"><p className="eyebrow">Failure diagnostic</p><h3>{words(selected.result.diagnostic.phase)} · {selected.result.diagnostic.stepId ?? 'run level'}</h3><p>{selected.result.diagnostic.recovery.reason}</p><code>{selected.result.diagnostic.observed.route}</code></article>}<div className="timeline-heading"><h3>Execution timeline</h3><span>{selected.events.length} structured events</span></div><ol className="timeline">{selected.events.map(event => <li key={event.eventId}><div className={`event-icon ${event.type}`}>{event.sequence}</div><div><div className="event-meta"><span>{phaseLabel[event.type] ?? words(event.type)}</span><time>{time(event.timestamp)}</time></div><strong>{event.purpose ?? words(event.code)}</strong><small>Step {event.step}{event.actionKind ? ` · ${event.actionKind}` : ''}{event.durationMs !== null ? ` · ${duration(event.durationMs)}` : ''}</small></div></li>)}</ol></> : <div className="empty-state"><strong>Select a run</strong><p>Choose persisted evidence to inspect its decisions, actions, checkpoints, and outcome.</p></div>}</div></section>
        {capability && <section className="capability" id="capability"><div className="section-title"><div><p className="eyebrow">Reusable capability</p><h2>{capability.artifactId} <span>v{capability.artifactVersion}</span></h2><p>{capability.description}</p></div><div className="capability-status"><span>{capability.status}</span><small>Tested with {capability.source.testedModel}</small></div></div><div className="capability-steps">{capability.steps.map((step, index) => <article key={step.id}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{step.id}</strong><p>{step.action.kind} · {step.target?.strategy ?? 'page action'}</p><small>{step.checkpoint.routeTemplate}</small></div></article>)}</div></section>}
      </>}
      <footer><span>Northline uses fictional members and accounts.</span><span>Raw HTML, credentials, and sensitive input values are excluded from evidence.</span></footer>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
