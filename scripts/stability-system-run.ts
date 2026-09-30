import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { newId, stableHash } from '../src/contracts/discovery.ts';
import { publicRunSchema } from '../src/contracts/run.ts';
import { stabilitySummarySchema } from '../src/contracts/stability.ts';
import { CapabilityCatalog } from '../src/discovery/catalog.ts';
import { ExecutionDispatcher } from '../src/discovery/dispatcher.ts';
import { ReplayController } from '../src/discovery/replay.ts';
import type { LiveSession } from '../src/discovery/sessions.ts';

const target = process.env.BANK_TARGET_URL || 'http://127.0.0.1:5174/#/members';
const requestedRuns = Number(process.env.STABILITY_RUNS || 20);
if (!Number.isInteger(requestedRuns) || requestedRuns < 1 || requestedRuns > 100) throw new Error('STABILITY_RUNS_MUST_BE_1_TO_100');

const scenarios = [
  { id: 'alex-checking-latest', member: ['Alex Morgan', '1988-04-12', '4829'], goal: 'Show the latest checking transaction.', code: 'REPLAY_SUCCEEDED', count: 1 },
  { id: 'alex-checking-7', member: ['Alex Morgan', '1988-04-12', '4829'], goal: 'Show checking transactions for the last 7 days.', code: 'REPLAY_SUCCEEDED', count: 4 },
  { id: 'alex-checking-14', member: ['Alex Morgan', '1988-04-12', '4829'], goal: 'Show checking account activity for the last 14 days.', code: 'REPLAY_SUCCEEDED', count: 8 },
  { id: 'alex-checking-30', member: ['Alex Morgan', '1988-04-12', '4829'], goal: 'Show checking history for the last 30 days.', code: 'REPLAY_SUCCEEDED', count: 14 },
  { id: 'alex-savings-30', member: ['Alex Morgan', '1988-04-12', '4829'], goal: 'Show savings transactions for the last 30 days.', code: 'REPLAY_SUCCEEDED', count: 2 },
  { id: 'jordan-checking-7', member: ['Jordan Lee', '1992-09-06', '7150'], goal: 'Show checking activity for the last 7 days.', code: 'REPLAY_SUCCEEDED', count: 2 },
  { id: 'jordan-savings-missing', member: ['Jordan Lee', '1992-09-06', '7150'], goal: 'Show savings transactions for the last 7 days.', code: 'ACCOUNT_NOT_FOUND', count: null },
  { id: 'taylor-savings-empty', member: ['Taylor Reed', '1995-02-18', '0264'], goal: 'Show savings transactions for the last 14 days.', code: 'NO_TRANSACTIONS', count: 0 },
] as const;

const percentile = (values: number[], fraction: number) => values[Math.max(0, Math.ceil(values.length * fraction) - 1)] ?? 0;
const database = mongoose.createConnection();
const catalog = new CapabilityCatalog(database);
const replay = new ReplayController(database, catalog);
const dispatcher = new ExecutionDispatcher(null, replay, catalog);
const browser = await chromium.launch({ headless: process.env.STABILITY_HEADLESS !== 'false' });
const results: Array<{
  iteration: number; scenario: string; runId: string; durationMs: number; status: string;
  code: string | null; transactionCount: number | null; outputHash: string | null;
  modelRequests: number; pageAdvances: number;
}> = [];

try {
  for (let iteration = 0; iteration < requestedRuns; iteration += 1) {
    const scenario = scenarios[iteration % scenarios.length]!;
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.getByLabel('Full name').fill(scenario.member[0]);
      await page.getByLabel('Date of birth').fill(scenario.member[1]);
      await page.getByRole('button', { name: 'Search members' }).click();
      await page.getByLabel('Last four digits of SSN').fill(scenario.member[2]);
      await page.getByRole('button', { name: 'Verify customer' }).click();
      await page.getByRole('heading', { name: 'Member overview', exact: true }).waitFor();
      const session: LiveSession = {
        sessionId: newId(), controlToken: 'stability-system', browser, context, page,
        owner: 'human', epoch: 1, activeRunId: null, createdAt: new Date().toISOString(),
        allowedOrigin: new URL(target).origin,
      };
      const started = performance.now();
      const run = await dispatcher.start(session, scenario.goal);
      const deadline = Date.now() + 60_000;
      while (['created', 'running'].includes(run.status) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
      const parsed = publicRunSchema.parse(run);
      const durationMs = Math.round(performance.now() - started);
      const transactionCount = parsed.result?.output?.transactions.length ?? null;
      const modelRequests = parsed.events.filter(event => event.type === 'model_request').length;
      if (parsed.status !== 'succeeded') throw new Error(`STABILITY_STATUS_MISMATCH:${scenario.id}:${parsed.status}`);
      if (parsed.result?.code !== scenario.code) throw new Error(`STABILITY_CODE_MISMATCH:${scenario.id}:${parsed.result?.code}:${scenario.code}`);
      if (transactionCount !== scenario.count) throw new Error(`STABILITY_OUTPUT_COUNT_MISMATCH:${scenario.id}:${transactionCount}:${scenario.count}`);
      if (modelRequests !== 0) throw new Error(`MODEL_REQUEST_DURING_REPLAY:${scenario.id}`);
      results.push({
        iteration: iteration + 1,
        scenario: scenario.id,
        runId: parsed.runId,
        durationMs,
        status: parsed.status,
        code: parsed.result?.code ?? null,
        transactionCount,
        outputHash: parsed.result?.output ? stableHash(parsed.result.output) : null,
        modelRequests,
        pageAdvances: parsed.events.filter(event => event.code === 'OUTPUT_PAGE_ADVANCED').length,
      });
    } finally {
      await context.close();
    }
  }

  const consistency = Object.fromEntries(scenarios.map(scenario => {
    const matching = results.filter(result => result.scenario === scenario.id);
    return [scenario.id, new Set(matching.map(result => result.outputHash)).size <= 1];
  }));
  if (Object.values(consistency).some(value => !value)) throw new Error('STABILITY_OUTPUT_HASH_MISMATCH');
  const durations = results.map(result => result.durationMs).sort((left, right) => left - right);
  const summary = stabilitySummarySchema.parse({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    targetOrigin: new URL(target).origin,
    totalRuns: results.length,
    successfulRuns: results.filter(result => result.status === 'succeeded').length,
    expectedOutcomeRate: results.length ? 1 : 0,
    modelRequestCount: results.reduce((sum, result) => sum + result.modelRequests, 0),
    durationMs: { min: durations[0] ?? 0, p50: percentile(durations, 0.5), p95: percentile(durations, 0.95), max: durations.at(-1) ?? 0 },
    outputConsistentByScenario: consistency,
    results,
  });
  const outputDirectory = path.resolve('.local', 'stability');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, 'latest.json'), `${JSON.stringify(summary, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(JSON.stringify({ ...summary, results: undefined, output: '.local/stability/latest.json' }, null, 2));
} finally {
  await browser.close();
  await database.close();
}
