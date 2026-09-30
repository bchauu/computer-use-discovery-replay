import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const [status, setStatus] = useState('Checking service…');
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Unavailable'); return response.json(); })
      .then(() => setStatus('Service connected'))
      .catch(() => { if (!controller.signal.aborted) setStatus('Service unavailable'); });
    return () => controller.abort();
  }, []);
  async function launch() {
    setLaunching(true); setLaunchResult('');
    try {
      const response = await fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const body = await response.json() as { modelConfigured?: boolean; code?: string };
      if (!response.ok) throw new Error(body.code || 'LAUNCH_FAILED');
      setLaunchResult(body.modelConfigured
        ? 'Workspace launched. Verify the synthetic customer in the new browser, then use its AI shortcut.'
        : 'Workspace launched, but discovery needs OPENAI_API_KEY before a run can start.');
    } catch { setLaunchResult('Could not launch the managed banking workspace. Check that the banking app and automation API are running.'); }
    finally { setLaunching(false); }
  }
  return <main>
    <p className="eyebrow">Computer-use automation · Discovery</p>
    <h1>Automation console</h1>
    <p className="description">Launch a managed browser session, verify a synthetic customer, and let the model discover a read-only transaction inquiry.</p>
    <section aria-label="Setup status"><h2>Development environment</h2>
      <p role="status">{status}</p>
      <button type="button" onClick={launch} disabled={launching || status !== 'Service connected'}>{launching ? 'Launching…' : 'Launch banking workspace'}</button>
      {launchResult && <p className="result" role="status">{launchResult}</p>}
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
