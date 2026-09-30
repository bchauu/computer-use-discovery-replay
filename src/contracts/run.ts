import { z } from 'zod';
import { capabilityInputsSchema, successCriteriaSchema } from './discovery.ts';

const nonemptyText = z.string().trim().min(1);

export const transactionOutputSchema = z.object({
  account: z.object({
    accountType: z.enum(['checking', 'savings']),
    accountLastFour: z.string().regex(/^\d{4}$/),
  }).strict(),
  transactions: z.array(z.object({
    postedDate: nonemptyText,
    description: nonemptyText,
    reference: nonemptyText,
    status: nonemptyText,
    debit: nonemptyText.nullable(),
    credit: nonemptyText.nullable(),
  }).strict()),
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
