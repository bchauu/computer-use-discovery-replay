import { z } from 'zod';
import { capabilityInputsSchema, successCriteriaSchema } from './discovery.ts';

const nonemptyText = z.string().trim().min(1);
const usdDisplayPattern = /^\$(?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2}$/;
const moneyValueSchema = z.object({
  display: z.string().regex(usdDisplayPattern),
  currency: z.literal('USD'),
  minorUnits: z.number().int().nonnegative(),
}).strict();

function usdMinorUnits(display: string) {
  if (!usdDisplayPattern.test(display)) return null;
  const normalized = display.slice(1).replaceAll(',', '');
  const [whole, fraction] = normalized.split('.');
  const value = Number(whole) * 100 + Number(fraction);
  return Number.isSafeInteger(value) ? value : null;
}

const transactionRowSchema = z.object({
  postedDate: nonemptyText,
  description: nonemptyText,
  reference: nonemptyText,
  status: nonemptyText,
  debit: nonemptyText.nullable(),
  credit: nonemptyText.nullable(),
  direction: z.enum(['debit', 'credit']).optional(),
  amount: moneyValueSchema.optional(),
}).strict().superRefine((row, context) => {
  const display = row.debit ?? row.credit;
  const direction = row.debit ? 'debit' : 'credit';
  const minorUnits = display ? usdMinorUnits(display) : null;
  if (Boolean(row.debit) === Boolean(row.credit)) {
    context.addIssue({ code: 'custom', message: 'A posted transaction must contain exactly one debit or credit amount.' });
  } else if (minorUnits === null) {
    context.addIssue({ code: 'custom', message: 'The transaction amount must be a supported USD display value.' });
  }
  if (row.direction && row.direction !== direction) context.addIssue({ code: 'custom', message: 'Transaction direction does not match its populated amount column.' });
  if (row.amount && (row.amount.display !== display || row.amount.currency !== 'USD' || row.amount.minorUnits !== minorUnits)) {
    context.addIssue({ code: 'custom', message: 'Normalized amount does not match its UI display value.' });
  }
}).transform(row => {
  const display = (row.debit ?? row.credit)!;
  return {
    postedDate: row.postedDate,
    description: row.description,
    reference: row.reference,
    status: row.status,
    debit: row.debit,
    credit: row.credit,
    direction: row.debit ? 'debit' as const : 'credit' as const,
    amount: { display, currency: 'USD' as const, minorUnits: usdMinorUnits(display)! },
  };
});

export const transactionOutputSchema = z.object({
  account: z.object({
    accountType: z.enum(['checking', 'savings']),
    accountLastFour: z.string().regex(/^\d{4}$/),
  }).strict(),
  transactions: z.array(transactionRowSchema),
}).strict();
export type TransactionOutput = z.infer<typeof transactionOutputSchema>;

export const telemetryEventSchema = z.object({
  eventId: z.string().uuid(),
  runId: z.string().uuid(),
  sessionId: z.string().uuid(),
  sequence: z.number().int().positive(),
  timestamp: z.string().datetime(),
  type: z.enum(['run_started', 'observation', 'model_request', 'model_response', 'retry', 'policy', 'action', 'evidence', 'artifact', 'validation', 'handoff', 'run_finished']),
  step: z.number().int().nonnegative(),
  attempt: z.number().int().positive(),
  durationMs: z.number().int().nonnegative().nullable(),
  code: nonemptyText,
  actionKind: z.enum(['click', 'fill', 'select', 'back', 'scroll', 'complete', 'request_human']).nullable(),
  targetRef: nonemptyText.nullable(),
  purpose: nonemptyText.nullable(),
  observationRevision: nonemptyText.nullable(),
  stateHash: nonemptyText.nullable(),
  model: nonemptyText.nullable(),
  providerRequestId: nonemptyText.nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
}).strict();
export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;

export const publicRunSchema = z.object({
  runId: z.string().uuid(),
  sessionId: z.string().uuid(),
  mode: z.enum(['discovery', 'validation_replay', 'replay']),
  status: z.enum(['created', 'running', 'awaiting_human', 'succeeded', 'failed', 'cancelled']),
  goalSummary: nonemptyText,
  inputs: capabilityInputsSchema,
  criteria: successCriteriaSchema,
  step: z.number().int().nonnegative(),
  maxSteps: z.number().int().positive(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  result: z.object({
    category: z.enum(['success', 'business_outcome', 'intervention', 'hard_failure', 'cancelled']),
    code: nonemptyText,
    message: nonemptyText,
    output: transactionOutputSchema.nullable(),
    diagnostic: z.object({
      phase: z.enum(['pre_action', 'target_resolution', 'action', 'checkpoint', 'recovery', 'completion', 'session']),
      stepId: nonemptyText.nullable(),
      effectState: z.enum(['not_attempted', 'attempted_effect_unknown', 'checkpoint_confirmed']),
      expected: z.object({
        routeTemplate: z.string().max(500).nullable(),
        headings: z.array(z.string().max(200)).max(10),
        targetCount: z.number().int().nonnegative().nullable(),
      }).strict(),
      observed: z.object({
        route: z.string().max(500),
        headings: z.array(z.string().max(200)).max(30),
        targetCount: z.number().int().nonnegative().nullable(),
        stateHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
      }).strict(),
      recovery: z.object({ attempted: z.boolean(), ruleId: nonemptyText.nullable(), reason: nonemptyText }).strict(),
      evidenceRef: nonemptyText,
    }).strict().nullable().default(null),
  }).strict().nullable(),
  artifact: z.object({
    artifactId: nonemptyText,
    artifactVersion: z.number().int().positive(),
    status: z.enum(['draft', 'validated', 'deprecated']),
    path: nonemptyText.nullable(),
  }).strict().nullable(),
  events: z.array(telemetryEventSchema),
}).strict();
export type PublicRunContract = z.infer<typeof publicRunSchema>;
