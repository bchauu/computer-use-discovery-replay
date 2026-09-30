import type { ModelAction, SuccessCriteria, CapabilityInputs } from '../contracts/discovery.ts';
import type { PublicRunContract, TelemetryEvent, TransactionOutput } from '../contracts/run.ts';

export interface ObservedControl {
  ref: string;
  index: number;
  tag: string;
  role: string;
  name: string;
  type: string;
  disabled: boolean;
  value: string | null;
  options: string[];
  contextRole: string | null;
  contextText: string | null;
  fingerprint: string;
}

export interface Observation {
  revision: string;
  route: string;
  title: string;
  headings: string[];
  visibleText: string;
  controls: ObservedControl[];
  stateHash: string;
}

export type RunStatus = 'created' | 'running' | 'awaiting_human' | 'succeeded' | 'failed' | 'cancelled';
export type RunResultCategory = 'success' | 'business_outcome' | 'intervention' | 'hard_failure' | 'cancelled';
export type ExecutionMode = 'discovery' | 'validation_replay' | 'replay';
export type { CapabilityInputs, TransactionOutput, TelemetryEvent };
export type PublicRun = PublicRunContract;
