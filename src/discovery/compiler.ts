import { capabilityArtifactSchema } from '../contracts/capability.ts';
import type { ActionEvidence, CapabilityArtifact } from '../contracts/capability.ts';
import type { SuccessCriteria } from '../contracts/discovery.ts';
import { inputsFromCriteria } from '../contracts/discovery.ts';

interface SuccessfulRunSource {
  runId: string;
  status: string;
  criteria: SuccessCriteria;
  result: { code: string; message: string } | null;
}

function selectBinding(item: ActionEvidence) {
  const label = item.target?.accessibleName.toLowerCase() ?? '';
  if (label.includes('account type')) return 'accountType' as const;
  if (label.includes('history period')) return 'period' as const;
  throw new Error(`SELECT_BINDING_UNKNOWN:${item.step}`);
}

function routeTemplate(route: string, criteria: SuccessCriteria) {
  return route
    .replace(criteria.memberId, '{verifiedMemberId}')
    .replace(/\/accounts\/[^/#]+/, '/accounts/{selectedAccountId}');
}

function compileTarget(item: ActionEvidence, criteria: SuccessCriteria) {
  if (item.action.kind === 'back' || item.action.kind === 'scroll') return null;
  if (!item.target || !item.target.accessibleName) throw new Error(`EVIDENCE_TARGET_MISSING:${item.step}`);
  if (item.action.kind === 'select') {
    return { strategy: 'label', label: item.target.accessibleName, expectedCount: 1 };
  }
  const contextHasAccountType = item.target.contextText?.toLowerCase().includes(criteria.accountType.toLowerCase());
  if (contextHasAccountType && item.target.contextRole) {
    return {
      strategy: 'scoped_role',
      scope: { role: item.target.contextRole, containsInput: 'accountType' },
      role: item.target.role,
      accessibleName: { value: item.target.accessibleName, match: 'exact' },
      expectedCount: 1,
    };
  }
  return {
    strategy: 'role', role: item.target.role,
    accessibleName: { value: item.target.accessibleName, match: 'exact' }, expectedCount: 1,
  };
}

export function compileTransactionHistoryArtifact(
  run: SuccessfulRunSource,
  evidence: ActionEvidence[],
  testedModel: string,
  compiledAt = new Date().toISOString(),
): CapabilityArtifact {
  if (run.status !== 'succeeded' || !run.result) throw new Error('DISCOVERY_NOT_SUCCESSFUL');
  const executed = evidence.filter(item => item.execution.status === 'executed');
  if (!executed.length) throw new Error('NO_EXECUTED_EVIDENCE');
  if (executed.some(item => item.runId !== run.runId)) throw new Error('EVIDENCE_RUN_MISMATCH');
  if (executed.some(item => !item.after)) throw new Error('POST_ACTION_EVIDENCE_MISSING');
  if (executed.some(item => item.action.kind === 'fill')) throw new Error('UNSUPPORTED_PERSISTED_FILL');
  const discoveryInputs = inputsFromCriteria(run.criteria);

  const steps = executed.map((item, index) => {
    const newHeadings = item.after?.headings.filter(heading => !item.before.headings.includes(heading)) ?? [];
    const newHeading = newHeadings.find(heading => heading === 'Posted transaction history')
      ?? newHeadings.find(heading => !heading.includes('[redacted-'));
    const binding = item.action.kind === 'select' ? selectBinding(item) : null;
    const action = item.action.kind === 'select'
      ? { kind: 'select', valueFromInput: binding }
      : item.action.kind === 'scroll'
        ? { kind: 'scroll', direction: item.action.direction }
        : { kind: item.action.kind };
    return {
      id: `step_${index + 1}_${item.action.kind}`,
      action,
      target: compileTarget(item, run.criteria),
      timeoutMs: 30_000,
      retry: {
        maxAttempts: 2,
        allowedWhen: item.action.kind === 'select' ? ['target_not_ready', 'value_not_applied'] : ['target_not_ready'],
      },
      postconditions: newHeading ? [{ kind: 'heading_visible', text: newHeading }] : [],
      checkpoint: {
        routeTemplate: routeTemplate(item.after!.route, run.criteria),
        requiredHeadings: newHeading ? [newHeading] : [],
        selectedValue: binding && item.target
          ? { label: item.target.accessibleName, valueFromInput: binding }
          : null,
      },
      sourceStep: item.step,
    };
  });

  return capabilityArtifactSchema.parse({
    schemaVersion: 1,
    artifactId: 'view-transaction-history',
    artifactVersion: 1,
    status: 'draft',
    capability: {
      name: 'view_transaction_history',
      description: 'Open transaction history for an account belonging to the currently verified member.',
      effect: 'read_only',
    },
    inputs: {
      accountType: {
        type: 'enum', required: true, values: ['checking', 'savings'],
        uiValues: { checking: 'Checking', savings: 'Savings' },
      },
      period: {
        type: 'enum', required: true, values: ['latest', '7_days', '14_days', '30_days'],
        uiValues: {
          latest: 'Latest posted transaction', '7_days': 'Last 7 days',
          '14_days': 'Last 14 days', '30_days': 'Last 30 days',
        },
      },
    },
    preconditions: [
      { kind: 'verified_member', expected: true },
      { kind: 'verified_member_count', expected: 1 },
    ],
    steps,
    outputs: {
      account: { kind: 'account_context', fields: ['accountType', 'accountLastFour'] },
      transactions: { kind: 'table', columns: ['postedDate', 'description', 'reference', 'status', 'debit', 'credit'] },
    },
    completion: {
      all: [
        { kind: 'verified_member_preserved' },
        { kind: 'account_type_matches_input', input: 'accountType' },
        { kind: 'history_period_matches_input', input: 'period' },
        { kind: 'transaction_history_visible' },
      ],
    },
    limits: { maxSteps: Math.min(40, Math.max(steps.length + 3, 8)), overallTimeoutMs: 300_000 },
    source: {
      kind: 'discovery_run', runId: run.runId, testedModel, compiledAt,
      evidenceSteps: executed.map(item => item.step),
      discoveryInputs,
    },
  });
}
