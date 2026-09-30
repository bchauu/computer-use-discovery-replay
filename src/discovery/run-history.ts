import type { Connection } from 'mongoose';
import { actionEvidenceSchema, capabilityArtifactSchema } from '../contracts/capability.ts';
import { publicRunSchema, runSummarySchema } from '../contracts/run.ts';
import type { PublicRunContract, RunSummary } from '../contracts/run.ts';

function withoutStorageFields(document: Record<string, unknown>) {
  const { _id: _id, createdAt: _createdAt, updatedAt: _updatedAt, evidence: _evidence, ...run } = document;
  return run;
}

export function summarizeRun(run: PublicRunContract): RunSummary {
  const finished = run.finishedAt ? Date.parse(run.finishedAt) : null;
  const started = Date.parse(run.startedAt);
  const recoveryCodes = new Set(['WAITING_FOR_LOADING_STATE', 'AUTHORED_RECOVERY_EXECUTED']);
  return runSummarySchema.parse({
    runId: run.runId,
    mode: run.mode,
    status: run.status,
    goalSummary: run.goalSummary,
    memberName: run.criteria.memberName,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: finished === null || !Number.isFinite(started) ? null : Math.max(0, finished - started),
    category: run.result?.category ?? null,
    resultCode: run.result?.code ?? null,
    modelRequestCount: run.events.filter(event => event.type === 'model_request').length,
    inputTokens: run.events.reduce((sum, event) => sum + (event.inputTokens ?? 0), 0),
    outputTokens: run.events.reduce((sum, event) => sum + (event.outputTokens ?? 0), 0),
    retryCount: run.events.filter(event => event.type === 'retry').length,
    recoveryCount: run.events.filter(event => recoveryCodes.has(event.code)).length,
    handoffCount: run.events.filter(event => event.type === 'handoff').length,
    eventCount: run.events.length,
    artifact: run.artifact ? {
      artifactId: run.artifact.artifactId,
      artifactVersion: run.artifact.artifactVersion,
      status: run.artifact.status,
    } : null,
  });
}

export async function listPersistedRuns(database: Connection, limit = 30) {
  if (database.readyState !== 1) throw new Error('DATABASE_NOT_CONNECTED');
  const documents = await database.collection('discoveryRuns')
    .find({}).sort({ startedAt: -1 }).limit(Math.min(Math.max(limit, 1), 100)).toArray();
  return documents.flatMap(document => {
    const parsed = publicRunSchema.safeParse(withoutStorageFields(document as Record<string, unknown>));
    return parsed.success ? [summarizeRun(parsed.data)] : [];
  });
}

export async function getPersistedRun(database: Connection, runId: string) {
  if (database.readyState !== 1) throw new Error('DATABASE_NOT_CONNECTED');
  const document = await database.collection('discoveryRuns').findOne({ runId });
  if (!document) return null;
  return publicRunSchema.parse(withoutStorageFields(document as Record<string, unknown>));
}

export async function getPersistedEvidence(database: Connection, runId: string) {
  if (database.readyState !== 1) throw new Error('DATABASE_NOT_CONNECTED');
  const document = await database.collection('discoveryRuns').findOne({ runId }, { projection: { evidence: 1 } });
  if (!document) return null;
  const evidence = Array.isArray(document.evidence) ? document.evidence : [];
  return evidence.map(item => actionEvidenceSchema.parse(item));
}

export async function getPersistedCapability(database: Connection, artifactId: string) {
  if (database.readyState !== 1) throw new Error('DATABASE_NOT_CONNECTED');
  const document = await database.collection('capabilityArtifacts')
    .findOne({ artifactId, status: { $in: ['validated', 'draft'] } }, { sort: { status: -1, artifactVersion: -1 } });
  if (!document) return null;
  const { _id: _id, ...candidate } = document;
  return capabilityArtifactSchema.parse(candidate);
}
