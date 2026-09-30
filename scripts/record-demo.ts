import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { configureAutomation } from '../src/automation/server.ts';
import { capabilityArtifactSchema } from '../src/contracts/capability.ts';
import { readFile } from 'node:fs/promises';
import { SessionRegistry } from '../src/discovery/sessions.ts';
import type { LiveSession } from '../src/discovery/sessions.ts';
import { createApp } from '../src/shared/http.ts';

const mongoUri = process.env.AUTOMATION_MONGODB_URI?.trim();
const operatorToken = process.env.OPERATOR_ACCESS_TOKEN?.trim();
if (!mongoUri) throw new Error('AUTOMATION_MONGODB_URI_REQUIRED');
if (!operatorToken) throw new Error('OPERATOR_ACCESS_TOKEN_REQUIRED');

const root = process.cwd();
const captureDirectory = path.resolve('.local', 'demo-capture');
const assetDirectory = path.resolve('docs', 'assets');
await rm(captureDirectory, { recursive: true, force: true });
await mkdir(captureDirectory, { recursive: true });
await mkdir(assetDirectory, { recursive: true });

const children: ReturnType<typeof spawn>[] = [];
function start(command: string) {
  const child = spawn('npm', ['run', command], { cwd: root, detached: true, stdio: 'ignore' });
  children.push(child);
}
async function waitFor(url: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* Service is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`SERVICE_START_TIMEOUT:${url}`);
}

async function waitForRun(runId: string, controlToken: string, expectedStatus: 'succeeded' | 'awaiting_human') {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:3001/api/runs/${runId}`, { headers: { 'x-control-token': controlToken } });
    const run = await response.json() as { status?: string; result?: { code?: string; message?: string } | null };
    if (run.status === expectedStatus) return run;
    if (run.status && ['failed', 'cancelled', 'succeeded'].includes(run.status)) {
      throw new Error(`DEMO_RUN_${run.status.toUpperCase()}:${run.result?.code ?? 'NO_CODE'}:${run.result?.message ?? ''}`);
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`DEMO_RUN_TIMEOUT:${runId}:${expectedStatus}`);
}

const database = mongoose.createConnection();
const registry = new SessionRegistry();
let server: ReturnType<ReturnType<typeof createApp>['listen']> | null = null;
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
try {
  await database.openUri(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  await database.db!.admin().ping();
  let configured!: ReturnType<typeof configureAutomation>;
  const app = createApp('automation', database, instance => {
    configured = configureAutomation(instance, database, { sessionRegistry: registry, decisionClient: null, operatorAccessToken: operatorToken });
  });
  server = app.listen(3001, '127.0.0.1');
  await once(server, 'listening');
  const artifact = capabilityArtifactSchema.parse(JSON.parse(await readFile('evidence/capability.json', 'utf8')));
  await configured.catalog.register(artifact);

  start('dev:bank');
  start('dev:operator');
  await Promise.all([waitFor('http://127.0.0.1:5173'), waitFor('http://127.0.0.1:5174')]);

  browser = await chromium.launch({ headless: true, slowMo: 140 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: captureDirectory, size: { width: 1440, height: 900 } },
  });
  const sessionId = randomUUID();
  const controlToken = 'portfolio-demo-control-token';
  await context.addInitScript(({ operator, session, control }) => {
    window.sessionStorage.setItem('operatorAccessToken', operator);
    window.sessionStorage.setItem('automationSession', session);
    window.sessionStorage.setItem('automationControlToken', control);
  }, { operator: operatorToken, session: sessionId, control: controlToken });
  const page = await context.newPage();
  const video = page.video();

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'The model discovers. The capability replays.' }).waitFor();
  await page.waitForTimeout(2200);
  await page.locator('#runs').scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);

  const session: LiveSession = {
    sessionId, controlToken, browser, context, page,
    owner: 'human', epoch: 1, activeRunId: null, createdAt: new Date().toISOString(), allowedOrigin: 'http://127.0.0.1:5174',
  };
  registry.attach(session);
  await page.goto('http://127.0.0.1:5174/#/members', { waitUntil: 'networkidle' });
  await page.getByLabel('Full name').fill('Alex Morgan');
  await page.getByLabel('Date of birth').fill('1988-04-12');
  await page.getByRole('button', { name: 'Search members' }).click();
  await page.getByLabel('Last four digits of SSN').fill('4829');
  await page.getByRole('button', { name: 'Verify customer' }).click();
  await page.getByLabel('What does the customer need?').fill('Show this member’s checking transactions for the last 14 days.');
  const replayStart = page.waitForResponse(response => response.url().endsWith('/api/runs') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Start automation' }).click();
  const replayStartBody = await (await replayStart).json() as { runId: string };
  await waitForRun(replayStartBody.runId, controlToken, 'succeeded');
  await page.waitForTimeout(2600);
  await page.screenshot({ path: path.join(assetDirectory, 'replay-result.png') });

  await page.evaluate(() => {
    window.sessionStorage.setItem('automationScenario', 'unknown-dialog-on-history');
    window.location.hash = '/members';
  });
  await page.getByLabel('Full name').fill('Alex Morgan');
  await page.getByLabel('Date of birth').fill('1988-04-12');
  await page.getByRole('button', { name: 'Search members' }).click();
  await page.getByLabel('Last four digits of SSN').fill('4829');
  await page.getByRole('button', { name: 'Verify customer' }).click();
  await page.getByLabel('What does the customer need?').fill('Show this member’s checking transactions for the last 7 days.');
  const handoffStart = page.waitForResponse(response => response.url().endsWith('/api/runs') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Start automation' }).click();
  const handoffStartBody = await (await handoffStart).json() as { runId: string };
  await waitForRun(handoffStartBody.runId, controlToken, 'awaiting_human');
  await page.getByRole('button', { name: 'Claim control' }).waitFor({ timeout: 30_000 });
  await page.screenshot({ path: path.join(assetDirectory, 'human-handoff.png') });
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Claim control' }).click();
  await page.getByRole('button', { name: 'Proceed and resume' }).waitFor();
  await page.waitForTimeout(1600);
  await page.getByRole('button', { name: 'Proceed and resume' }).click();
  await waitForRun(handoffStartBody.runId, controlToken, 'succeeded');
  await page.waitForTimeout(2800);

  await context.close();
  if (!video) throw new Error('VIDEO_CAPTURE_UNAVAILABLE');
  const videoPath = await video.path();
  await copyFile(videoPath, path.join(assetDirectory, 'demo.webm'));
  console.log(JSON.stringify({
    status: 'recorded',
    video: 'docs/assets/demo.webm',
    screenshots: ['docs/assets/operator-overview.png', 'docs/assets/run-inspector.png', 'docs/assets/replay-result.png', 'docs/assets/human-handoff.png'],
    provenance: 'scripted_model_free_product_demonstration',
  }, null, 2));
} finally {
  await Promise.allSettled([
    browser?.close() ?? Promise.resolve(),
    registry.closeAll(),
    database.close(),
    server ? new Promise<void>(resolve => server!.close(() => resolve())) : Promise.resolve(),
  ]);
  for (const child of children) if (child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already stopped. */ } }
}
