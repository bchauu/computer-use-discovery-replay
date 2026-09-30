import { criteriaFromGoal, inputsFromCriteria } from '../contracts/discovery.ts';
import { CapabilityCatalog } from './catalog.ts';
import { readVerifiedMember } from './completion.ts';
import { DiscoveryController } from './controller.ts';
import { ReplayController } from './replay.ts';
import type { LiveSession } from './sessions.ts';

export class ExecutionDispatcher {
  private readonly discovery: DiscoveryController | null;
  private readonly replay: ReplayController;
  private readonly catalog: CapabilityCatalog;

  constructor(discovery: DiscoveryController | null, replay: ReplayController, catalog: CapabilityCatalog) {
    this.discovery = discovery;
    this.replay = replay;
    this.catalog = catalog;
  }

  async start(session: LiveSession, goal: string) {
    const member = await readVerifiedMember(session.page);
    if (!member) throw new Error('VERIFIED_MEMBER_REQUIRED');
    const criteria = criteriaFromGoal(goal, member);
    if (!criteria) throw new Error('UNSUPPORTED_GOAL');
    const inputs = inputsFromCriteria(criteria);
    const artifact = await this.catalog.resolve('view-transaction-history');
    if (!artifact) {
      if (!this.discovery) throw new Error('MODEL_NOT_CONFIGURED');
      return this.discovery.start(session, goal, criteria);
    }
    const mode = artifact.status === 'validated' ? 'replay' as const : 'validation_replay' as const;
    return this.replay.start(session, artifact, inputs, criteria, mode);
  }

  get(runId: string) {
    return this.discovery?.runs.get(runId) ?? this.replay.runs.get(runId) ?? null;
  }

  cancel(runId: string, session: LiveSession) {
    if (this.discovery?.runs.has(runId)) return this.discovery.cancel(runId, session);
    if (this.replay.runs.has(runId)) return this.replay.cancel(runId, session);
    return 'not_found' as const;
  }

  claimHandoff(runId: string, session: LiveSession) {
    return this.replay.claimHandoff(runId, session);
  }

  executeHumanAction(runId: string, session: LiveSession, expectedEpoch: number, command: {
    kind: 'fill' | 'click'; label?: string; name?: string; value?: string;
  }) {
    return this.replay.executeHumanAction(runId, session, expectedEpoch, command);
  }

  resumeHandoff(runId: string, session: LiveSession, expectedEpoch: number) {
    return this.replay.resumeHandoff(runId, session, expectedEpoch);
  }
}
