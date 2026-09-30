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
  const accountMatches = [
    /\bchecking\b/.test(normalized) ? 'Checking' as const : null,
    /\bsavings?\b/.test(normalized) ? 'Savings' as const : null,
  ].filter((value): value is 'Checking' | 'Savings' => value !== null);
  if (accountMatches.length !== 1) return null;
  const accountType = accountMatches[0]!;
  const asksForTransactions = /transaction|history|activity/.test(normalized);
  if (!asksForTransactions || /\b(?:do not|don't|not|without)\b.{0,40}\b(?:transactions?|history|activity)\b/.test(normalized)) return null;
  const numericPeriods = [...new Set([...normalized.matchAll(/\b(7|14|30)\b/g)].map(match => match[1] as '7' | '14' | '30'))];
  const periodMatches: Array<'latest' | '7' | '14' | '30'> = [
    ...(/\b(?:latest|last transaction|most recent)\b/.test(normalized) ? ['latest' as const] : []),
    ...numericPeriods,
  ];
  if (periodMatches.length !== 1) return null;
  const period = periodMatches[0]!;
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
