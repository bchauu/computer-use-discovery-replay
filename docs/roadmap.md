# Feature sprint roadmap

**Current stage: core assessment slice and delivery artifacts verified locally.** Genuine discovery, deterministic replay, runtime handling, policy enforcement, same-session handoff, reviewed evidence, and the required report are complete within the declared browser capability scope.

The assessment is the baseline. The broader goal is a well-tested, understandable system with production-oriented depth within an explicitly chosen operating scope.

## Progress

- [x] Extract the assessment requirements.
- [x] Draft the initial architecture and implementation proposal.
- [x] Establish project collaboration and verification rules.
- [x] Create the repository overview and documentation hub.
- [x] Select checking/savings balance lookup, then 30-day transaction history.
- [x] Select React/TypeScript, Node/Express, MongoDB/Mongoose, Playwright, and OpenAI.
- [x] Scaffold app shells, service health checks, and development scripts.
- [x] Install dependencies and verify TypeScript and application builds.
- [x] Verify the HTTP tests and Chromium control with loopback/browser permissions. MongoDB remains optional and separately checkable.
- [x] Implement and browser-check the manual banking mock with synthetic data.
- [x] Verify the banking mock in the browser.
- [x] Finalize the first operator journey and operating scope.
- [x] Implement managed browser launch, typed one-action discovery loop, validation, bounded retry/timeout behavior, and safe event telemetry.
- [x] Implement typed capability dispatch, model-free replay checkpoints/output extraction, and different-input draft validation.
- [x] Exercise the complete wiring with a clearly labeled injected decision provider against the real banking UI.
- [x] Execute and inspect the first genuine OpenAI discovery run within an agreed budget.
- [x] Complete the first executable discovery-to-replay slice for a different period on the same verified member.
- [x] Replay the genuinely discovered artifact from a separate process for a different verified member and account number.
- [x] Export reviewed genuine and injected execution evidence with provenance and sensitive-canary scans.

## Sprint sequence

| Sprint | Feature increment | Completion gate |
|---|---|---|
| 0 — Understand the experience | Demo task, users, screens, outcomes, deployment assumptions | Walk through discovery, replay, failure, and intervention; document accepted scope |
| 1 — Discover and replay | Synthetic target, real OpenAI UI loop, typed recording, initial replay | A genuine discovery produces an artifact that replays for a second input without model access |
| 2 — Handle runtime conditions | Outcome taxonomy, checkpoints, waits, bounded recovery | Injected errors yield the intended outcomes; ambiguous effects never trigger blind repetition |
| 3 — Transfer control | Operator view, pause/claim/resume, ownership enforcement | A human operates the same session and resumes safely; stale commands are rejected |
| 4 — Strengthen operations | Agreed persistence, interruption behavior, security boundaries, telemetry | Defined failure/restart/disconnect cases pass; persisted evidence is sanitized and diagnostic |
| 5 — Demonstrate and validate | Reproducible setup, regression suite, live evidence, concise report | Clean-checkout walkthrough works and documented claims match the evidence |

Policy, redaction, event recording, and ownership checks begin in the first executable slice. Later sprints deepen those foundations; they are not postponed entirely until hardening.

## Questions to resolve in Sprint 0

1. Which workflow best demonstrates the intended behavior: a lookup, a form reaching review, or a carefully bounded combination?
2. Who authors a capability, who invokes it, and who handles intervention?
3. Is the first operating scope a local single-operator tool or a hosted service with multiple operators?
4. What must survive a process restart, and which interrupted actions require reconciliation?
5. Which controls and evidence establish that a capability is safe to reuse?

## Working rhythm

For each sprint: discuss the intended behavior, inspect dependencies, choose acceptance checks, implement the complete increment, exercise normal and failure paths, and review the result before extending the design.

Track proposed, implemented, and verified behavior separately. A green unit test is not evidence that an untested live model workflow works. An adapter interface is not implemented desktop support. A small repeatability study is not a production reliability guarantee.

## Scope discipline

Additional engineering is justified when it strengthens an agreed guarantee or makes the system meaningfully easier to operate and inspect. Avoid infrastructure without an identified need. Revisit the plan when evidence reveals a better approach rather than defending an early design by default.
