import { z } from 'zod';

const durationSchema = z.number().int().nonnegative();

export const stabilitySummarySchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  targetOrigin: z.string().url(),
  totalRuns: z.number().int().positive().max(100),
  successfulRuns: z.number().int().nonnegative().max(100),
  expectedOutcomeRate: z.number().min(0).max(1),
  modelRequestCount: z.number().int().nonnegative(),
  durationMs: z.object({ min: durationSchema, p50: durationSchema, p95: durationSchema, max: durationSchema }).strict(),
  outputConsistentByScenario: z.record(z.string().min(1), z.boolean()),
  results: z.array(z.object({
    iteration: z.number().int().positive(),
    scenario: z.string().min(1),
    runId: z.string().uuid(),
    durationMs: durationSchema,
    status: z.literal('succeeded'),
    code: z.string().min(1),
    transactionCount: z.number().int().nonnegative().nullable(),
    outputHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    modelRequests: z.literal(0),
    pageAdvances: z.number().int().nonnegative(),
  }).strict()).min(1).max(100),
}).strict();

export type StabilitySummary = z.infer<typeof stabilitySummarySchema>;
