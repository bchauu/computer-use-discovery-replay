import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { actionEvidenceSchema, capabilityArtifactSchema } from '../src/contracts/capability.ts';
import { publicRunSchema } from '../src/contracts/run.ts';

const selections = [
  { name: 'discovery-live', runId: process.env.EVIDENCE_DISCOVERY_RUN || 'a5505818-dcf0-4c96-b0a2-a511c5df4541', provenance: 'genuine_openai' },
  { name: 'validation-replay', runId: process.env.EVIDENCE_VALIDATION_RUN || '4dd6cc3d-f89d-4d67-9e85-3f6484e68494', provenance: 'live_model_free_replay' },
  { name: 'cross-member-replay', runId: process.env.EVIDENCE_REPLAY_RUN || '7bf6303b-3bab-47af-a1d3-9c39bd42f1d2', provenance: 'live_model_free_replay' },
  { name: 'full-pagination-replay', runId: process.env.EVIDENCE_PAGINATION_RUN || '13f1ce53-a8bb-4016-9e3f-d591b45c6ab6', provenance: 'live_model_free_replay' },
  { name: 'session-expiry-handoff', runId: process.env.EVIDENCE_HANDOFF_RUN || '248dbea4-ab0e-4ae5-899a-07361d034642', provenance: 'injected_runtime_condition' },
  { name: 'slow-load-recovery', runId: process.env.EVIDENCE_SLOW_RUN || 'c5e82c04-bf19-41e8-9568-df10a748ff3f', provenance: 'injected_runtime_condition' },
  { name: 'known-notice-recovery', runId: process.env.EVIDENCE_NOTICE_RUN || '61c946ff-adc0-4a4e-b56a-bbb7222dcf1e', provenance: 'injected_runtime_condition' },
  { name: 'permission-intervention', runId: process.env.EVIDENCE_PERMISSION_RUN || '97bce8d0-7268-4142-bc38-90e2e6f61101', provenance: 'injected_runtime_condition' },
  { name: 'application-failure', runId: process.env.EVIDENCE_APP_ERROR_RUN || '810849d0-f8e9-491c-9d30-b3af5675005a', provenance: 'injected_runtime_condition' },
  { name: 'account-not-found', runId: process.env.EVIDENCE_ACCOUNT_MISSING_RUN || '6a414baa-334c-4871-8b4c-dad12d8a9255', provenance: 'synthetic_business_outcome' },
  { name: 'no-transactions', runId: process.env.EVIDENCE_NO_TRANSACTIONS_RUN || '4b7d40e2-3a18-4d68-9efc-aed58bda2b08', provenance: 'synthetic_business_outcome' },
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
  if (selection.provenance !== 'genuine_openai' && run.events.some(event => event.type === 'model_request')) throw new Error(`MODEL_EVENT_IN_NON_DISCOVERY_EVIDENCE:${selection.runId}`);
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
