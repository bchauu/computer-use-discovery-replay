import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

export function useAutomation() {
  const sessionId = window.sessionStorage.getItem('automationSession');
  const controlToken = window.sessionStorage.getItem('automationControlToken');
  const [goal, setGoal] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState('Ready');
  const [runStatus, setRunStatus] = useState('idle');
  const [mode, setMode] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [handoffEpoch, setHandoffEpoch] = useState<number | null>(null);
  const [employeePin, setEmployeePin] = useState('');
  const [events, setEvents] = useState<
    Array<{ sequence: number; type: string; code: string; purpose: string | null }>
  >([]);
  const [runDetails, setRunDetails] = useState<{
    category: string | null;
    code: string | null;
    transactionCount: number | null;
    accountLastFour: string | null;
    artifactStatus: string | null;
    modelRequests: number;
    diagnosticPhase: string | null;
  }>({
    category: null,
    code: null,
    transactionCount: null,
    accountLastFour: null,
    artifactStatus: null,
    modelRequests: 0,
    diagnosticPhase: null,
  });
  useEffect(() => {
    if (!runId || !controlToken) return;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await fetch(`/automation-api/api/runs/${runId}`, {
          headers: { 'x-control-token': controlToken },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('POLL_FAILED');
        const run = (await response.json()) as {
          mode: string;
          status: string;
          step: number;
          result: {
            message: string;
            category: string;
            code: string;
            output: { account: { accountLastFour: string }; transactions: unknown[] } | null;
            diagnostic: { phase: string } | null;
          } | null;
          artifact: { status: string } | null;
          events: typeof events;
        };
        setMode(run.mode);
        setRunStatus(run.status);
        setStatus(run.result?.message || run.status.replace('_', ' '));
        setStep(run.step);
        setEvents(run.events.slice(-6));
        setRunDetails({
          category: run.result?.category ?? null,
          code: run.result?.code ?? null,
          transactionCount: run.result?.output?.transactions.length ?? null,
          accountLastFour: run.result?.output?.account.accountLastFour ?? null,
          artifactStatus: run.artifact?.status ?? null,
          modelRequests: run.events.filter((item) => item.type === 'model_request').length,
          diagnosticPhase: run.result?.diagnostic?.phase ?? null,
        });
        if (['created', 'running', 'awaiting_human'].includes(run.status))
          window.setTimeout(poll, 750);
      } catch {
        if (!controller.signal.aborted) setStatus('Run status unavailable');
      }
    };
    void poll();
    return () => controller.abort();
  }, [runId, controlToken]);
  async function start(event: FormEvent) {
    event.preventDefault();
    setStatus('Starting automation…');
    setEvents([]);
    setRunDetails({
      category: null,
      code: null,
      transactionCount: null,
      accountLastFour: null,
      artifactStatus: null,
      modelRequests: 0,
      diagnosticPhase: null,
    });
    try {
      const response = await fetch('/automation-api/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-control-token': controlToken! },
        body: JSON.stringify({ sessionId, goal }),
      });
      const body = (await response.json()) as {
        runId?: string;
        mode?: string;
        message?: string;
        code?: string;
      };
      if (!response.ok || !body.runId)
        throw new Error(body.message || body.code || 'Could not start automation.');
      setRunId(body.runId);
      setMode(body.mode ?? null);
      setRunStatus('running');
      setHandoffEpoch(null);
      setEmployeePin('');
      setStatus('running');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not start automation.');
    }
  }
  const running =
    ['created', 'running', 'awaiting_human'].includes(runStatus) ||
    status === 'Starting automation…';
  const navigating =
    ['created', 'running'].includes(runStatus) || status === 'Starting automation…';
  async function cancel() {
    if (!runId || !controlToken) return;
    setStatus('Cancelling…');
    try {
      const response = await fetch(`/automation-api/api/runs/${runId}/cancel`, {
        method: 'POST',
        headers: { 'x-control-token': controlToken },
      });
      if (!response.ok) throw new Error('CANCEL_FAILED');
    } catch {
      setStatus('Could not cancel the run');
    }
  }
  async function claimControl() {
    if (!runId || !controlToken) return;
    try {
      const response = await fetch(`/automation-api/api/runs/${runId}/handoff/claim`, {
        method: 'POST',
        headers: { 'x-control-token': controlToken },
      });
      const body = (await response.json()) as { epoch?: number; code?: string };
      if (!response.ok || !body.epoch) throw new Error(body.code || 'CLAIM_FAILED');
      setHandoffEpoch(body.epoch);
      setStatus(
        runDetails.code === 'HUMAN_DECISION_REQUIRED'
          ? 'Human control claimed. Review the unknown dialog and decide whether to proceed.'
          : 'Human control claimed. Re-authenticate this employee session.',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not claim control');
    }
  }
  async function reauthenticate(event: FormEvent) {
    event.preventDefault();
    if (!runId || !controlToken || handoffEpoch === null) return;
    const headers = { 'content-type': 'application/json', 'x-control-token': controlToken };
    try {
      const fill = await fetch(`/automation-api/api/runs/${runId}/handoff/actions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          expectedEpoch: handoffEpoch,
          kind: 'fill',
          label: 'Employee PIN',
          value: employeePin,
        }),
      });
      if (!fill.ok)
        throw new Error(((await fill.json()) as { code?: string }).code || 'PIN_RELAY_FAILED');
      setEmployeePin('');
      const click = await fetch(`/automation-api/api/runs/${runId}/handoff/actions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          expectedEpoch: handoffEpoch,
          kind: 'click',
          name: 'Re-authenticate',
        }),
      });
      if (!click.ok)
        throw new Error(((await click.json()) as { code?: string }).code || 'SUBMIT_RELAY_FAILED');
      const resume = await fetch(`/automation-api/api/runs/${runId}/handoff/resume`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedEpoch: handoffEpoch }),
      });
      if (!resume.ok)
        throw new Error(((await resume.json()) as { code?: string }).code || 'RESUME_FAILED');
      setHandoffEpoch(null);
      setStatus('Re-authenticated. Automation resumed.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not resume automation');
    }
  }
  async function proceedAndResume() {
    if (!runId || !controlToken || handoffEpoch === null) return;
    const headers = { 'content-type': 'application/json', 'x-control-token': controlToken };
    try {
      const click = await fetch(`/automation-api/api/runs/${runId}/handoff/actions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          expectedEpoch: handoffEpoch,
          kind: 'click',
          name: 'Proceed anyway',
        }),
      });
      if (!click.ok)
        throw new Error(
          ((await click.json()) as { code?: string }).code || 'HUMAN_DECISION_RELAY_FAILED',
        );
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      const resume = await fetch(`/automation-api/api/runs/${runId}/handoff/resume`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedEpoch: handoffEpoch }),
      });
      if (!resume.ok)
        throw new Error(((await resume.json()) as { code?: string }).code || 'RESUME_FAILED');
      setHandoffEpoch(null);
      setStatus('Human decision recorded. Automation resumed.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not resume automation');
    }
  }

  return {
    sessionId,
    controlToken,
    goal,
    setGoal,
    status,
    runStatus,
    mode,
    step,
    handoffEpoch,
    employeePin,
    setEmployeePin,
    events,
    runDetails,
    running,
    navigating,
    start,
    cancel,
    claimControl,
    reauthenticate,
    proceedAndResume,
  };
}
