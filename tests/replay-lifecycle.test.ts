import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { capabilityArtifactSchema } from '../src/contracts/capability.ts';
import { newId } from '../src/contracts/discovery.ts';
import { CapabilityCatalog } from '../src/discovery/catalog.ts';
import { ExecutionDispatcher } from '../src/discovery/dispatcher.ts';
import { ReplayController } from '../src/discovery/replay.ts';
import type { LiveSession } from '../src/discovery/sessions.ts';

const html = `<!doctype html><html><body><main id="app"></main><script>
const member='<div class="member-strip"><strong>Alex Morgan</strong><span>Member #12345</span></div>';
function render(){if(location.hash.slice(1)==='/transactions')app.innerHTML='<div class="runtime-loading" role="progressbar">Loading forever</div>';else app.innerHTML=member+'<h1>Member overview</h1><a href="#/transactions">Transactions</a>'}addEventListener('hashchange',render);render();
</script></body></html>`;

test('active replay cancellation and browser loss produce honest terminal states', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route('http://app.local/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  const database = mongoose.createConnection(); const directory = await mkdtemp(path.join(tmpdir(), 'lifecycle-catalog-'));
  const catalog = new CapabilityCatalog(database, directory);
  await catalog.register(capabilityArtifactSchema.parse(JSON.parse(await readFile(path.resolve('evidence/capability.json'), 'utf8'))));
  const replay = new ReplayController(database, catalog); const dispatcher = new ExecutionDispatcher(null, replay, catalog);
  const runIds: string[] = [];
  async function sessionFor(page: Awaited<ReturnType<typeof context.newPage>>): Promise<LiveSession> {
    await page.goto('http://app.local/#/members/12345');
    return { sessionId: newId(), controlToken: 'lifecycle', browser, context, page, owner: 'human', epoch: 1, activeRunId: null, createdAt: new Date().toISOString(), allowedOrigin: 'http://app.local' };
  }
  try {
    const cancelSession = await sessionFor(await context.newPage());
    const cancelled = await dispatcher.start(cancelSession, 'Show checking transactions for the last 7 days.'); runIds.push(cancelled.runId);
    await cancelSession.page.waitForURL('**/#/transactions');
    assert.equal(dispatcher.cancel(cancelled.runId, cancelSession), 'accepted');
    const cancelDeadline = Date.now() + 7_000;
    while (['created', 'running'].includes(cancelled.status) && Date.now() < cancelDeadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.result?.code, 'RUN_CANCELLED');

    const lostSession = await sessionFor(await context.newPage());
    const lost = await dispatcher.start(lostSession, 'Show checking transactions for the last 7 days.'); runIds.push(lost.runId);
    await lostSession.page.waitForURL('**/#/transactions'); await lostSession.page.close();
    const lostDeadline = Date.now() + 7_000;
    while (['created', 'running'].includes(lost.status) && Date.now() < lostDeadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(lost.status, 'failed'); assert.equal(lost.result?.code, 'SESSION_LOST');
    assert.equal(lost.result?.diagnostic?.phase, 'session');
  } finally {
    await browser.close(); await database.close(); await rm(directory, { recursive: true, force: true });
    await Promise.all(runIds.map(id => rm(path.resolve('.local', 'runs', id), { recursive: true, force: true })));
  }
});
