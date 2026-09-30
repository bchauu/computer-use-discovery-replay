import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

export const modelActionSchema = z.object({
  observationRevision: z.string().min(1),
  kind: z.enum(['click', 'fill', 'select', 'back', 'scroll', 'complete', 'request_human']),
  targetRef: z.string().nullable(),
  value: z.string().nullable(),
  direction: z.enum(['up', 'down']).nullable(),
  purpose: z.string().min(1).max(240),
  completionEvidence: z.array(z.string().max(240)).max(8),
}).strict();
export type ModelAction = z.infer<typeof modelActionSchema>;

export const startRunSchema = z.object({
  sessionId: z.string().uuid(),
  goal: z.string().trim().min(8).max(500),
}).strict();
export type StartRunInput = z.infer<typeof startRunSchema>;

export const createSessionSchema = z.object({
  targetUrl: z.string().url().optional(),
}).strict();

export const handoffEpochSchema = z.object({
  expectedEpoch: z.number().int().positive(),
}).strict();

export const humanActionSchema = z.discriminatedUnion('kind', [
  handoffEpochSchema.extend({
    kind: z.literal('fill'),
    label: z.literal('Employee PIN'),
    value: z.string().min(1).max(120),
  }).strict(),
  handoffEpochSchema.extend({
    kind: z.literal('click'),
    name: z.literal('Re-authenticate'),
  }).strict(),
]);

export const successCriteriaSchema = z.object({
  memberId: z.string().trim().min(1).max(120),
  memberName: z.string().trim().min(1).max(200),
  accountType: z.enum(['Checking', 'Savings']),
  view: z.literal('transaction_history'),
  period: z.enum(['7', '14', '30', 'latest']),
}).strict();
export type SuccessCriteria = z.infer<typeof successCriteriaSchema>;

export const capabilityInputsSchema = z.object({
  accountType: z.enum(['checking', 'savings']),
  period: z.enum(['latest', '7_days', '14_days', '30_days']),
}).strict();
export type CapabilityInputs = z.infer<typeof capabilityInputsSchema>;

export interface VerifiedMemberContext { id: string; name: string }

export function criteriaFromGoal(goal: string, member: VerifiedMemberContext): SuccessCriteria | null {
  const normalized = goal.toLowerCase();
  const accountType = normalized.includes('checking') ? 'Checking' : normalized.includes('saving') ? 'Savings' : null;
  const asksForTransactions = /transaction|history|activity/.test(normalized);
  const period = /latest|last transaction|most recent/.test(normalized)
    ? 'latest'
    : /\b7\s*(day|days)\b/.test(normalized)
      ? '7'
      : /\b14\s*(day|days)\b/.test(normalized)
        ? '14'
        : /\b30\s*(day|days)\b/.test(normalized)
          ? '30'
          : null;
  if (!accountType || !asksForTransactions || !period) return null;
  return successCriteriaSchema.parse({ memberId: member.id, memberName: member.name, accountType, view: 'transaction_history', period });
}

export function inputsFromCriteria(criteria: SuccessCriteria): CapabilityInputs {
  return capabilityInputsSchema.parse({
    accountType: criteria.accountType.toLowerCase() as 'checking' | 'savings',
    period: (criteria.period === 'latest' ? 'latest' : `${criteria.period}_days`) as 'latest' | '7_days' | '14_days' | '30_days',
  });
}

export function newId() { return randomUUID(); }
export function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
