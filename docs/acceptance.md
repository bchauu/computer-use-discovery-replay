# Acceptance traceability

Verified locally on 2026-09-30. “Injected” means a deterministic condition in the synthetic React target; it is never presented as genuine model behavior.

| Requirement | Implementation | Verification/evidence |
|---|---|---|
| R1 Goal and entry point | Managed session plus natural-language run request | Dispatcher and API integration tests |
| R2 Genuine live discovery | OpenAI one-action observe/decide/act loop | `evidence/runs/discovery-live` |
| R3 Bounded execution | Step, time, repeated-state, model-call, token, action, recovery, and handoff bounds | Discovery tests and runtime matrix |
| R4 Typed versioned artifact | Strict Zod artifact separate from transcript | `evidence/capability.json`; compiler tests |
| R5 Actions and robust targets | Ordered actions, exact role/label strategies, cardinality, top-frame scope, effect declarations | Capability and ambiguity tests |
| R6 Typed I/O and success | Parameter bindings, bounded pagination, extraction contract, checkpoints, independent completion | Validation, cross-member, and full-pagination replay evidence |
| R7 Model-free replay | Replay controller imports no model transport | Replay evidence has zero model-request events |
| R8 Runtime conditions | Business outcomes, loading, known/unknown dialogs, permission, app error, expiry, ambiguity | Runtime integration test and exported scenario runs |
| R9 Outcome taxonomy | Success, business outcome, intervention, hard failure, cancellation | Public run schema and scenario assertions |
| R10 Failure diagnostics | Phase, step, effect state, expectations, sanitized observation, recovery decision, evidence ref | Application-failure evidence |
| R11 Policy | Origin, route, surface, target semantics, expected effect, destination, discovery restrictions | Forbidden-destination and effectful-target tests |
| R12 Sensitive data | Password omission, bounded sanitization, no raw HTML, reviewed export scan | Evidence manifest review fields and canary tests |
| R13 Structured logs/evidence | JSONL event timeline, state hashes, action evidence, diagnostics | Reviewed evidence bundle |
| R14 Intervention context | Typed intervention result with step diagnostic and current structural state | Permission and expiry evidence |
| R15 Same-session human control | Original page/context retained; sanitized human actions; checkpoint revalidation | Handoff system run and API test |
| R16 Pause/cede/resume ownership | Exclusive owner, epoch fencing, stale/late command rejection | HTTP handoff integration test |
| R17 Surface/tenant reuse design | Browser adapter scope, product profile and tenant-binding design, drift rejection | `REPORT.md` and implementation plan |

## Final local commands

```sh
npm ci
npm run browser:install
npm run check
```

With `npm run dev:bank` running in another terminal:

```sh
npm run test:bank-ui
npm run replay:catalog
npm run runtime:system
npm run handoff:system
npm run evidence:export
```

`npm run live:system` performs a new paid discovery and requires `OPENAI_API_KEY`. Existing reviewed discovery evidence is included, so ordinary replay and automated verification require neither an API key nor MongoDB.
