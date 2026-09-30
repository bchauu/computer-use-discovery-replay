import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { newId } from '../src/contracts/discovery.ts';
import { publicRunSchema } from '../src/contracts/run.ts';
import { CapabilityCatalog } from '../src/discovery/catalog.ts';
import { DiscoveryController } from '../src/discovery/controller.ts';
import { ExecutionDispatcher } from '../src/discovery/dispatcher.ts';
import { MockDecisionClient } from '../src/discovery/model.ts';
import { readOnlyDiscoveryPolicy } from '../src/discovery/policy.ts';
import { ReplayController } from '../src/discovery/replay.ts';
import type { LiveSession } from '../src/discovery/sessions.ts';
import type { PublicRun } from '../src/discovery/types.ts';

const target = process.env.BANK_TARGET_URL || 'http://127.0.0.1:5174/#/members';
const database = mongoose.createConnection();
const databaseUri = process.env.AUTOMATION_MONGODB_URI?.trim();
const mockDatabaseName = `automation_mock_${Date.now()}`;
let mongoConnected = false;
if (databaseUri) {
  try {
    await database.openUri(databaseUri, { serverSelectionTimeoutMS: 5000, dbName: mockDatabaseName });
    await database.db!.admin().ping();
    mongoConnected = true;
  } catch {
    console.warn('Mock run will use local files only because MongoDB is unavailable.');
  }
}

const browser = await chromium.launch({ headless: process.env.DISCOVERY_HEADLESS !== 'false' });
const context = await browser.newContext();
const page = await context.newPage();
const catalogDirectory = await mkdtemp(path.join(tmpdir(), 'injected-capability-catalog-'));
let discoveryRunId: string | null = null;
let replayRunId: string | null = null;

async function waitForRun(run: PublicRun) {
  const deadline = Date.now() + 30_000;
  while (['created', 'running'].includes(run.status) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
}

try {
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByLabel('Full name').fill('Alex Morgan');
  await page.getByLabel('Date of birth').fill('1988-04-12');
  await page.getByRole('button', { name: 'Search members' }).click();
  await page.getByLabel('Last four digits of SSN').fill('4829');
  await page.getByRole('button', { name: 'Verify customer' }).click();
  await page.getByRole('heading', { name: 'Member overview', exact: true }).waitFor();

  const session: LiveSession = {
    sessionId: newId(), controlToken: 'injected-local-run', browser, context, page,
    owner: 'human', epoch: 1, activeRunId: null, createdAt: new Date().toISOString(), allowedOrigin: new URL(target).origin,
  };
  const catalog = new CapabilityCatalog(database, catalogDirectory);
  const discovery = new DiscoveryController(database, new MockDecisionClient(), {
    maxSteps: 10, runTimeoutMs: 60_000, actionTimeoutMs: 10_000, modelAttempts: 1, retryBaseMs: 10,
    repeatedDecisionLimit: 2, noProgressLimit: 2, maxModelCalls: 10, maxTotalTokens: 1,
    actionPolicy: readOnlyDiscoveryPolicy,
  }, catalog);
  const replay = new ReplayController(database, catalog);
  const dispatcher = new ExecutionDispatcher(discovery, replay, catalog);

  const discoveryRun = await dispatcher.start(session, 'Show this member’s checking transactions for the last 7 days.');
  discoveryRunId = discoveryRun.runId;
  await waitForRun(discoveryRun);
  const discovered = publicRunSchema.parse(discoveryRun);
  if (discovered.status !== 'succeeded' || discovered.artifact?.status !== 'draft') {
    throw new Error(`INJECTED_DISCOVERY_FAILED:${JSON.stringify(discovered.result)}`);
  }

  const validationRun = await dispatcher.start(session, 'Show this member’s checking transactions for the last 14 days.');
  replayRunId = validationRun.runId;
  await waitForRun(validationRun);
  const replayed = publicRunSchema.parse(validationRun);
  if (replayed.status !== 'succeeded' || replayed.mode !== 'validation_replay' || replayed.artifact?.status !== 'validated') {
    throw new Error(`INJECTED_VALIDATION_REPLAY_FAILED:${JSON.stringify(replayed.result)}`);
  }

  console.log(JSON.stringify({
    scenario: 'injected_mock',
    mongoConnected,
    discovery: {
      runId: discovered.runId, mode: discovered.mode, status: discovered.status, steps: discovered.step,
      resultCode: discovered.result?.code, artifactStatus: discovered.artifact?.status,
      model: [...new Set(discovered.events.map(event => event.model).filter(Boolean))],
    },
    validationReplay: {
      runId: replayed.runId, mode: replayed.mode, status: replayed.status, steps: replayed.step,
      resultCode: replayed.result?.code, artifactStatus: replayed.artifact?.status,
      account: replayed.result?.output?.account,
      transactionCount: replayed.result?.output?.transactions.length,
      modelRequestEvents: replayed.events.filter(event => event.type === 'model_request').length,
    },
  }, null, 2));
} finally {
  await browser.close();
  if (mongoConnected) await database.dropDatabase();
  await database.close();
  await rm(catalogDirectory, { recursive: true, force: true });
  if (discoveryRunId || replayRunId) console.log(`Injected run evidence remains under .local/runs for review.`);
}
