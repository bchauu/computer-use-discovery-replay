import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { actionEvidenceSchema, capabilityArtifactSchema } from '../src/contracts/capability.ts';
import { publicRunSchema } from '../src/contracts/run.ts';

const selections = [
  { name: 'discovery-live', runId: process.env.EVIDENCE_DISCOVERY_RUN || 'a5505818-dcf0-4c96-b0a2-a511c5df4541', provenance: 'genuine_openai' },
  { name: 'validation-replay', runId: process.env.EVIDENCE_VALIDATION_RUN || '4dd6cc3d-f89d-4d67-9e85-3f6484e68494', provenance: 'live_model_free_replay' },
  { name: 'cross-member-replay', runId: process.env.EVIDENCE_REPLAY_RUN || 'a3cc7bf4-13c5-4d13-b2ee-842664809e59', provenance: 'live_model_free_replay' },
  { name: 'session-expiry-handoff', runId: process.env.EVIDENCE_HANDOFF_RUN || 'f33b84c5-36ef-414a-8fea-ee8f298e73ed', provenance: 'injected_runtime_condition' },
  { name: 'slow-load-recovery', runId: process.env.EVIDENCE_SLOW_RUN || 'a41e042f-ba1f-4931-9287-3f765ece78c8', provenance: 'injected_runtime_condition' },
  { name: 'known-notice-recovery', runId: process.env.EVIDENCE_NOTICE_RUN || '1003392f-9c08-4b6c-9201-406263099162', provenance: 'injected_runtime_condition' },
  { name: 'permission-intervention', runId: process.env.EVIDENCE_PERMISSION_RUN || '4451698e-4b81-443a-8893-56b0fb96965d', provenance: 'injected_runtime_condition' },
  { name: 'application-failure', runId: process.env.EVIDENCE_APP_ERROR_RUN || '68513634-09e3-4d18-9106-e1d98d39c830', provenance: 'injected_runtime_condition' },
  { name: 'account-not-found', runId: process.env.EVIDENCE_ACCOUNT_MISSING_RUN || '12e03d4c-82bb-4877-bb79-ea21734a072a', provenance: 'synthetic_business_outcome' },
  { name: 'no-transactions', runId: process.env.EVIDENCE_NO_TRANSACTIONS_RUN || 'a87290e1-856d-486f-a5e2-4e4961db996a', provenance: 'synthetic_business_outcome' },
] as const;

const root = path.resolve('evidence');
const runsRoot = path.join(root, 'runs');
await rm(runsRoot, { recursive: true, force: true });
await mkdir(runsRoot, { recursive: true });
const manifestRuns: Array<Record<string, unknown>> = [];
const written: string[] = [];

async function safeWrite(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, { encoding: 'utf8', mode: 0o600 });
  written.push(file);
}

for (const selection of selections) {
  const source = path.resolve('.local', 'runs', selection.runId);
  const run = publicRunSchema.parse(JSON.parse(await readFile(path.join(source, 'run.json'), 'utf8')));
  if (!['succeeded', 'awaiting_human', 'failed', 'cancelled'].includes(run.status)) throw new Error(`UNFINISHED_EVIDENCE_RUN:${selection.runId}`);
  if (selection.provenance === 'genuine_openai' && !run.events.some(event => event.type === 'model_request')) throw new Error('DISCOVERY_MODEL_EVIDENCE_MISSING');
  if (selection.provenance.includes('model_free') && run.events.some(event => event.type === 'model_request')) throw new Error(`MODEL_EVENT_IN_REPLAY:${selection.runId}`);
  const destination = path.join(runsRoot, selection.name);
  await safeWrite(path.join(destination, 'run.json'), `${JSON.stringify(run, null, 2)}\n`);
  await safeWrite(path.join(destination, 'events.jsonl'), run.events.map(event => JSON.stringify(event)).join('\n') + '\n');
  if (selection.provenance === 'genuine_openai') {
    const artifact = capabilityArtifactSchema.parse(JSON.parse(await readFile(path.join(source, 'artifact.draft.json'), 'utf8')));
    await safeWrite(path.join(destination, 'artifact.draft.json'), `${JSON.stringify(artifact, null, 2)}\n`);
    const evidenceLines = (await readFile(path.join(source, 'action-evidence.jsonl'), 'utf8')).trim().split('\n').filter(Boolean);
    const actions = evidenceLines.map(line => actionEvidenceSchema.parse(JSON.parse(line)));
    await safeWrite(path.join(destination, 'action-evidence.jsonl'), actions.map(item => JSON.stringify(item)).join('\n') + '\n');
  }
  manifestRuns.push({
    name: selection.name, runId: run.runId, provenance: selection.provenance, mode: run.mode, status: run.status,
    resultCode: run.result?.code ?? null, modelRequestCount: run.events.filter(event => event.type === 'model_request').length,
    startedAt: run.startedAt, finishedAt: run.finishedAt,
  });
}

const capability = capabilityArtifactSchema.parse(JSON.parse(await readFile(path.resolve('.local', 'capabilities', 'view-transaction-history.json'), 'utf8')));
await safeWrite(path.join(root, 'capability.json'), `${JSON.stringify(capability, null, 2)}\n`);

const key = process.env.OPENAI_API_KEY?.trim();
const forbidden = [/sk-[A-Za-z0-9_-]{12,}/, /"value"\s*:\s*"2468"/];
if (key) forbidden.push(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
for (const file of written) {
  const content = await readFile(file, 'utf8');
  if (forbidden.some(pattern => pattern.test(content))) throw new Error(`SENSITIVE_CANARY_FOUND:${path.relative(root, file)}`);
}

const hashes: Record<string, string> = {};
for (const file of written.sort()) hashes[path.relative(root, file)] = createHash('sha256').update(await readFile(file)).digest('hex');
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  model: capability.source.testedModel,
  capability: { artifactId: capability.artifactId, artifactVersion: capability.artifactVersion, status: capability.status },
  runs: manifestRuns,
  files: hashes,
  review: { rawHtmlExported: false, screenshotsExported: false, configuredApiKeyMatchFound: false, syntheticPinValueExported: false },
};
await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
console.log(JSON.stringify({ exportedRuns: manifestRuns.length, exportedFiles: written.length + 1, review: manifest.review }, null, 2));
