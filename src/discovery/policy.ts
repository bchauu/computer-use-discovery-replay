import type { ModelAction } from '../contracts/discovery.ts';
import type { CapabilityArtifact } from '../contracts/capability.ts';
import type { Observation } from './types.ts';
import type { Locator, Page } from 'playwright';

export const EXECUTION_POLICY_VERSION = 'read-only-bank-v1';

export interface ActionPolicyConfig {
  allowedActionKinds: ReadonlySet<ModelAction['kind']>;
  blockedTargetPatterns: readonly RegExp[];
}

export interface PolicyDecision {
  ok: boolean;
  code: 'POLICY_ALLOWED' | 'ACTION_KIND_DENIED' | 'TARGET_EFFECT_DENIED';
  message: string;
}

export const readOnlyDiscoveryPolicy: ActionPolicyConfig = {
  allowedActionKinds: new Set(['click', 'select', 'back', 'scroll', 'complete', 'request_human']),
  blockedTargetPatterns: [
    /\b(create|open new|delete|remove|transfer|pay|submit|approve|confirm|send|upload|download)\b/i,
  ],
};

export function evaluateActionPolicy(
  action: ModelAction,
  observation: Observation,
  policy: ActionPolicyConfig,
): PolicyDecision {
  if (!policy.allowedActionKinds.has(action.kind)) {
    return { ok: false, code: 'ACTION_KIND_DENIED', message: 'The action kind is not allowed by the active policy.' };
  }
  if (!action.targetRef) return { ok: true, code: 'POLICY_ALLOWED', message: 'The action passed the active policy.' };
  const control = observation.controls.find(item => item.ref === action.targetRef);
  if (!control) return { ok: true, code: 'POLICY_ALLOWED', message: 'Target existence is handled by runtime validation.' };
  const targetDescription = `${control.name} ${control.contextText ?? ''}`;
  if (policy.blockedTargetPatterns.some(pattern => pattern.test(targetDescription))) {
    return { ok: false, code: 'TARGET_EFFECT_DENIED', message: 'The target appears to have an effect denied by the active policy.' };
  }
  return { ok: true, code: 'POLICY_ALLOWED', message: 'The action passed the active policy.' };
}

type ArtifactStep = CapabilityArtifact['steps'][number];
export interface ReplayPolicyDecision {
  ok: boolean;
  code: 'POLICY_ALLOWED' | 'ROUTE_DENIED' | 'TARGET_EFFECT_DENIED' | 'DESTINATION_DENIED' | 'SURFACE_SCOPE_DENIED';
  message: string;
  version: string;
}

export async function evaluateReplayPolicy(
  page: Page,
  locator: Locator | null,
  step: ArtifactStep,
  allowedOrigin: string,
  surface: CapabilityArtifact['surface'],
): Promise<ReplayPolicyDecision> {
  const allow = (message: string): ReplayPolicyDecision => ({ ok: true, code: 'POLICY_ALLOWED', message, version: EXECUTION_POLICY_VERSION });
  const deny = (code: Exclude<ReplayPolicyDecision['code'], 'POLICY_ALLOWED'>, message: string): ReplayPolicyDecision => ({ ok: false, code, message, version: EXECUTION_POLICY_VERSION });
  if (surface.kind !== 'browser' || surface.frame.kind !== 'top') return deny('SURFACE_SCOPE_DENIED', 'Only the declared top-level browser surface is supported.');
  const current = new URL(page.url());
  if (current.origin !== allowedOrigin) return deny('ROUTE_DENIED', 'The current page is outside the allowed origin.');
  const route = current.hash.slice(1) || current.pathname;
  if (!/^\/(members(?:\/[^/]+)?|transactions)(?:\/|$)/.test(route)) return deny('ROUTE_DENIED', 'The current route is outside this capability policy.');
  if (step.action.kind === 'back' || step.action.kind === 'scroll') return allow('The read-only browser action is allowed.');
  if (!locator) return deny('TARGET_EFFECT_DENIED', 'A target is required for this action.');
  const target = await locator.evaluate(element => {
    const html = element as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const href = element instanceof HTMLAnchorElement ? element.href : null;
    const type = element instanceof HTMLButtonElement || element instanceof HTMLInputElement ? element.type : '';
    const form = element.closest('form');
    const label = element.getAttribute('aria-label') || (element as HTMLInputElement).labels?.[0]?.innerText || html.innerText || '';
    return { tag, href, type, inForm: Boolean(form), label: label.replace(/\s+/g, ' ').trim().slice(0, 180) };
  }).catch(() => null);
  if (!target) return deny('TARGET_EFFECT_DENIED', 'The target could not be inspected before execution.');
  if (/\b(create|open new|delete|remove|transfer|pay|submit|approve|confirm|send|upload)\b/i.test(target.label)) {
    return deny('TARGET_EFFECT_DENIED', 'The target label indicates an effect forbidden by this read-only capability.');
  }
  if (step.action.kind === 'click') {
    if (target.tag !== 'a' || !target.href || target.inForm || target.type === 'submit') return deny('TARGET_EFFECT_DENIED', 'Replay navigation clicks must resolve to a non-form link.');
    const destination = new URL(target.href);
    const destinationRoute = destination.hash.slice(1) || destination.pathname;
    if (destination.origin !== allowedOrigin || !/^\/(transactions|members\/[^/]+\/accounts\/[^/]+\/(?:overview|history|pending))$/.test(destinationRoute)) {
      return deny('DESTINATION_DENIED', 'The link destination is outside the capability route allowlist.');
    }
    return allow('The same-origin read-only navigation link is allowed.');
  }
  if (step.action.kind === 'select' && target.tag === 'select' && ['History period', 'Account type'].includes(target.label)) {
    return allow('The declared read-only filter selection is allowed.');
  }
  return deny('TARGET_EFFECT_DENIED', 'The resolved target effect is not allowed for this artifact action.');
}
