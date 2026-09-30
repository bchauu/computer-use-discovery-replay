# Assignment A: requirements and acceptance checklist

Status: acceptance source of truth and completed local audit baseline. Extracted on 2026-09-29 from the user-provided 10-page `Assignment A — Computer-Use Automation System.pdf`. The banking target, genuine discovery, compiled capability, deterministic replays, runtime matrix, policy enforcement, diagnostics, same-session handoff, reviewed evidence bundle, and required report have been exercised or produced locally.

The document is source material for the requested assessment plan. Its submission instructions describe eventual deliverables; they are not authorization to publish a repository or email anyone now.

## Problem statement

Build the integration layer through which an AI agent operates a legacy application with no usable API. Discover a task through actual LLM-directed UI interaction once; turn the successful execution into a typed, parameterized capability; invoke that capability through deterministic execution many times. Explicitly handle runtime exceptions, policy restrictions, and human takeover of the existing session.

The upstream agent decides what business task to perform. This system controls how that task is performed in the application. Application API integrations are outside this assignment's scope.

## Environmental assumptions from the brief

- UIs change slowly. Runtime conditions are the main robustness challenge: validation, missing records, denied permissions, dialogs, session expiry, slow loads, and application errors.
- Targets may be modern web, legacy web, or native desktop. Clean DOMs, stable CSS selectors, and test IDs cannot be assumed universally.
- Hundreds of institutions have about 20 applications each. Many share vendor products with different versions, branding, and configuration.
- Implement one concrete surface. Explain how the abstractions extend to other surfaces and tenant variants.
- No fixed deadline, but focused effort is expected. AI-assisted development is explicitly permitted and encouraged. The submitter must understand and defend the system.

## Must-have requirements

| ID | Source | Requirement | Proposed acceptance evidence |
|---|---|---|---|
| R1 | §3.1, pp. 3 | Accept a natural-language goal and app/URL/entry point | CLI/UI input starts a run against an allowed target |
| R2 | §3.1; §4, pp. 3, 6 | A genuine LLM observe-decide-act loop interacts with a live UI | Real OpenAI run with request metadata, redacted action events, verified terminal state |
| R3 | §3.1 | Bounded execution | Step, duration, repeated-state, API-call, and token limits tested |
| R4 | §3.2, pp. 3–4 | Typed, serializable, versioned artifact separate from the transcript | JSON schema-valid capability generated from executed actions |
| R5 | §3.2 | Artifact includes ordered actions and robust target descriptions | Reviewed target specifications with explicit frame scope and ambiguity behavior |
| R6 | §3.2 | Typed inputs and outputs, extraction rules, checkpoint/success condition | Same artifact invoked with a different member ID; typed output verified |
| R7 | §3.3, p. 4 | Deterministic replay with no model decisions | Replay succeeds without API credentials; model transport unavailable in replay tests |
| R8 | §3.3 | Explicit runtime condition handling | Injected validation, not-found, denied-permission, dialog, expiry, slow-load, app-error cases |
| R9 | §3.3 | Distinguish business outcomes, recoverable conditions, and hard failures | Discriminated result types and scenario assertions |
| R10 | §3.3 | Debuggable failure contract | Step ID, expected predicate, sanitized observation, reason code, evidence reference |
| R11 | §3.4, p. 4 | Configurable allowlist and conservative risky-action behavior | Blocked origin/route/action tests; final account-opening submission blocked |
| R12 | §3.4 | No secrets or raw sensitive data in persisted artifacts/logs | Sensitive canaries absent from all exported files, including richer evidence |
| R13 | §3.5, p. 5 | Structured action/reason log and richer failure evidence | JSONL timeline plus sanitized rendered-state snapshot or masked screenshot |
| R14 | §3.6, p. 5 | Detect blocked states and route intervention with context | Operator intervention shows goal/capability, step, reason, current state |
| R15 | §3.6 | Human operates the same live session and hands back control | Session ID stays constant, ownership changes, human actions recorded, checkpoint revalidated |
| R16 | §3.6 | Real pause/cede/resume mechanism and ownership model | Stale automation and human commands rejected after ownership changes |
| R17 | §3.7, pp. 5–6 | Credible surface and tenant reuse design | Adapter boundary, version compatibility, scoped overrides, drift rejection in report |

## Explicitly flexible choices

Language, runtime, framework, provider/model, UI automation technology, proxy application, schema, storage, locator strategy, process boundaries, and queue use are all the candidate's decision (§4).

A local sample app is permitted. We propose a synthetic banking-style proxy with controlled failure scenarios. No real bank credentials or member data are needed.

## What may be minimal or design-only

- Operator UI may be bare or mocked; actual live-session control transfer must work.
- Desktop implementation and real multi-tenancy are not required; their architectural seams must be credible.
- A complete real-time co-browsing product is explicitly out of scope.
- Infrastructure such as queues, clusters, and full tenant plumbing is not rewarded.
- Offline fixtures can support tests, but cannot replace the required genuine discovery run.

## Required delivery structure

1. **Public Git repository** with source code.
2. **`/README.md`**: setup, configuration/API keys, offline operation where applicable, exact discovery and replay commands.
3. **`/REPORT.md`**: approximately 1–3 pages, preserving these seven headings exactly:
   - Architecture
   - Artifact schema
   - Determinism & error handling
   - Heterogeneity & multi-tenant
   - Escalation & handoff
   - Safety
   - Cuts
4. **`/evidence/`**: saved example artifact, logs of an actual discovery run, and logs of a replay. A replay demonstrating an error/exception is strongly encouraged. We should also include takeover evidence to substantiate the core requirement. A screen recording is optional.
5. **Eventual submission** (§11): email the public repository link to `assignments@interface.ai`, with the URL on its own line, using the application email address; no ZIP. This is recorded as a submission checklist only.

Do not publish the supplied assignment PDF as part of our source repository by default. Our planning notes can paraphrase the requirements.

## Evaluation priorities, in the stated order

1. System design: boundaries, data models, simplicity, trade-offs; artifact and replay contract are central.
2. Correctness: a real discovery run and verified deterministic replay.
3. Robustness: explicit runtime outcomes, recovery, failure reporting, locators, waits, checkpoints.
4. Human escalation: actual control transfer and resumption.
5. Generalization: heterogeneous surfaces and reuse across institutions.
6. Safety and data handling.
7. Readable, typed, appropriately tested, runnable code.
8. Clear explanation of decisions and deliberate cuts.

## Optional stretch goals

The brief suggests at most one or two, after the core is solid: agent-facing capability interface; code generation; confidence/approval gating; bounded LLM-assisted recovery; cross-tenant canonicalization/overrides; repeated-run stability.

Recommended first stretch: replay the same artifact repeatedly and report observed stability. Recommended second, only if time remains: expose a small agent-facing catalog/invoke interface. Do not add model recovery to the core replay path.

## Completion definition

From a clean checkout, a reviewer can start the proxy, perform a genuine OpenAI discovery, inspect the generated capability, replay it with a different input without an API key, observe a typed business outcome and a bounded recovery, take control of the existing session during an intervention, return control, and inspect sanitized evidence. The concise report explains limitations and the desktop/tenant extension design.
