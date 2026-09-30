import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { actionEvidenceSchema, capabilityArtifactSchema } from '../src/contracts/capability.ts';
import type { ActionEvidence } from '../src/contracts/capability.ts';
import { compileTransactionHistoryArtifact } from '../src/discovery/compiler.ts';
import { CapabilityCatalog } from '../src/discovery/catalog.ts';
import { buildActionEvidence } from '../src/discovery/evidence.ts';

const runId = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(64);

function evidence(step: number, kind: 'click' | 'select' | 'fill', status: 'executed' | 'not_executed' | 'failed_unknown_effect' = 'executed'): ActionEvidence {
  return actionEvidenceSchema.parse({
    schemaVersion: 1,
    runId,
    step,
    before: { revision: `observation-${step}-before`, stateHash: hash, route: '/transactions', headings: ['Transaction inquiry'], controlCount: 4, selectedControls: [] },
    target: {
      fingerprint: hash, tag: kind === 'select' ? 'select' : kind === 'fill' ? 'input' : 'a', role: kind === 'select' ? 'select' : kind === 'fill' ? 'input' : 'link',
      accessibleName: kind === 'select' ? 'History period' : kind === 'fill' ? 'Search' : 'View history', type: '', disabled: false,
      contextRole: kind === 'click' ? 'row' : null,
      contextText: kind === 'click' ? 'Everyday Checking •••• [redacted-number]' : null,
      optionLabels: kind === 'select' ? ['Last 7 days', 'Last 14 days'] : [],
    },
    action: {
      kind, purpose: kind === 'click' ? 'Open checking history' : 'Choose requested period',
      safeSelectedValue: kind === 'select' ? '7' : null, direction: null,
    },
    execution: { status, code: status === 'executed' ? 'ACTION_EXECUTED' : 'ACTION_FAILED_UNKNOWN_EFFECT', durationMs: 25 },
    after: { revision: `observation-${step}-after`, stateHash: hash, route: '/history', headings: ['Transaction history'], controlCount: 3, selectedControls: [] },
    completionCheck: { ok: kind === 'select', code: kind === 'select' ? 'COMPLETION_VERIFIED' : 'HISTORY_PERIOD_MISMATCH' },
  });
}

test('action evidence rejects unreviewed raw HTML', () => {
  const item = { ...evidence(1, 'click'), rawHtml: '<body>do not persist me</body>' };
  assert.equal(actionEvidenceSchema.safeParse(item).success, false);
});

test('persisted evidence redacts bounded context and never stores fill values', () => {
  const item = buildActionEvidence({
    runId, step: 1,
    before: {
      revision: 'observation-1-before', route: '/members', title: 'Test', headings: ['Member 12345'], visibleText: 'not persisted', stateHash: hash,
      controls: [{
        ref: 'observation-1-before:control-1', index: 0, tag: 'input', role: 'input', name: 'Search', type: 'text',
        disabled: false, value: '', options: [], contextRole: 'row', contextText: 'Alex 12345 alex@example.com', fingerprint: hash,
      }],
    },
    after: null,
    action: {
      observationRevision: 'observation-1-before', kind: 'fill', targetRef: 'observation-1-before:control-1',
      value: 'secret input', direction: null, purpose: 'Fill search', completionEvidence: [],
    },
    executionStatus: 'executed', executionCode: 'ACTION_EXECUTED', durationMs: 10, completionCheck: null,
  });
  assert.equal(item.action.safeSelectedValue, null);
  assert.equal(item.target?.contextText, 'Alex [redacted-number] [redacted-email]');
  assert.equal(JSON.stringify(item).includes('secret input'), false);
  assert.equal(JSON.stringify(item).includes('not persisted'), false);
});

test('successful evidence compiles to a strict parameterized draft artifact', () => {
  const artifact = compileTransactionHistoryArtifact({
    runId, status: 'succeeded', result: { code: 'COMPLETION_VERIFIED', message: 'done' },
    criteria: { memberId: '12345', memberName: 'Alex Morgan', accountType: 'Checking', view: 'transaction_history', period: '7' },
  }, [evidence(1, 'click'), evidence(2, 'select'), evidence(3, 'click', 'not_executed')], 'gpt-4o-mini', '2026-09-29T12:00:00.000Z');

  assert.equal(capabilityArtifactSchema.safeParse(artifact).success, true);
  assert.equal(artifact.status, 'draft');
  assert.equal(artifact.steps.length, 2);
  assert.deepEqual(artifact.source.evidenceSteps, [1, 2]);
  assert.equal(artifact.steps[0]?.target?.strategy, 'scoped_role');
  assert.deepEqual(artifact.steps[1]?.action, { kind: 'select', valueFromInput: 'period', expectedEffect: 'read' });
});

test('compiler rejects unsuccessful runs and persisted fill actions', () => {
  const run = {
    runId, status: 'failed', result: { code: 'FAILED', message: 'failed' },
    criteria: { memberId: '12345', memberName: 'Alex Morgan', accountType: 'Checking' as const, view: 'transaction_history' as const, period: '7' as const },
  };
  assert.throws(() => compileTransactionHistoryArtifact(run, [evidence(1, 'click')], 'gpt-4o-mini'), /DISCOVERY_NOT_SUCCESSFUL/);
  assert.throws(() => compileTransactionHistoryArtifact({ ...run, status: 'succeeded' }, [evidence(1, 'fill')], 'gpt-4o-mini'), /UNSUPPORTED_PERSISTED_FILL/);
  assert.throws(() => compileTransactionHistoryArtifact({ ...run, status: 'succeeded' }, [evidence(1, 'click', 'failed_unknown_effect')], 'gpt-4o-mini'), /UNKNOWN_ACTION_EFFECT_IN_EVIDENCE/);
});

test('file catalog never downgrades a validated artifact when a later draft is registered', async () => {
  const draft = compileTransactionHistoryArtifact({
    runId, status: 'succeeded', result: { code: 'COMPLETION_VERIFIED', message: 'done' },
    criteria: { memberId: '12345', memberName: 'Alex Morgan', accountType: 'Checking', view: 'transaction_history', period: '7' },
  }, [evidence(1, 'click'), evidence(2, 'select')], 'gpt-4o-mini', '2026-09-29T12:00:00.000Z');
  const directory = await mkdtemp(path.join(tmpdir(), 'capability-catalog-'));
  const database = mongoose.createConnection();
  try {
    const catalog = new CapabilityCatalog(database, directory);
    await catalog.promote(draft);
    await catalog.register(capabilityArtifactSchema.parse({ ...draft, artifactVersion: 2, status: 'draft' }));
    const reloaded = await new CapabilityCatalog(database, directory).resolve('view-transaction-history');
    assert.equal(reloaded?.status, 'validated');
    assert.equal(reloaded?.artifactVersion, 1);
  } finally {
    await database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
