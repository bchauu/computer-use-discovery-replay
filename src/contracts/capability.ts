import { z } from 'zod';

const boundedText = z.string().trim().min(1).max(240);
const safeNullableText = z.string().max(300).nullable();

export const evidenceObservationSchema = z.object({
  revision: boundedText,
  stateHash: z.string().regex(/^[a-f0-9]{64}$/),
  route: z.string().max(500),
  headings: z.array(z.string().max(200)).max(30),
  controlCount: z.number().int().nonnegative().max(200),
  selectedControls: z.array(z.object({ label: z.string().max(180), value: z.string().max(120) }).strict()).max(30),
}).strict();

export const targetEvidenceSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  tag: boundedText,
  role: boundedText,
  accessibleName: z.string().max(180),
  type: z.string().max(80),
  disabled: z.boolean(),
  contextRole: safeNullableText,
  contextText: safeNullableText,
  optionLabels: z.array(z.string().max(120)).max(30),
}).strict();

export const actionEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().uuid(),
  step: z.number().int().positive(),
  before: evidenceObservationSchema,
  target: targetEvidenceSchema.nullable(),
  action: z.object({
    kind: z.enum(['click', 'fill', 'select', 'back', 'scroll']),
    purpose: boundedText,
    safeSelectedValue: z.string().max(120).nullable(),
    direction: z.enum(['up', 'down']).nullable(),
  }).strict(),
  execution: z.object({
    status: z.enum(['executed', 'not_executed', 'failed_unknown_effect']),
    code: boundedText,
    durationMs: z.number().int().nonnegative(),
  }).strict(),
  after: evidenceObservationSchema.nullable(),
  completionCheck: z.object({
    ok: z.boolean(),
    code: boundedText,
  }).strict().nullable(),
}).strict();
export type ActionEvidence = z.infer<typeof actionEvidenceSchema>;

const exactNameSchema = z.object({ value: boundedText, match: z.literal('exact') }).strict();
const roleTargetSchema = z.object({
  strategy: z.literal('role'),
  role: boundedText,
  accessibleName: exactNameSchema,
  expectedCount: z.literal(1),
}).strict();
const scopedRoleTargetSchema = z.object({
  strategy: z.literal('scoped_role'),
  scope: z.object({ role: boundedText, containsInput: z.literal('accountType') }).strict(),
  role: boundedText,
  accessibleName: exactNameSchema,
  expectedCount: z.literal(1),
}).strict();
const labelTargetSchema = z.object({
  strategy: z.literal('label'),
  label: boundedText,
  expectedCount: z.literal(1),
}).strict();
export const artifactTargetSchema = z.discriminatedUnion('strategy', [roleTargetSchema, scopedRoleTargetSchema, labelTargetSchema]);

const artifactActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('click'), expectedEffect: z.literal('navigate').default('navigate') }).strict(),
  z.object({ kind: z.literal('select'), valueFromInput: z.enum(['accountType', 'period']), expectedEffect: z.literal('read').default('read') }).strict(),
  z.object({ kind: z.literal('back'), expectedEffect: z.literal('navigate').default('navigate') }).strict(),
  z.object({ kind: z.literal('scroll'), direction: z.enum(['up', 'down']), expectedEffect: z.literal('read').default('read') }).strict(),
]);

const artifactConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heading_visible'), text: boundedText }).strict(),
  z.object({ kind: z.literal('verified_member_preserved') }).strict(),
  z.object({ kind: z.literal('account_type_matches_input'), input: z.literal('accountType') }).strict(),
  z.object({ kind: z.literal('history_period_matches_input'), input: z.literal('period') }).strict(),
  z.object({ kind: z.literal('transaction_history_visible') }).strict(),
]);

const artifactStepSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  action: artifactActionSchema,
  target: artifactTargetSchema.nullable(),
  timeoutMs: z.number().int().positive().max(120_000),
  retry: z.object({
    maxAttempts: z.number().int().min(1).max(3),
    allowedWhen: z.array(z.enum(['target_not_ready', 'value_not_applied'])).max(2),
  }).strict(),
  postconditions: z.array(artifactConditionSchema).max(4),
  checkpoint: z.object({
    routeTemplate: z.string().max(500),
    requiredHeadings: z.array(z.string().max(200)).max(6),
    selectedValue: z.object({
      label: z.string().max(180),
      valueFromInput: z.enum(['accountType', 'period']),
    }).strict().nullable(),
  }).strict(),
  sourceStep: z.number().int().positive(),
}).strict();

export const capabilityArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  surface: z.object({
    kind: z.literal('browser'),
    frame: z.object({ kind: z.literal('top') }).strict(),
  }).strict().default({ kind: 'browser', frame: { kind: 'top' } }),
  artifactId: z.literal('view-transaction-history'),
  artifactVersion: z.number().int().positive(),
  status: z.enum(['draft', 'validated', 'deprecated']),
  capability: z.object({
    name: z.literal('view_transaction_history'),
    description: boundedText,
    effect: z.literal('read_only'),
  }).strict(),
  inputs: z.object({
    accountType: z.object({
      type: z.literal('enum'), required: z.literal(true), values: z.tuple([z.literal('checking'), z.literal('savings')]),
      uiValues: z.object({ checking: z.literal('Checking'), savings: z.literal('Savings') }).strict(),
    }).strict(),
    period: z.object({
      type: z.literal('enum'), required: z.literal(true),
      values: z.tuple([z.literal('latest'), z.literal('7_days'), z.literal('14_days'), z.literal('30_days')]),
      uiValues: z.object({
        latest: z.literal('Latest posted transaction'),
        '7_days': z.literal('Last 7 days'),
        '14_days': z.literal('Last 14 days'),
        '30_days': z.literal('Last 30 days'),
      }).strict(),
    }).strict(),
  }).strict(),
  preconditions: z.tuple([
    z.object({ kind: z.literal('verified_member'), expected: z.literal(true) }).strict(),
    z.object({ kind: z.literal('verified_member_count'), expected: z.literal(1) }).strict(),
  ]),
  steps: z.array(artifactStepSchema).min(1).max(40),
  outputs: z.object({
    account: z.object({ kind: z.literal('account_context'), fields: z.tuple([z.literal('accountType'), z.literal('accountLastFour')]) }).strict(),
    transactions: z.object({
      kind: z.literal('table'),
      columns: z.tuple([
        z.literal('postedDate'), z.literal('description'), z.literal('reference'),
        z.literal('status'), z.literal('debit'), z.literal('credit'),
      ]),
      pagination: z.object({
        kind: z.literal('next_button'),
        accessibleName: z.literal('Next'),
        maxPages: z.number().int().min(1).max(100),
      }).strict().default({ kind: 'next_button', accessibleName: 'Next', maxPages: 20 }),
      money: z.object({
        currency: z.literal('USD'),
        parser: z.literal('usd_display_v1'),
      }).strict().default({ currency: 'USD', parser: 'usd_display_v1' }),
    }).strict(),
  }).strict(),
  completion: z.object({
    all: z.array(artifactConditionSchema).min(1).max(8),
  }).strict(),
  limits: z.object({ maxSteps: z.number().int().positive().max(40), overallTimeoutMs: z.number().int().positive().max(900_000) }).strict(),
  source: z.object({
    kind: z.literal('discovery_run'),
    runId: z.string().uuid(),
    testedModel: boundedText,
    compiledAt: z.string().datetime(),
    evidenceSteps: z.array(z.number().int().positive()).min(1).max(40),
    discoveryInputs: z.object({
      accountType: z.enum(['checking', 'savings']),
      period: z.enum(['latest', '7_days', '14_days', '30_days']),
    }).strict(),
  }).strict(),
}).strict();
export type CapabilityArtifact = z.infer<typeof capabilityArtifactSchema>;

export const replayRequestSchema = z.object({
  sessionId: z.string().uuid(),
  artifactId: z.literal('view-transaction-history'),
  inputs: z.object({
    accountType: z.enum(['checking', 'savings']),
    period: z.enum(['latest', '7_days', '14_days', '30_days']),
  }).strict(),
}).strict();
export type ReplayRequest = z.infer<typeof replayRequestSchema>;
