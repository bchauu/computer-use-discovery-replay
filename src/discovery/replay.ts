import type { Locator, Page } from 'playwright';
import type { CapabilityArtifact } from '../contracts/capability.ts';
import type { SuccessCriteria } from '../contracts/discovery.ts';
import { newId } from '../contracts/discovery.ts';
import { transactionOutputSchema } from '../contracts/run.ts';
import { CapabilityCatalog } from './catalog.ts';
import { verifyCompletion } from './completion.ts';
import { observe } from './observer.ts';
import type { LiveSession } from './sessions.ts';
import { eventInput, RunTelemetry } from './telemetry.ts';
import { evaluateReplayPolicy } from './policy.ts';
import { classifyRuntime, failureDiagnostic } from './runtime.ts';
import type { CapabilityInputs, ExecutionMode, PublicRun, RunResultCategory, TransactionOutput } from './types.ts';
import type { Connection } from 'mongoose';

type ArtifactStep = CapabilityArtifact['steps'][number];

function inputLabel(artifact: CapabilityArtifact, inputs: CapabilityInputs, key: 'accountType' | 'period') {
  return key === 'accountType'
    ? artifact.inputs.accountType.uiValues[inputs.accountType]
    : artifact.inputs.period.uiValues[inputs.period];
}

function routeMatches(template: string, actual: string, criteria: SuccessCriteria) {
  const pieces = template.split(/(\{verifiedMemberId\}|\{selectedAccountId\})/g);
  const expression = pieces.map(piece => {
    if (piece === '{verifiedMemberId}') return criteria.memberId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (piece === '{selectedAccountId}') return '[^/#]+';
    return piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return new RegExp(`^${expression}$`).test(actual);
}

async function resolveTarget(page: Page, artifact: CapabilityArtifact, inputs: CapabilityInputs, step: ArtifactStep): Promise<{ locator: Locator | null; code: string; count: number | null }> {
  const target = step.target;
  if (!target) return { locator: null, code: 'TARGET_NOT_REQUIRED', count: null };
  let locator: Locator;
  if (target.strategy === 'label') {
    locator = page.getByLabel(target.label, { exact: true });
  } else if (target.strategy === 'role') {
    locator = page.getByRole(target.role as Parameters<Page['getByRole']>[0], { name: target.accessibleName.value, exact: true });
  } else {
    const scopeText = inputLabel(artifact, inputs, target.scope.containsInput);
    const scope = page.getByRole(target.scope.role as Parameters<Page['getByRole']>[0]).filter({ hasText: scopeText });
    const scopeCount = await scope.count();
    if (scopeCount !== 1) return { locator: null, code: scopeCount ? 'SCOPE_AMBIGUOUS' : 'SCOPE_MISSING', count: scopeCount };
    locator = scope.getByRole(target.role as Parameters<Page['getByRole']>[0], { name: target.accessibleName.value, exact: true });
  }
  const count = await locator.count();
  return count === 1
    ? { locator, code: 'TARGET_RESOLVED', count }
    : { locator: null, code: count === 0 ? 'TARGET_MISSING' : 'TARGET_AMBIGUOUS', count };
}

async function verifyCheckpoint(page: Page, artifact: CapabilityArtifact, inputs: CapabilityInputs, criteria: SuccessCriteria, step: ArtifactStep) {
  const route = await page.evaluate(() => `${location.pathname}${location.hash}`);
  if (!routeMatches(step.checkpoint.routeTemplate, route, criteria)) return { ok: false, code: 'CHECKPOINT_ROUTE_MISMATCH' };
  for (const heading of step.checkpoint.requiredHeadings) {
    if (await page.getByRole('heading', { name: heading, exact: true }).count() !== 1) return { ok: false, code: 'CHECKPOINT_HEADING_MISMATCH' };
  }
  if (step.checkpoint.selectedValue) {
    const selected = page.getByLabel(step.checkpoint.selectedValue.label, { exact: true }).locator('option:checked');
    const actual = (await selected.textContent().catch(() => null))?.trim() ?? null;
    const expected = inputLabel(artifact, inputs, step.checkpoint.selectedValue.valueFromInput);
    if (actual !== expected) return { ok: false, code: 'CHECKPOINT_SELECTED_VALUE_MISMATCH' };
  }
  return { ok: true, code: 'CHECKPOINT_VERIFIED' };
}

async function waitForCheckpoint(page: Page, artifact: CapabilityArtifact, inputs: CapabilityInputs, criteria: SuccessCriteria, step: ArtifactStep) {
  const deadline = Date.now() + Math.min(step.timeoutMs, 5000);
  let result = await verifyCheckpoint(page, artifact, inputs, criteria, step);
  while (!result.ok && Date.now() < deadline) {
    await page.waitForTimeout(100);
    result = await verifyCheckpoint(page, artifact, inputs, criteria, step);
  }
  return result;
}

async function waitForStepOutcome(page: Page, artifact: CapabilityArtifact, inputs: CapabilityInputs, criteria: SuccessCriteria, step: ArtifactStep) {
  const deadline = Date.now() + Math.min(step.timeoutMs, 5000);
  let checkpoint = await verifyCheckpoint(page, artifact, inputs, criteria, step);
  while (!checkpoint.ok) {
    const condition = await classifyRuntime(page);
    if (condition.kind !== 'ready' && condition.kind !== 'loading') return { checkpoint, condition };
    if (Date.now() >= deadline) return { checkpoint, condition };
    await page.waitForTimeout(100);
    checkpoint = await verifyCheckpoint(page, artifact, inputs, criteria, step);
  }
  return { checkpoint, condition: { kind: 'ready', code: 'READY' } as const };
}

async function extractOutput(page: Page, inputs: CapabilityInputs): Promise<TransactionOutput> {
  const heading = await page.locator('h1').first().innerText();
  const accountLastFour = heading.match(/(\d{4})\s*$/)?.[1] ?? '';
  if (!accountLastFour) throw new Error('ACCOUNT_OUTPUT_MISSING');
  const transactions = await page.locator('table tbody tr').evaluateAll(rows => rows.map(row => {
    const cells = Array.from(row.querySelectorAll('td'));
    const description = cells[1]?.querySelector('strong')?.textContent?.trim() ?? '';
    const reference = cells[1]?.querySelector('small')?.textContent?.trim() ?? '';
    const value = (index: number) => cells[index]?.textContent?.trim() ?? '';
    return {
      postedDate: value(0), description, reference, status: value(2),
      debit: value(3) === '—' ? null : value(3), credit: value(4) === '—' ? null : value(4),
    };
  }));
  if (transactions.some(row => !row.postedDate || !row.description || !row.reference || !row.status)) throw new Error('TRANSACTION_OUTPUT_INCOMPLETE');
  return transactionOutputSchema.parse({ account: { accountType: inputs.accountType, accountLastFour }, transactions });
}

export class ReplayController {
  readonly runs = new Map<string, PublicRun>();
  private readonly database: Connection;
  private readonly catalog: CapabilityCatalog;
  private readonly cancelRequested = new Set<string>();
  private readonly handoffs = new Map<string, {
    session: LiveSession;
    telemetry: RunTelemetry;
    step: ArtifactStep;
    artifact: CapabilityArtifact;
    resolve: (outcome: 'resumed' | 'cancelled' | 'timeout') => void;
    timer: ReturnType<typeof setTimeout>;
    claimed: boolean;
  }>();

  constructor(database: Connection, catalog: CapabilityCatalog) {
    this.database = database;
    this.catalog = catalog;
  }

  start(session: LiveSession, artifact: CapabilityArtifact, inputs: CapabilityInputs, criteria: SuccessCriteria, mode: Exclude<ExecutionMode, 'discovery'>) {
    if (session.activeRunId) throw new Error('SESSION_BUSY');
    const run: PublicRun = {
      runId: newId(), sessionId: session.sessionId, mode, status: 'created', inputs, criteria,
      goalSummary: `${criteria.accountType} transaction history · ${criteria.period === 'latest' ? 'latest posted' : `last ${criteria.period} days`}`,
      step: 0, maxSteps: artifact.limits.maxSteps, startedAt: new Date().toISOString(), finishedAt: null,
      result: null,
      artifact: { artifactId: artifact.artifactId, artifactVersion: artifact.artifactVersion, status: artifact.status, path: null },
      events: [],
    };
    this.runs.set(run.runId, run);
    session.activeRunId = run.runId;
    session.owner = 'automation';
    session.epoch += 1;
    void this.execute(run, session, artifact).finally(() => {
      this.cancelRequested.delete(run.runId);
      session.activeRunId = null;
      if (session.owner === 'automation') { session.owner = 'human'; session.epoch += 1; }
    });
    return run;
  }

  cancel(runId: string, session: LiveSession) {
    const run = this.runs.get(runId);
    if (!run || run.sessionId !== session.sessionId) return 'not_found' as const;
    if (!['created', 'running', 'awaiting_human'].includes(run.status)) return 'not_running' as const;
    this.cancelRequested.add(runId);
    const handoff = this.handoffs.get(runId);
    if (handoff) {
      clearTimeout(handoff.timer);
      this.handoffs.delete(runId);
      handoff.resolve('cancelled');
    }
    return 'accepted' as const;
  }

  async claimHandoff(runId: string, session: LiveSession) {
    const run = this.runs.get(runId);
    const handoff = this.handoffs.get(runId);
    if (!run || !handoff || handoff.session !== session || run.status !== 'awaiting_human') return { result: 'not_available' as const };
    if (handoff.claimed || session.owner !== 'automation') return { result: 'already_claimed' as const };
    handoff.claimed = true;
    session.owner = 'human';
    session.epoch += 1;
    await handoff.telemetry.record(eventInput('handoff', 'HUMAN_CONTROL_CLAIMED', run.step));
    return { result: 'accepted' as const, epoch: session.epoch };
  }

  async executeHumanAction(runId: string, session: LiveSession, expectedEpoch: number, command: {
    kind: 'fill' | 'click'; label?: string; name?: string; value?: string;
  }) {
    const run = this.runs.get(runId);
    const handoff = this.handoffs.get(runId);
    if (!run || !handoff || handoff.session !== session || !handoff.claimed || run.status !== 'awaiting_human') return 'not_available' as const;
    if (session.owner !== 'human' || session.epoch !== expectedEpoch) return 'stale_epoch' as const;
    if (command.kind === 'fill') {
      if (command.label !== 'Employee PIN' || !command.value || command.value.length > 120) return 'command_denied' as const;
      const target = session.page.getByLabel(command.label, { exact: true });
      if (await target.count() !== 1) return 'target_invalid' as const;
      await target.fill(command.value);
      await handoff.telemetry.record(eventInput('handoff', 'HUMAN_SENSITIVE_FILL_EXECUTED', run.step, {
        actionKind: 'fill', targetRef: 'label:Employee PIN', purpose: 'Human entered a sensitive reauthentication value.',
      }));
      return 'accepted' as const;
    }
    if (command.name !== 'Re-authenticate') return 'command_denied' as const;
    const target = session.page.getByRole('button', { name: command.name, exact: true });
    if (await target.count() !== 1) return 'target_invalid' as const;
    await target.click();
    await handoff.telemetry.record(eventInput('handoff', 'HUMAN_CLICK_EXECUTED', run.step, {
      actionKind: 'click', targetRef: 'button:Re-authenticate', purpose: 'Human submitted reauthentication.',
    }));
    return 'accepted' as const;
  }

  async resumeHandoff(runId: string, session: LiveSession, expectedEpoch: number) {
    const run = this.runs.get(runId);
    const handoff = this.handoffs.get(runId);
    if (!run || !handoff || handoff.session !== session || !handoff.claimed || run.status !== 'awaiting_human') return 'not_available' as const;
    if (session.owner !== 'human' || session.epoch !== expectedEpoch) return 'stale_epoch' as const;
    const checkpoint = await verifyCheckpoint(session.page, handoff.artifact, run.inputs, run.criteria, handoff.step);
    if (!checkpoint.ok) {
      await handoff.telemetry.record(eventInput('handoff', 'RESUME_CHECKPOINT_REJECTED', run.step));
      return 'checkpoint_failed' as const;
    }
    clearTimeout(handoff.timer);
    this.handoffs.delete(runId);
    session.owner = 'automation';
    session.epoch += 1;
    run.status = 'running';
    run.result = null;
    await handoff.telemetry.record(eventInput('handoff', 'AUTOMATION_CONTROL_RESUMED', run.step));
    handoff.resolve('resumed');
    return 'accepted' as const;
  }

  private async requestHandoff(run: PublicRun, session: LiveSession, telemetry: RunTelemetry, artifact: CapabilityArtifact, step: ArtifactStep) {
    run.status = 'awaiting_human';
    run.result = {
      category: 'intervention', code: 'REAUTHENTICATION_REQUIRED',
      message: 'The employee session expired. Claim this live session, re-authenticate, and resume.', output: null, diagnostic: null,
    };
    const outcome = new Promise<'resumed' | 'cancelled' | 'timeout'>(resolve => {
      const timer = setTimeout(() => {
        this.handoffs.delete(run.runId);
        resolve('timeout');
      }, 300_000);
      this.handoffs.set(run.runId, { session, telemetry, step, artifact, resolve, timer, claimed: false });
    });
    await telemetry.record(eventInput('handoff', 'REAUTHENTICATION_REQUIRED', run.step));
    return outcome;
  }

  private async execute(run: PublicRun, session: LiveSession, artifact: CapabilityArtifact) {
    const telemetry = new RunTelemetry(run, this.database);
    const deadline = Date.now() + artifact.limits.overallTimeoutMs;
    run.status = 'running';
    await telemetry.record(eventInput('run_started', run.mode === 'replay' ? 'REPLAY_STARTED' : 'VALIDATION_REPLAY_STARTED', 0));
    try {
      for (const [index, step] of artifact.steps.entries()) {
        run.step = index + 1;
        if (this.cancelRequested.has(run.runId)) return await this.finish(run, telemetry, 'cancelled', 'RUN_CANCELLED', 'Replay was cancelled.', null);
        if (Date.now() >= deadline) return await this.finish(run, telemetry, 'failed', 'RUN_TIMEOUT', 'Replay exceeded its configured timeout.', null);
        if (session.owner !== 'automation' || session.activeRunId !== run.runId) return await this.finish(run, telemetry, 'failed', 'OWNERSHIP_LOST', 'Automation no longer owns this session.', null);
        if (new URL(session.page.url()).origin !== session.allowedOrigin) return await this.finish(run, telemetry, 'failed', 'ORIGIN_BLOCKED', 'The browser left the allowed target origin.', null);

        let completed = false;
        for (let attempt = 1; attempt <= step.retry.maxAttempts; attempt += 1) {
          let precondition = await classifyRuntime(session.page);
          if (precondition.kind === 'loading') {
            await telemetry.record(eventInput('retry', 'WAITING_FOR_LOADING_STATE', run.step, { attempt }));
            const loadingDeadline = Date.now() + Math.min(step.timeoutMs, 5000);
            while (precondition.kind === 'loading' && Date.now() < loadingDeadline) {
              await session.page.waitForTimeout(100);
              precondition = await classifyRuntime(session.page);
            }
          }
          if (precondition.kind === 'recoverable' && precondition.code === 'KNOWN_NOTICE') {
            const dismiss = session.page.getByRole('button', { name: 'Dismiss notice', exact: true });
            if (await dismiss.count() !== 1) {
              const diagnostic = await failureDiagnostic({ run, page: session.page, phase: 'recovery', stepId: step.id, effectState: 'not_attempted', routeTemplate: step.checkpoint.routeTemplate, expectedHeadings: step.checkpoint.requiredHeadings, recoveryAttempted: false, recoveryRuleId: precondition.ruleId, recoveryReason: 'The known notice did not expose its exact policy-approved dismissal control.' });
              return await this.finish(run, telemetry, 'failed', 'RECOVERY_TARGET_INVALID', 'The known notice could not be dismissed safely.', null, 'hard_failure', diagnostic);
            }
            await telemetry.record(eventInput('policy', 'AUTHORED_RECOVERY_ALLOWED', run.step, { attempt, actionKind: 'click', targetRef: 'button:Dismiss notice', purpose: 'Dismiss the versioned known notice.' }));
            await dismiss.click({ timeout: step.timeoutMs });
            await telemetry.record(eventInput('action', 'AUTHORED_RECOVERY_EXECUTED', run.step, { attempt, actionKind: 'click', targetRef: 'button:Dismiss notice', purpose: 'Dismiss the versioned known notice.' }));
            precondition = await classifyRuntime(session.page);
          }
          if (precondition.kind === 'intervention') {
            const diagnostic = await failureDiagnostic({ run, page: session.page, phase: 'pre_action', stepId: step.id, effectState: 'not_attempted', routeTemplate: step.checkpoint.routeTemplate, expectedHeadings: step.checkpoint.requiredHeadings, recoveryReason: precondition.resumable ? 'Human intervention is required.' : 'No safe automated recovery is declared.' });
            return await this.finish(run, telemetry, 'awaiting_human', precondition.code, 'Replay encountered a state that requires human intervention.', null, 'intervention', diagnostic);
          }
          if (precondition.kind === 'hard_failure' || precondition.kind === 'loading') {
            const code = precondition.kind === 'loading' ? 'LOADING_TIMEOUT' : precondition.code;
            const diagnostic = await failureDiagnostic({ run, page: session.page, phase: 'pre_action', stepId: step.id, effectState: 'not_attempted', routeTemplate: step.checkpoint.routeTemplate, expectedHeadings: step.checkpoint.requiredHeadings, recoveryAttempted: precondition.kind === 'loading', recoveryReason: precondition.kind === 'loading' ? 'The bounded wait expired.' : 'The application reported a terminal error.' });
            return await this.finish(run, telemetry, 'failed', code, 'Replay could not safely begin the next action.', null, 'hard_failure', diagnostic);
          }
          const before = await observe(session.page, `replay-${run.step}-${attempt}-before`);
          await telemetry.record(eventInput('observation', 'OBSERVATION_CAPTURED', run.step, { attempt, observationRevision: before.revision, stateHash: before.stateHash }));
          const resolved = await resolveTarget(session.page, artifact, run.inputs, step);
          await telemetry.record(eventInput('validation', resolved.code, run.step, { attempt, observationRevision: before.revision, stateHash: before.stateHash, actionKind: step.action.kind }));
          if (step.target && !resolved.locator) {
            const accountAbsent = resolved.code === 'SCOPE_MISSING' && step.target.strategy === 'scoped_role'
              && await session.page.getByRole('heading', { name: 'Transaction inquiry', exact: true }).count() === 1;
            if (accountAbsent) {
              const diagnostic = await failureDiagnostic({ run, page: session.page, phase: 'target_resolution', stepId: step.id, effectState: 'not_attempted', routeTemplate: step.checkpoint.routeTemplate, expectedHeadings: step.checkpoint.requiredHeadings, targetCount: 0, recoveryReason: 'The verified member has no account matching the requested account type.' });
              return await this.finish(run, telemetry, 'succeeded', 'ACCOUNT_NOT_FOUND', 'The verified member has no requested account.', null, 'business_outcome', diagnostic);
            }
            if (resolved.code === 'TARGET_MISSING' && step.retry.allowedWhen.includes('target_not_ready') && attempt < step.retry.maxAttempts) { await session.page.waitForTimeout(250); continue; }
            const diagnostic = await failureDiagnostic({ run, page: session.page, phase: 'target_resolution', stepId: step.id, effectState: 'not_attempted', routeTemplate: step.checkpoint.routeTemplate, expectedHeadings: step.checkpoint.requiredHeadings, targetCount: resolved.count, recoveryReason: resolved.code.includes('AMBIGUOUS') ? 'Ambiguous targets are never selected speculatively.' : 'No declared safe recovery matched the missing target.' });
            return await this.finish(run, telemetry, 'failed', resolved.code, `Replay could not resolve the target for ${step.id}.`, null, 'hard_failure', diagnostic);
          }

          const policy = await evaluateReplayPolicy(session.page, resolved.locator, step, session.allowedOrigin, artifact.surface);
          await telemetry.record(eventInput('policy', policy.code, run.step, { attempt, actionKind: step.action.kind, purpose: `${policy.message} Policy ${policy.version}.` }));
          if (!policy.ok) {
            const diagnostic = await failureDiagnostic({ run, page: session.page, phase: 'action', stepId: step.id, effectState: 'not_attempted', routeTemplate: step.checkpoint.routeTemplate, expectedHeadings: step.checkpoint.requiredHeadings, targetCount: resolved.count, recoveryReason: policy.message });
            return await this.finish(run, telemetry, 'failed', policy.code, 'Replay policy denied the action.', null, 'hard_failure', diagnostic);
          }
          const executionEpoch = session.epoch;
          const started = performance.now();
          try {
            if (step.action.kind === 'click') await resolved.locator!.click({ timeout: step.timeoutMs });
            else if (step.action.kind === 'select') {
              await resolved.locator!.selectOption({ label: inputLabel(artifact, run.inputs, step.action.valueFromInput) }, { timeout: step.timeoutMs });
            } else if (step.action.kind === 'back') await session.page.goBack({ waitUntil: 'domcontentloaded', timeout: step.timeoutMs });
            else await session.page.mouse.wheel(0, step.action.direction === 'down' ? 700 : -700);
          } catch (error) {
            const diagnostic = await failureDiagnostic({ run, page: session.page, phase: 'action', stepId: step.id, effectState: 'attempted_effect_unknown', routeTemplate: step.checkpoint.routeTemplate, expectedHeadings: step.checkpoint.requiredHeadings, targetCount: resolved.count, recoveryReason: 'The action threw after dispatch; its effect is unknown, so replay will not repeat it.' });
            const lost = /target page|browser.*closed|context.*closed/i.test(error instanceof Error ? error.message : '');
            return await this.finish(run, telemetry, 'failed', lost ? 'SESSION_LOST' : 'ACTION_EFFECT_UNKNOWN', lost ? 'The managed browser session became unavailable.' : 'Replay stopped because an action may already have taken effect.', null, 'hard_failure', diagnostic);
          }
          await telemetry.record(eventInput('action', 'ACTION_EXECUTED', run.step, { attempt, durationMs: Math.round(performance.now() - started), actionKind: step.action.kind }));
          if (this.cancelRequested.has(run.runId)) return await this.finish(run, telemetry, 'cancelled', 'RUN_CANCELLED', 'Replay was cancelled after the current action settled.', null, 'cancelled');
          if (session.owner !== 'automation' || session.epoch !== executionEpoch || session.activeRunId !== run.runId) {
            const diagnostic = await failureDiagnostic({ run, page: session.page, phase: 'action', stepId: step.id, effectState: 'attempted_effect_unknown', routeTemplate: step.checkpoint.routeTemplate, expectedHeadings: step.checkpoint.requiredHeadings, recoveryReason: 'Ownership changed while the action was pending; no subsequent action is permitted.' });
            return await this.finish(run, telemetry, 'failed', 'OWNERSHIP_CHANGED_DURING_ACTION', 'Replay lost its execution lease while an action was pending.', null, 'hard_failure', diagnostic);
          }

          let outcome = await waitForStepOutcome(session.page, artifact, run.inputs, run.criteria, step);
          if (this.cancelRequested.has(run.runId)) return await this.finish(run, telemetry, 'cancelled', 'RUN_CANCELLED', 'Replay was cancelled while waiting for the step checkpoint.', null, 'cancelled');
          if (outcome.condition.kind === 'recoverable' && outcome.condition.code === 'KNOWN_NOTICE') {
            const dismiss = session.page.getByRole('button', { name: 'Dismiss notice', exact: true });
            if (await dismiss.count() === 1) {
              await telemetry.record(eventInput('policy', 'AUTHORED_RECOVERY_ALLOWED', run.step, { attempt, actionKind: 'click', targetRef: 'button:Dismiss notice' }));
              await dismiss.click({ timeout: step.timeoutMs });
              await telemetry.record(eventInput('action', 'AUTHORED_RECOVERY_EXECUTED', run.step, { attempt, actionKind: 'click', targetRef: 'button:Dismiss notice' }));
              outcome = await waitForStepOutcome(session.page, artifact, run.inputs, run.criteria, step);
            }
          }
          const checkpoint = outcome.checkpoint;
          await telemetry.record(eventInput('validation', checkpoint.code, run.step, { attempt, actionKind: step.action.kind }));
          if (checkpoint.ok) { completed = true; break; }
          if (outcome.condition.kind === 'intervention' && outcome.condition.code === 'SESSION_EXPIRED') {
            const handoff = await this.requestHandoff(run, session, telemetry, artifact, step);
            if (handoff === 'cancelled') return await this.finish(run, telemetry, 'cancelled', 'RUN_CANCELLED', 'Replay was cancelled during human intervention.', null);
            if (handoff === 'timeout') return await this.finish(run, telemetry, 'failed', 'HANDOFF_TIMEOUT', 'Human intervention did not complete before its timeout.', null);
            const resumedCheckpoint = await waitForCheckpoint(session.page, artifact, run.inputs, run.criteria, step);
            await telemetry.record(eventInput('validation', resumedCheckpoint.code, run.step, { attempt, actionKind: step.action.kind }));
            if (resumedCheckpoint.ok) { completed = true; break; }
            return await this.finish(run, telemetry, 'failed', resumedCheckpoint.code, `Replay could not verify the resume checkpoint for ${step.id}.`, null);
          }
          if (outcome.condition.kind === 'intervention') {
            const diagnostic = await failureDiagnostic({ run, page: session.page, phase: 'checkpoint', stepId: step.id, effectState: 'attempted_effect_unknown', routeTemplate: step.checkpoint.routeTemplate, expectedHeadings: step.checkpoint.requiredHeadings, recoveryReason: outcome.condition.resumable ? 'Human intervention is required.' : 'No safe automated recovery is declared.' });
            return await this.finish(run, telemetry, 'awaiting_human', outcome.condition.code, 'Replay encountered a state requiring human intervention.', null, 'intervention', diagnostic);
          }
          if (outcome.condition.kind === 'hard_failure') {
            const diagnostic = await failureDiagnostic({ run, page: session.page, phase: 'checkpoint', stepId: step.id, effectState: 'attempted_effect_unknown', routeTemplate: step.checkpoint.routeTemplate, expectedHeadings: step.checkpoint.requiredHeadings, recoveryReason: 'The application reported a terminal error after the action.' });
            return await this.finish(run, telemetry, 'failed', outcome.condition.code, 'The application entered a terminal error state.', null, 'hard_failure', diagnostic);
          }
          if (checkpoint.code === 'CHECKPOINT_SELECTED_VALUE_MISMATCH' && step.retry.allowedWhen.includes('value_not_applied') && attempt < step.retry.maxAttempts) continue;
          const diagnostic = await failureDiagnostic({ run, page: session.page, phase: 'checkpoint', stepId: step.id, effectState: 'attempted_effect_unknown', routeTemplate: step.checkpoint.routeTemplate, expectedHeadings: step.checkpoint.requiredHeadings, recoveryReason: 'The expected checkpoint did not appear within the bounded wait.' });
          return await this.finish(run, telemetry, 'failed', checkpoint.code, `Replay diverged after ${step.id}.`, null, 'hard_failure', diagnostic);
        }
        if (!completed) return await this.finish(run, telemetry, 'failed', 'STEP_ATTEMPTS_EXHAUSTED', `Replay exhausted attempts for ${step.id}.`, null);
      }

      await telemetry.record(eventInput('validation', 'FINAL_VALIDATION_STARTED', run.step));
      const completion = await verifyCompletion(session.page, run.criteria);
      await telemetry.record(eventInput('validation', completion.code, run.step));
      if (!completion.ok) return await this.finish(run, telemetry, 'failed', completion.code, completion.message, null);
      await telemetry.record(eventInput('validation', 'OUTPUT_EXTRACTION_STARTED', run.step));
      const output = await extractOutput(session.page, run.inputs);
      await telemetry.record(eventInput('validation', 'OUTPUT_EXTRACTION_COMPLETE', run.step));
      const category = output.transactions.length ? 'success' : 'business_outcome';
      const code = output.transactions.length ? 'REPLAY_SUCCEEDED' : 'NO_TRANSACTIONS';
      if (run.mode === 'validation_replay') {
        const differs = artifact.source.discoveryInputs.accountType !== run.inputs.accountType || artifact.source.discoveryInputs.period !== run.inputs.period;
        if (differs) {
          const validated = await this.catalog.promote(artifact);
          run.artifact = { artifactId: validated.artifactId, artifactVersion: validated.artifactVersion, status: validated.status, path: null };
          await telemetry.record(eventInput('artifact', 'ARTIFACT_VALIDATED', run.step));
        }
      }
      return await this.finish(run, telemetry, 'succeeded', code, completion.message, output, category);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const code = /target page|browser.*closed|context.*closed/i.test(message) ? 'SESSION_LOST' : 'REPLAY_FAILED';
      const diagnostic = await failureDiagnostic({ run, page: session.page, phase: 'session', stepId: artifact.steps[run.step - 1]?.id ?? null, effectState: 'attempted_effect_unknown', routeTemplate: artifact.steps[run.step - 1]?.checkpoint.routeTemplate ?? null, expectedHeadings: artifact.steps[run.step - 1]?.checkpoint.requiredHeadings ?? [], recoveryReason: code === 'SESSION_LOST' ? 'The live browser session was lost; replay never restarts it blindly.' : 'An unclassified execution error stopped replay.' });
      return await this.finish(run, telemetry, 'failed', code, code === 'SESSION_LOST' ? 'The managed browser session became unavailable.' : 'Replay stopped after an execution error.', null, 'hard_failure', diagnostic);
    }
  }

  private async finish(
    run: PublicRun,
    telemetry: RunTelemetry,
    status: 'succeeded' | 'failed' | 'cancelled' | 'awaiting_human',
    code: string,
    message: string,
    output: TransactionOutput | null,
    category?: RunResultCategory,
    diagnostic: NonNullable<PublicRun['result']>['diagnostic'] = null,
  ) {
    run.status = status;
    run.finishedAt = new Date().toISOString();
    run.result = {
      category: category ?? (status === 'cancelled' ? 'cancelled' : status === 'succeeded' ? 'success' : status === 'awaiting_human' ? 'intervention' : 'hard_failure'),
      code, message, output,
      diagnostic,
    };
    await telemetry.record(eventInput('run_finished', code, run.step));
  }
}
