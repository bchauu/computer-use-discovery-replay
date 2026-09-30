import type { Page } from 'playwright';
import { stableHash } from '../contracts/discovery.ts';
import type { PublicRun } from './types.ts';

export type RuntimeCondition =
  | { kind: 'ready'; code: 'READY' }
  | { kind: 'loading'; code: 'PAGE_LOADING' }
  | { kind: 'business_outcome'; code: 'ACCOUNT_NOT_FOUND' | 'NO_TRANSACTIONS' }
  | { kind: 'recoverable'; code: 'KNOWN_NOTICE'; ruleId: 'dismiss-known-notice' }
  | { kind: 'intervention'; code: 'SESSION_EXPIRED' | 'PERMISSION_DENIED' | 'UNKNOWN_DIALOG'; resumable: boolean }
  | { kind: 'hard_failure'; code: 'APPLICATION_ERROR' };

const sensitive = /\b\d{4,}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
export function sanitizeDiagnosticText(value: string) {
  return value.replace(sensitive, '[redacted]').replace(/\s+/g, ' ').trim().slice(0, 200);
}

export async function classifyRuntime(page: Page): Promise<RuntimeCondition> {
  const state = await page.evaluate(() => {
    const normalized = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]')).map(node => normalized(node.textContent));
    const text = normalized(document.body?.innerText);
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).map(node => normalized(node.textContent));
    return {
      headings,
      text,
      dialogs,
      loading: Boolean(document.querySelector('[aria-busy="true"],[role="progressbar"],.runtime-loading')),
    };
  });
  if (state.headings.includes('Employee session expired')) return { kind: 'intervention', code: 'SESSION_EXPIRED', resumable: true };
  if (state.headings.includes('Permission denied')) return { kind: 'intervention', code: 'PERMISSION_DENIED', resumable: false };
  if (state.headings.includes('Application unavailable')) return { kind: 'hard_failure', code: 'APPLICATION_ERROR' };
  if (state.dialogs.some(text => text.includes('Scheduled maintenance notice'))) return { kind: 'recoverable', code: 'KNOWN_NOTICE', ruleId: 'dismiss-known-notice' };
  if (state.dialogs.length) return { kind: 'intervention', code: 'UNKNOWN_DIALOG', resumable: false };
  if (state.loading) return { kind: 'loading', code: 'PAGE_LOADING' };
  if (state.headings.includes('No matching accounts')) return { kind: 'business_outcome', code: 'ACCOUNT_NOT_FOUND' };
  if (state.headings.includes('No posted transactions')) return { kind: 'business_outcome', code: 'NO_TRANSACTIONS' };
  return { kind: 'ready', code: 'READY' };
}

export async function runtimeSnapshot(page: Page, targetCount: number | null = null) {
  const value = await page.evaluate(() => ({
    route: `${location.pathname}${location.hash}`,
    headings: Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'))
      .map(node => (node.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 30),
  })).catch(() => ({ route: '[session unavailable]', headings: [] as string[] }));
  const route = sanitizeDiagnosticText(value.route);
  const headings = value.headings.map(sanitizeDiagnosticText);
  return { route, headings, targetCount, stateHash: stableHash({ route, headings }) };
}

export async function failureDiagnostic(input: {
  run: PublicRun;
  page: Page;
  phase: NonNullable<NonNullable<PublicRun['result']>['diagnostic']>['phase'];
  stepId: string | null;
  effectState: NonNullable<NonNullable<PublicRun['result']>['diagnostic']>['effectState'];
  routeTemplate: string | null;
  expectedHeadings: string[];
  targetCount?: number | null;
  recoveryAttempted?: boolean;
  recoveryRuleId?: string | null;
  recoveryReason: string;
}) {
  const observed = await runtimeSnapshot(input.page, input.targetCount ?? null);
  return {
    phase: input.phase,
    stepId: input.stepId,
    effectState: input.effectState,
    expected: { routeTemplate: input.routeTemplate, headings: input.expectedHeadings, targetCount: input.targetCount ?? null },
    observed,
    recovery: {
      attempted: input.recoveryAttempted ?? false,
      ruleId: input.recoveryRuleId ?? null,
      reason: sanitizeDiagnosticText(input.recoveryReason) || 'No safe recovery was available.',
    },
    evidenceRef: `.local/runs/${input.run.runId}/events.jsonl`,
  } as const;
}
