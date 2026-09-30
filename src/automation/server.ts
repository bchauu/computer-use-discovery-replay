import type express from 'express';
import type { Connection } from 'mongoose';
import { createSessionSchema, handoffEpochSchema, humanActionSchema, startRunSchema } from '../contracts/discovery.ts';
import { publicRunSchema } from '../contracts/run.ts';
import { CapabilityCatalog } from '../discovery/catalog.ts';
import { DiscoveryController } from '../discovery/controller.ts';
import { ExecutionDispatcher } from '../discovery/dispatcher.ts';
import { MockDecisionClient, OpenAIDecisionClient } from '../discovery/model.ts';
import type { DecisionClient } from '../discovery/model.ts';
import { readOnlyDiscoveryPolicy } from '../discovery/policy.ts';
import { ReplayController } from '../discovery/replay.ts';
import { SessionRegistry } from '../discovery/sessions.ts';

const sessions = new SessionRegistry();
const numberEnv = (name: string, fallback: number) => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const apiKey = process.env.OPENAI_API_KEY?.trim();
const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
const modelMode = process.env.DISCOVERY_MODEL_MODE?.trim() || 'openai';
const modelClient = modelMode === 'mock'
  ? new MockDecisionClient()
  : apiKey ? new OpenAIDecisionClient(apiKey, model, numberEnv('DISCOVERY_MODEL_TIMEOUT_MS', 120_000)) : null;

function token(request: express.Request) {
  const value = request.header('x-control-token');
  return value?.trim() || undefined;
}

export function configureAutomation(app: express.Express, database: Connection, options: {
  sessionRegistry?: SessionRegistry;
  decisionClient?: DecisionClient | null;
  catalogDirectory?: string;
} = {}) {
  const activeSessions = options.sessionRegistry ?? sessions;
  const activeModelClient = options.decisionClient === undefined ? modelClient : options.decisionClient;
  const catalog = new CapabilityCatalog(database, options.catalogDirectory);
  const discovery = activeModelClient ? new DiscoveryController(database, activeModelClient, {
    maxSteps: numberEnv('DISCOVERY_MAX_STEPS', 40),
    runTimeoutMs: numberEnv('DISCOVERY_RUN_TIMEOUT_MS', 600_000),
    actionTimeoutMs: numberEnv('DISCOVERY_ACTION_TIMEOUT_MS', 30_000),
    modelAttempts: numberEnv('DISCOVERY_MODEL_ATTEMPTS', 3),
    retryBaseMs: numberEnv('DISCOVERY_RETRY_BASE_MS', 1_000),
    repeatedDecisionLimit: numberEnv('DISCOVERY_REPEAT_LIMIT', 3),
    noProgressLimit: numberEnv('DISCOVERY_NO_PROGRESS_LIMIT', 3),
    maxModelCalls: numberEnv('DISCOVERY_MAX_MODEL_CALLS', 50),
    maxTotalTokens: numberEnv('DISCOVERY_MAX_TOTAL_TOKENS', 100_000),
    actionPolicy: readOnlyDiscoveryPolicy,
  }, catalog) : null;
  const replay = new ReplayController(database, catalog);
  const dispatcher = new ExecutionDispatcher(discovery, replay, catalog);

  app.post('/api/sessions', async (request, response, next) => {
    try {
      const body = createSessionSchema.parse(request.body);
      const targetUrl = body.targetUrl || process.env.BANK_TARGET_URL || 'http://127.0.0.1:5174/#/members';
      const session = await activeSessions.create(targetUrl, process.env.DISCOVERY_HEADLESS === 'true');
      response.status(201).json({
        sessionId: session.sessionId,
        controlToken: session.controlToken,
        owner: session.owner,
        target: new URL(targetUrl).origin,
        modelConfigured: Boolean(activeModelClient),
        decisionProvider: activeModelClient?.model ?? null,
      });
    } catch (error) { next(error); }
  });

  app.get('/api/sessions/:sessionId', (request, response) => {
    const session = activeSessions.authorize(request.params.sessionId, token(request));
    if (!session) return response.status(404).json({ code: 'SESSION_NOT_FOUND' });
    return response.json({ sessionId: session.sessionId, owner: session.owner, epoch: session.epoch, activeRunId: session.activeRunId });
  });

  app.post('/api/runs', async (request, response) => {
    const parsed = startRunSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ code: 'INVALID_RUN_REQUEST' });
    const session = activeSessions.authorize(parsed.data.sessionId, token(request));
    if (!session) return response.status(404).json({ code: 'SESSION_NOT_FOUND' });
    try {
      const run = await dispatcher!.start(session, parsed.data.goal);
      return response.status(202).json({ runId: run.runId, status: run.status, mode: run.mode });
    } catch (error) {
      if (error instanceof Error && error.message === 'SESSION_BUSY') return response.status(409).json({ code: 'SESSION_BUSY' });
      if (error instanceof Error && error.message === 'VERIFIED_MEMBER_REQUIRED') return response.status(409).json({ code: 'VERIFIED_MEMBER_REQUIRED' });
      if (error instanceof Error && error.message === 'MODEL_NOT_CONFIGURED') return response.status(503).json({ code: 'MODEL_NOT_CONFIGURED' });
      if (error instanceof Error && error.message === 'UNSUPPORTED_GOAL') return response.status(422).json({
        code: 'UNSUPPORTED_GOAL',
        message: 'For this first slice, request checking or savings transactions for the latest, 7, 14, or 30 days.',
      });
      throw error;
    }
  });

  app.get('/api/runs/:runId', (request, response) => {
    const run = dispatcher?.get(request.params.runId);
    if (!run) return response.status(404).json({ code: 'RUN_NOT_FOUND' });
    const session = activeSessions.authorize(run.sessionId, token(request));
    if (!session) return response.status(404).json({ code: 'RUN_NOT_FOUND' });
    return response.json(publicRunSchema.parse(run));
  });

  app.post('/api/runs/:runId/cancel', (request, response) => {
    const run = dispatcher?.get(request.params.runId);
    if (!run) return response.status(404).json({ code: 'RUN_NOT_FOUND' });
    const session = activeSessions.authorize(run.sessionId, token(request));
    if (!session) return response.status(404).json({ code: 'RUN_NOT_FOUND' });
    const result = dispatcher?.cancel(run.runId, session);
    if (result === 'not_running') return response.status(409).json({ code: 'RUN_NOT_ACTIVE' });
    if (result !== 'accepted') return response.status(404).json({ code: 'RUN_NOT_FOUND' });
    return response.status(202).json({ runId: run.runId, status: 'cancelling' });
  });

  app.post('/api/runs/:runId/handoff/claim', async (request, response) => {
    const run = dispatcher?.get(request.params.runId);
    if (!run) return response.status(404).json({ code: 'RUN_NOT_FOUND' });
    const session = activeSessions.authorize(run.sessionId, token(request));
    if (!session) return response.status(404).json({ code: 'RUN_NOT_FOUND' });
    const outcome = await dispatcher!.claimHandoff(run.runId, session);
    if (outcome.result === 'not_available') return response.status(409).json({ code: 'HANDOFF_NOT_AVAILABLE' });
    if (outcome.result === 'already_claimed') return response.status(409).json({ code: 'HANDOFF_ALREADY_CLAIMED' });
    return response.json({ runId: run.runId, owner: 'human', epoch: outcome.epoch });
  });

  app.post('/api/runs/:runId/handoff/actions', async (request, response) => {
    const parsed = humanActionSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ code: 'INVALID_HUMAN_ACTION' });
    const run = dispatcher?.get(request.params.runId);
    if (!run) return response.status(404).json({ code: 'RUN_NOT_FOUND' });
    const session = activeSessions.authorize(run.sessionId, token(request));
    if (!session) return response.status(404).json({ code: 'RUN_NOT_FOUND' });
    const { expectedEpoch, ...command } = parsed.data;
    const outcome = await dispatcher!.executeHumanAction(run.runId, session, expectedEpoch, command);
    if (outcome === 'stale_epoch') return response.status(409).json({ code: 'STALE_OWNERSHIP_EPOCH' });
    if (outcome === 'command_in_flight') return response.status(409).json({ code: 'HUMAN_COMMAND_IN_FLIGHT' });
    if (outcome === 'command_denied') return response.status(403).json({ code: 'HUMAN_ACTION_DENIED' });
    if (outcome === 'target_invalid') return response.status(422).json({ code: 'HUMAN_TARGET_INVALID' });
    if (outcome !== 'accepted') return response.status(409).json({ code: 'HANDOFF_NOT_AVAILABLE' });
    return response.json({ result: 'accepted' });
  });

  app.post('/api/runs/:runId/handoff/resume', async (request, response) => {
    const parsed = handoffEpochSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ code: 'INVALID_RESUME_REQUEST' });
    const run = dispatcher?.get(request.params.runId);
    if (!run) return response.status(404).json({ code: 'RUN_NOT_FOUND' });
    const session = activeSessions.authorize(run.sessionId, token(request));
    if (!session) return response.status(404).json({ code: 'RUN_NOT_FOUND' });
    const outcome = await dispatcher!.resumeHandoff(run.runId, session, parsed.data.expectedEpoch);
    if (outcome === 'stale_epoch') return response.status(409).json({ code: 'STALE_OWNERSHIP_EPOCH' });
    if (outcome === 'command_in_flight') return response.status(409).json({ code: 'HUMAN_COMMAND_IN_FLIGHT' });
    if (outcome === 'checkpoint_failed') return response.status(422).json({ code: 'RESUME_CHECKPOINT_FAILED' });
    if (outcome !== 'accepted') return response.status(409).json({ code: 'HANDOFF_NOT_AVAILABLE' });
    return response.json({ runId: run.runId, status: 'running', owner: 'automation' });
  });
  return { dispatcher, catalog, replay };
}

export { sessions as defaultSessionRegistry };
