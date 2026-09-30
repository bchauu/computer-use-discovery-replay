import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { newId } from '../src/contracts/discovery.ts';
import { publicRunSchema } from '../src/contracts/run.ts';
import { CapabilityCatalog } from '../src/discovery/catalog.ts';
import { ExecutionDispatcher } from '../src/discovery/dispatcher.ts';
import { ReplayController } from '../src/discovery/replay.ts';
import type { LiveSession } from '../src/discovery/sessions.ts';

const target = process.env.BANK_TARGET_URL || 'http://127.0.0.1:5174/#/members';
const scenarios = [
  { scenario: 'none', member: ['Alex Morgan', '1988-04-12', '4829'], goal: 'Show checking transactions for the last 30 days.', expectedStatus: 'succeeded', expectedCategory: 'success', expectedCode: 'REPLAY_SUCCEEDED', expectedTransactions: 14, expectedPageAdvances: 1 },
  { scenario: 'slow-history-once', member: ['Alex Morgan', '1988-04-12', '4829'], goal: 'Show checking transactions for the last 7 days.', expectedStatus: 'succeeded', expectedCategory: 'success', expectedCode: 'REPLAY_SUCCEEDED' },
  { scenario: 'known-notice-on-history', member: ['Alex Morgan', '1988-04-12', '4829'], goal: 'Show checking transactions for the last 7 days.', expectedStatus: 'succeeded', expectedCategory: 'success', expectedCode: 'REPLAY_SUCCEEDED' },
  { scenario: 'permission-denied-on-history', member: ['Alex Morgan', '1988-04-12', '4829'], goal: 'Show checking transactions for the last 7 days.', expectedStatus: 'failed', expectedCategory: 'intervention', expectedCode: 'PERMISSION_DENIED' },
  { scenario: 'app-error-on-history', member: ['Alex Morgan', '1988-04-12', '4829'], goal: 'Show checking transactions for the last 7 days.', expectedStatus: 'failed', expectedCategory: 'hard_failure', expectedCode: 'APPLICATION_ERROR' },
  { scenario: 'account-not-found', member: ['Taylor Reed', '1995-02-18', '0264'], goal: 'Show checking transactions for the last 7 days.', expectedStatus: 'succeeded', expectedCategory: 'business_outcome', expectedCode: 'ACCOUNT_NOT_FOUND' },
  { scenario: 'no-transactions', member: ['Taylor Reed', '1995-02-18', '0264'], goal: 'Show savings transactions for the last 7 days.', expectedStatus: 'succeeded', expectedCategory: 'business_outcome', expectedCode: 'NO_TRANSACTIONS', expectedTransactions: 0 },
] as const;
const database = mongoose.createConnection();
const results: Array<Record<string, unknown>> = [];

try {
  for (const item of scenarios) {
    const browser = await chromium.launch({ headless: process.env.DISCOVERY_HEADLESS !== 'false' });
    try {
      const context = await browser.newContext();
      await context.addInitScript(value => { window.sessionStorage.setItem('automationScenario', value); }, item.scenario);
      const page = await context.newPage(); await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.getByLabel('Full name').fill(item.member[0]); await page.getByLabel('Date of birth').fill(item.member[1]);
      await page.getByRole('button', { name: 'Search members' }).click(); await page.getByLabel('Last four digits of SSN').fill(item.member[2]);
      await page.getByRole('button', { name: 'Verify customer' }).click(); await page.getByRole('heading', { name: 'Member overview', exact: true }).waitFor();
      const session: LiveSession = { sessionId: newId(), controlToken: 'runtime-system', browser, context, page, owner: 'human', epoch: 1, activeRunId: null, createdAt: new Date().toISOString(), allowedOrigin: new URL(target).origin };
      const catalog = new CapabilityCatalog(database); const replay = new ReplayController(database, catalog); const dispatcher = new ExecutionDispatcher(null, replay, catalog);
      const run = await dispatcher.start(session, item.goal);
      const deadline = Date.now() + 30_000;
      while (['created', 'running'].includes(run.status) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
      const parsed = publicRunSchema.parse(run);
      if (parsed.status !== item.expectedStatus) throw new Error(`SCENARIO_STATUS_MISMATCH:${item.scenario}:${parsed.status}:${item.expectedStatus}`);
      if (parsed.result?.category !== item.expectedCategory) throw new Error(`SCENARIO_CATEGORY_MISMATCH:${item.scenario}:${parsed.result?.category}:${item.expectedCategory}`);
      if (parsed.result?.code !== item.expectedCode) throw new Error(`SCENARIO_CODE_MISMATCH:${item.scenario}:${parsed.result?.code}:${item.expectedCode}`);
      const transactionCount = parsed.result?.output?.transactions.length ?? null;
      if ('expectedTransactions' in item && transactionCount !== item.expectedTransactions) throw new Error(`SCENARIO_OUTPUT_MISMATCH:${item.scenario}:${transactionCount}:${item.expectedTransactions}`);
      const pageAdvances = parsed.events.filter(event => event.code === 'OUTPUT_PAGE_ADVANCED').length;
      if ('expectedPageAdvances' in item && pageAdvances !== item.expectedPageAdvances) throw new Error(`SCENARIO_PAGINATION_MISMATCH:${item.scenario}:${pageAdvances}:${item.expectedPageAdvances}`);
      results.push({ scenario: item.scenario, runId: parsed.runId, status: parsed.status, category: parsed.result?.category, code: parsed.result?.code, transactionCount, pageAdvances, modelRequests: parsed.events.filter(event => event.type === 'model_request').length, recoveryEvents: parsed.events.filter(event => event.code === 'AUTHORED_RECOVERY_EXECUTED').length });
    } finally { await browser.close(); }
  }
  console.log(JSON.stringify({ scenarios: results }, null, 2));
  console.log('Runtime scenario evidence remains under .local/runs for review.');
} finally { await database.close(); }
