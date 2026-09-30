import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { capabilityArtifactSchema } from '../src/contracts/capability.ts';
import { newId } from '../src/contracts/discovery.ts';
import { publicRunSchema } from '../src/contracts/run.ts';
import { CapabilityCatalog } from '../src/discovery/catalog.ts';
import { ensureAutomationIndexes } from '../src/discovery/storage.ts';
import { eventInput, RunTelemetry } from '../src/discovery/telemetry.ts';
import type { PublicRun } from '../src/discovery/types.ts';

const uri = process.env.AUTOMATION_MONGODB_URI?.trim();
if (!uri) throw new Error('AUTOMATION_MONGODB_URI_REQUIRED');

const runId = newId();
const sessionId = newId();
const catalogDirectory = await mkdtemp(path.join(tmpdir(), 'persistence-catalog-'));
const localRunDirectory = path.resolve('.local', 'runs', runId);
const first = mongoose.createConnection();
let second: mongoose.Connection | null = null;

async function connect(connection: mongoose.Connection) {
  await connection.openUri(uri!, { serverSelectionTimeoutMS: 10_000, bufferCommands: false });
  await connection.db!.admin().ping();
}

try {
  await connect(first);
  await ensureAutomationIndexes(first);

  const retainedArtifact = capabilityArtifactSchema.parse(JSON.parse(await readFile('evidence/capability.json', 'utf8')));
  const artifact = capabilityArtifactSchema.parse({
    ...retainedArtifact,
    status: 'validated',
    source: {
      ...retainedArtifact.source,
      runId,
      testedModel: 'persistence-check-no-model',
      compiledAt: new Date().toISOString(),
    },
  });
  const run: PublicRun = publicRunSchema.parse({
    runId,
    sessionId,
    mode: 'replay',
    status: 'running',
    goalSummary: 'Persistence verification with synthetic metadata',
    inputs: { accountType: 'checking', period: '7_days' },
    criteria: {
      memberId: 'synthetic-persistence-member', memberName: 'Synthetic Persistence Check',
      accountType: 'Checking', view: 'transaction_history', period: '7',
    },
    step: 0,
    maxSteps: 1,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    artifact: null,
    events: [],
  });
  const telemetry = new RunTelemetry(run, first);
  await telemetry.record(eventInput('run_started', 'PERSISTENCE_CHECK_STARTED', 0));
  const catalog = new CapabilityCatalog(first, catalogDirectory);
  await catalog.promote(artifact);
  run.status = 'succeeded';
  run.finishedAt = new Date().toISOString();
  run.result = {
    category: 'success', code: 'PERSISTENCE_CHECK_SUCCEEDED',
    message: 'Synthetic persistence verification completed.', output: null, diagnostic: null,
  };
  run.artifact = { artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, status: artifact.status, path: null };
  await telemetry.record(eventInput('run_finished', 'PERSISTENCE_CHECK_SUCCEEDED', 0));
  await first.close();

  second = mongoose.createConnection();
  await connect(second);
  const storedRunDocument = await second.collection('discoveryRuns').findOne({ runId });
  if (!storedRunDocument) throw new Error('PERSISTED_RUN_NOT_FOUND');
  const { _id: _runId, createdAt: _createdAt, updatedAt: _updatedAt, ...storedRun } = storedRunDocument;
  const verifiedRun = publicRunSchema.parse(storedRun);
  if (verifiedRun.status !== 'succeeded' || verifiedRun.events.length !== 2) throw new Error('PERSISTED_RUN_INVALID');

  const storedArtifactDocument = await second.collection('capabilityArtifacts').findOne({
    artifactId: artifact.artifactId,
    artifactVersion: artifact.artifactVersion,
    'source.runId': runId,
  });
  if (!storedArtifactDocument) throw new Error('PERSISTED_ARTIFACT_NOT_FOUND');
  const { _id: _artifactId, ...storedArtifact } = storedArtifactDocument;
  const verifiedArtifact = capabilityArtifactSchema.parse(storedArtifact);
  const runIndexes = await second.collection('discoveryRuns').indexes();
  const artifactIndexes = await second.collection('capabilityArtifacts').indexes();
  if (!runIndexes.some(index => index.name === 'discovery_run_id_unique')) throw new Error('RUN_INDEX_MISSING');
  if (!artifactIndexes.some(index => index.name === 'capability_source_unique')) throw new Error('ARTIFACT_INDEX_MISSING');

  console.log(JSON.stringify({
    scenario: 'mongodb_persistence_round_trip',
    status: 'succeeded',
    runId: verifiedRun.runId,
    runEvents: verifiedRun.events.length,
    artifactId: verifiedArtifact.artifactId,
    artifactStatus: verifiedArtifact.status,
    indexesVerified: ['discovery_run_id_unique', 'capability_source_unique'],
    modelRequests: verifiedRun.events.filter(event => event.type === 'model_request').length,
  }, null, 2));
} finally {
  let cleanup = second?.readyState === 1 ? second : first.readyState === 1 ? first : null;
  let cleanupConnection: mongoose.Connection | null = null;
  if (!cleanup) {
    cleanupConnection = mongoose.createConnection();
    try {
      await connect(cleanupConnection);
      cleanup = cleanupConnection;
    } catch {
      await cleanupConnection.close().catch(() => undefined);
      cleanupConnection = null;
    }
  }
  if (cleanup) {
    await Promise.allSettled([
      cleanup.collection('discoveryRuns').deleteMany({ runId }),
      cleanup.collection('capabilityArtifacts').deleteMany({ 'source.runId': runId }),
    ]);
  }
  await Promise.allSettled([first.close(), second?.close() ?? Promise.resolve(), cleanupConnection?.close() ?? Promise.resolve()]);
  await rm(catalogDirectory, { recursive: true, force: true });
  await rm(localRunDirectory, { recursive: true, force: true });
}
