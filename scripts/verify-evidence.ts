import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { actionEvidenceSchema, capabilityArtifactSchema } from '../src/contracts/capability.ts';
import { publicRunSchema, telemetryEventSchema } from '../src/contracts/run.ts';
import { stabilitySummarySchema } from '../src/contracts/stability.ts';

const root = path.resolve('evidence');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')) as {
  runs: Array<{ name: string; runId: string; provenance: string; modelRequestCount: number }>;
  files: Record<string, string>;
  review: Record<string, boolean>;
};
if (!Array.isArray(manifest.runs) || !manifest.files || !manifest.review) throw new Error('EVIDENCE_MANIFEST_INVALID');

for (const [relative, expected] of Object.entries(manifest.files)) {
  const bytes = await readFile(path.join(root, relative));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`EVIDENCE_HASH_MISMATCH:${relative}`);
  const content = bytes.toString('utf8');
  if (/sk-[A-Za-z0-9_-]{12,}/.test(content)) throw new Error(`OPENAI_KEY_PATTERN_FOUND:${relative}`);
  if (/mongodb(?:\+srv)?:\/\/[^:\s]+:[^@\s]+@/i.test(content)) throw new Error(`DATABASE_CREDENTIAL_PATTERN_FOUND:${relative}`);
  if (/"value"\s*:\s*"2468"/.test(content)) throw new Error(`SENSITIVE_CANARY_FOUND:${relative}`);
  if (/"rawHtml"\s*:/.test(content)) throw new Error(`RAW_HTML_FIELD_FOUND:${relative}`);
}

const capability = capabilityArtifactSchema.parse(JSON.parse(await readFile(path.join(root, 'capability.json'), 'utf8')));
const stability = stabilitySummarySchema.parse(JSON.parse(await readFile(path.join(root, 'stability-summary.json'), 'utf8')));
if (capability.status !== 'validated') throw new Error('EVIDENCE_CAPABILITY_NOT_VALIDATED');
if (stability.modelRequestCount !== 0 || stability.successfulRuns !== stability.totalRuns) throw new Error('EVIDENCE_STABILITY_INVALID');

for (const item of manifest.runs) {
  const directory = path.join(root, 'runs', item.name);
  const run = publicRunSchema.parse(JSON.parse(await readFile(path.join(directory, 'run.json'), 'utf8')));
  if (run.runId !== item.runId) throw new Error(`EVIDENCE_RUN_ID_MISMATCH:${item.name}`);
  const modelRequests = run.events.filter(event => event.type === 'model_request').length;
  if (modelRequests !== item.modelRequestCount) throw new Error(`EVIDENCE_MODEL_COUNT_MISMATCH:${item.name}`);
  if (item.provenance !== 'genuine_openai' && modelRequests !== 0) throw new Error(`MODEL_EVENT_IN_REPLAY_EVIDENCE:${item.name}`);
  const eventLines = (await readFile(path.join(directory, 'events.jsonl'), 'utf8')).trim().split('\n').filter(Boolean);
  const events = eventLines.map(line => telemetryEventSchema.parse(JSON.parse(line)));
  if (events.length !== run.events.length || events.some((event, index) => event.eventId !== run.events[index]?.eventId)) {
    throw new Error(`EVIDENCE_EVENT_STREAM_MISMATCH:${item.name}`);
  }
  if (item.provenance === 'genuine_openai') {
    capabilityArtifactSchema.parse(JSON.parse(await readFile(path.join(directory, 'artifact.draft.json'), 'utf8')));
    const actionLines = (await readFile(path.join(directory, 'action-evidence.jsonl'), 'utf8')).trim().split('\n').filter(Boolean);
    actionLines.forEach(line => actionEvidenceSchema.parse(JSON.parse(line)));
  }
}

console.log(JSON.stringify({
  status: 'verified',
  runs: manifest.runs.length,
  hashedFiles: Object.keys(manifest.files).length,
  capability: `${capability.artifactId}@${capability.artifactVersion}`,
  stabilityRuns: stability.totalRuns,
}, null, 2));
