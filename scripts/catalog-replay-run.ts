import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { newId } from '../src/contracts/discovery.ts';
import { publicRunSchema } from '../src/contracts/run.ts';
import { CapabilityCatalog } from '../src/discovery/catalog.ts';
import { ExecutionDispatcher } from '../src/discovery/dispatcher.ts';
import { ReplayController } from '../src/discovery/replay.ts';
import type { LiveSession } from '../src/discovery/sessions.ts';

const target = process.env.BANK_TARGET_URL || 'http://127.0.0.1:5174/#/members';
const database = mongoose.createConnection();
const browser = await chromium.launch({ headless: process.env.DISCOVERY_HEADLESS !== 'false' });
const context = await browser.newContext();
const page = await context.newPage();
let runId: string | null = null;

try {
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByLabel('Full name').fill('Jordan Lee');
  await page.getByLabel('Date of birth').fill('1992-09-06');
  await page.getByRole('button', { name: 'Search members' }).click();
  await page.getByLabel('Last four digits of SSN').fill('7150');
  await page.getByRole('button', { name: 'Verify customer' }).click();
  await page.getByRole('heading', { name: 'Member overview', exact: true }).waitFor();

  const session: LiveSession = {
    sessionId: newId(), controlToken: 'catalog-replay-run', browser, context, page,
    owner: 'human', epoch: 1, activeRunId: null, createdAt: new Date().toISOString(), allowedOrigin: new URL(target).origin,
  };
  const catalog = new CapabilityCatalog(database);
  const replay = new ReplayController(database, catalog);
  const dispatcher = new ExecutionDispatcher(null, replay, catalog);
  const run = await dispatcher.start(session, 'Show checking account activity for the last 14 days.');
  runId = run.runId;
  const deadline = Date.now() + 60_000;
  while (['created', 'running'].includes(run.status) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  const result = publicRunSchema.parse(run);
  if (result.status !== 'succeeded' || result.mode !== 'replay') {
    throw new Error(`CATALOG_REPLAY_FAILED:${JSON.stringify({ runId: result.runId, status: result.status, mode: result.mode, result: result.result })}`);
  }
  console.log(JSON.stringify({
    scenario: 'cross_process_catalog_replay',
    runId: result.runId,
    mode: result.mode,
    status: result.status,
    resultCode: result.result?.code,
    artifactStatus: result.artifact?.status,
    verifiedMember: result.criteria.memberName,
    account: result.result?.output?.account,
    transactionCount: result.result?.output?.transactions.length,
    modelRequestEvents: result.events.filter(event => event.type === 'model_request').length,
  }, null, 2));
} finally {
  await browser.close();
  await database.close();
  if (runId) console.log('Cross-process replay evidence remains under .local/runs for review.');
}
