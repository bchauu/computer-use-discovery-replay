import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { newId } from '../src/contracts/discovery.ts';
import { publicRunSchema } from '../src/contracts/run.ts';
import { CapabilityCatalog } from '../src/discovery/catalog.ts';
import { ExecutionDispatcher } from '../src/discovery/dispatcher.ts';
import { ReplayController } from '../src/discovery/replay.ts';
import type { LiveSession } from '../src/discovery/sessions.ts';
import { ensureAutomationIndexes } from '../src/discovery/storage.ts';

const target = process.env.BANK_TARGET_URL || 'http://127.0.0.1:5174/#/members';
const uri = process.env.AUTOMATION_MONGODB_URI?.trim();
if (!uri) throw new Error('AUTOMATION_MONGODB_URI_REQUIRED');
const database = mongoose.createConnection();
await database.openUri(uri, { serverSelectionTimeoutMS: 10_000 });
await database.db!.admin().ping();
await ensureAutomationIndexes(database);
const browser = await chromium.launch({ headless: process.env.DISCOVERY_HEADLESS !== 'false' });
const context = await browser.newContext();
await context.addInitScript(() => window.sessionStorage.setItem('automationScenario', 'unknown-dialog-on-history'));
const page = await context.newPage();
let runId: string | null = null;

try {
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByLabel('Full name').fill('Alex Morgan');
  await page.getByLabel('Date of birth').fill('1988-04-12');
  await page.getByRole('button', { name: 'Search members' }).click();
  await page.getByLabel('Last four digits of SSN').fill('4829');
  await page.getByRole('button', { name: 'Verify customer' }).click();
  await page.getByRole('heading', { name: 'Member overview', exact: true }).waitFor();

  const session: LiveSession = {
    sessionId: newId(), controlToken: 'synthetic-decision-handoff', browser, context, page,
    owner: 'human', epoch: 1, activeRunId: null, createdAt: new Date().toISOString(), allowedOrigin: new URL(target).origin,
  };
  const originalPage = session.page;
  const originalContext = session.context;
  const catalog = new CapabilityCatalog(database);
  const replay = new ReplayController(database, catalog);
  const dispatcher = new ExecutionDispatcher(null, replay, catalog);
  const run = await dispatcher.start(session, 'Show this member’s checking transactions for the last 7 days.');
  runId = run.runId;

  const handoffDeadline = Date.now() + 30_000;
  while (run.status !== 'awaiting_human' && Date.now() < handoffDeadline) await new Promise(resolve => setTimeout(resolve, 50));
  if (run.status !== 'awaiting_human' || run.result?.code !== 'HUMAN_DECISION_REQUIRED') throw new Error(`DECISION_HANDOFF_NOT_REACHED:${run.status}:${run.result?.code}`);
  const automationEpoch = session.epoch;
  const claim = await dispatcher.claimHandoff(run.runId, session);
  if (claim.result !== 'accepted') throw new Error(`HANDOFF_CLAIM_FAILED:${claim.result}`);
  const staleCommand = await dispatcher.executeHumanAction(run.runId, session, automationEpoch, { kind: 'click', name: 'Proceed anyway' });
  const deniedCommand = await dispatcher.executeHumanAction(run.runId, session, claim.epoch, { kind: 'click', name: 'Re-authenticate' });
  const prematureResume = await dispatcher.resumeHandoff(run.runId, session, claim.epoch);
  const decision = await dispatcher.executeHumanAction(run.runId, session, claim.epoch, { kind: 'click', name: 'Proceed anyway' });
  if (decision !== 'accepted') throw new Error(`HUMAN_DECISION_FAILED:${decision}`);
  await page.waitForTimeout(500);
  const resume = await dispatcher.resumeHandoff(run.runId, session, claim.epoch);
  if (resume !== 'accepted') throw new Error(`RESUME_FAILED:${resume}`);

  const completionDeadline = Date.now() + 30_000;
  while ((['created', 'running', 'awaiting_human'].includes(run.status) || session.activeRunId === run.runId) && Date.now() < completionDeadline) await new Promise(resolve => setTimeout(resolve, 50));
  const result = publicRunSchema.parse(run);
  if (result.status !== 'succeeded') throw new Error(`DECISION_HANDOFF_RUN_FAILED:${JSON.stringify(result.result)}`);
  console.log(JSON.stringify({
    scenario: 'synthetic_unknown_dialog_handoff',
    runId: result.runId,
    status: result.status,
    resultCode: result.result?.code,
    samePage: session.page === originalPage,
    sameContext: session.context === originalContext,
    staleCommand,
    deniedCommand,
    prematureResume,
    handoffEvents: result.events.filter(event => event.type === 'handoff').map(event => event.code),
    modelRequestEvents: result.events.filter(event => event.type === 'model_request').length,
    transactionCount: result.result?.output?.transactions.length,
  }, null, 2));
} finally {
  await browser.close();
  await database.close();
  if (runId) console.log('Synthetic decision-handoff evidence remains under .local/runs and MongoDB for review.');
}
