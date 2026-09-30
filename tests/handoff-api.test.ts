import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { configureAutomation } from '../src/automation/server.ts';
import { capabilityArtifactSchema } from '../src/contracts/capability.ts';
import { newId } from '../src/contracts/discovery.ts';
import { SessionRegistry } from '../src/discovery/sessions.ts';
import type { LiveSession } from '../src/discovery/sessions.ts';
import { createApp } from '../src/shared/http.ts';

const html = `<!doctype html><html><body><main id="app"></main><script>
let authenticated=false; const member='<div class="member-strip"><strong>Alex Morgan</strong><span>Member #12345</span></div>';
function render(){const route=location.hash.slice(1);if(route==='/transactions')app.innerHTML=member+'<h1>Transaction inquiry</h1><table><tbody><tr><td>Everyday Checking</td><td><a href="#/members/12345/accounts/a101/history">View history</a></td></tr></tbody></table>';else if(route.includes('/history')&&!authenticated){app.innerHTML='<h1>Employee session expired</h1><form id="reauth"><label for="pin">Employee PIN</label><input id="pin" type="password"><button>Re-authenticate</button></form>';reauth.onsubmit=e=>{e.preventDefault();if(pin.value==='2468'){authenticated=true;render()}}}else if(route.includes('/history'))app.innerHTML=member+'<p class="eyebrow">Account services / Checking</p><h1>Everyday Checking •••• 4821</h1><h2>Posted transaction history</h2><label for="period">History period</label><select id="period"><option value="30">Last 30 days</option><option value="14">Last 14 days</option><option value="7">Last 7 days</option><option value="latest">Latest posted transaction</option></select><table><tbody><tr><td>Sep 28, 2026</td><td><strong>Payroll</strong><small>TX-100001</small></td><td>Posted</td><td>—</td><td>$2,450.00</td></tr></tbody></table>';else app.innerHTML=member+'<h1>Member overview</h1><a href="#/transactions">Transactions</a>'}addEventListener('hashchange',render);render();
</script></body></html>`;

test('HTTP handoff API enforces token, single ownership, epoch fencing, checkpoint resume, and late-command rejection', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route('http://app.local/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  const page = await context.newPage(); await page.goto('http://app.local/#/members/12345');
  const database = mongoose.createConnection();
  const catalogDirectory = await mkdtemp(path.join(tmpdir(), 'api-catalog-'));
  const registry = new SessionRegistry();
  const session: LiveSession = {
    sessionId: newId(), controlToken: 'api-control-token', browser, context, page,
    owner: 'human', epoch: 1, activeRunId: null, createdAt: new Date().toISOString(), allowedOrigin: 'http://app.local',
  };
  registry.attach(session);
  let configured!: ReturnType<typeof configureAutomation>;
  const app = createApp('automation', database, instance => { configured = configureAutomation(instance, database, { sessionRegistry: registry, decisionClient: null, catalogDirectory }); });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  let runId: string | null = null;
  try {
    const artifact = capabilityArtifactSchema.parse(JSON.parse(await readFile(path.resolve('evidence/capability.json'), 'utf8')));
    await configured.catalog.register(artifact);
    const headers = { 'content-type': 'application/json', 'x-control-token': session.controlToken };
    const started = await fetch(`${origin}/api/runs`, { method: 'POST', headers, body: JSON.stringify({ sessionId: session.sessionId, goal: 'Show checking transactions for the last 7 days.' }) });
    assert.equal(started.status, 202); runId = (await started.json() as { runId: string }).runId;
    const deadline = Date.now() + 10_000;
    let run: { status: string; result?: { code?: string } } = { status: 'running' };
    while (run.status !== 'awaiting_human' && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 20)); run = await (await fetch(`${origin}/api/runs/${runId}`, { headers })).json(); }
    assert.equal(run.result?.code, 'REAUTHENTICATION_REQUIRED');
    assert.equal((await fetch(`${origin}/api/runs/${runId}/handoff/claim`, { method: 'POST' })).status, 404);
    const claimedResponse = await fetch(`${origin}/api/runs/${runId}/handoff/claim`, { method: 'POST', headers });
    assert.equal(claimedResponse.status, 200); const claimed = await claimedResponse.json() as { epoch: number };
    assert.equal((await fetch(`${origin}/api/runs/${runId}/handoff/claim`, { method: 'POST', headers })).status, 409);
    assert.equal((await fetch(`${origin}/api/runs/${runId}/handoff/resume`, { method: 'POST', headers, body: JSON.stringify({ expectedEpoch: claimed.epoch }) })).status, 422);
    assert.equal((await fetch(`${origin}/api/runs/${runId}/handoff/actions`, { method: 'POST', headers, body: JSON.stringify({ expectedEpoch: claimed.epoch - 1, kind: 'fill', label: 'Employee PIN', value: '2468' }) })).status, 409);
    assert.equal((await fetch(`${origin}/api/runs/${runId}/handoff/actions`, { method: 'POST', headers, body: JSON.stringify({ expectedEpoch: claimed.epoch, kind: 'fill', label: 'Employee PIN', value: '2468' }) })).status, 200);
    assert.equal((await fetch(`${origin}/api/runs/${runId}/handoff/actions`, { method: 'POST', headers, body: JSON.stringify({ expectedEpoch: claimed.epoch, kind: 'click', name: 'Re-authenticate' }) })).status, 200);
    assert.equal((await fetch(`${origin}/api/runs/${runId}/handoff/resume`, { method: 'POST', headers, body: JSON.stringify({ expectedEpoch: claimed.epoch }) })).status, 200);
    assert.equal((await fetch(`${origin}/api/runs/${runId}/handoff/actions`, { method: 'POST', headers, body: JSON.stringify({ expectedEpoch: claimed.epoch, kind: 'click', name: 'Re-authenticate' }) })).status, 409);
    while (!['succeeded', 'failed', 'cancelled'].includes(run.status) && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 20)); run = await (await fetch(`${origin}/api/runs/${runId}`, { headers })).json(); }
    assert.equal(run.status, 'succeeded');
    assert.equal((await fetch(`${origin}/api/runs/${runId}/cancel`, { method: 'POST', headers })).status, 409);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await registry.closeAll(); await database.close(); await rm(catalogDirectory, { recursive: true, force: true });
    if (runId) await rm(path.resolve('.local', 'runs', runId), { recursive: true, force: true });
  }
});
