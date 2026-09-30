# Foundation setup

## Scope

The project includes two React/Vite applications and two Express entry points, optional MongoDB connection handling, and verification scripts. The completed vertical slice adds a managed Playwright session, OpenAI discovery, strict action and policy validation, runtime classification, diagnostics, bounded recovery, safe local/Mongo telemetry, deterministic artifact compilation, capability dispatch, model-free replay, and same-session human control transfer.

One root npm package keeps installation simple. `apps/operator` and `apps/bank` have independent Vite configurations. `src/automation` and `src/bank` start separate services; `src/shared` contains generic health and lifecycle wiring. No automated route can read bank data.

## Current installation status

The setup machine has Node 22.22.0, npm 10.9.4, and MongoDB Community 7.0.16. Dependencies have now been installed and `package-lock.json` generated. `npm ls --depth=0` confirms all declared packages are present. The Playwright Chromium executable is also present.

Verified on 2026-09-30: strict TypeScript checking, the automated suite, server compilation, production builds, Chromium-driven discovery/replay integration, runtime-condition matrix, HTTP handoff integration, and the complete banking walkthrough pass. GPT-4o mini completed a genuine three-action discovery; separate processes replayed the persisted artifact with different inputs and members with zero model calls. The reviewed evidence exporter validates provenance and sensitive-value scans.

Use `npm ci` for reproducible installs from the lockfile. No model calls were made during these checks.

## Database setup

Copy `.env.example` to `.env` if it does not exist. `npm run db:local` starts an isolated MongoDB process on loopback port 27018 with project-local data under `.local/mongo`. Stop it with Ctrl+C. It does not use or alter another project's database.

Alternatively, supply dedicated `AUTOMATION_MONGODB_URI` and `BANK_MONGODB_URI` values. Use separate database credentials with limited privileges for hosted deployments. `npm run db:check` pings each configured server without writing data and suppresses connection details on errors.

The local standalone server is sufficient for the initial read-only target and foundation checks. It does not support multi-document transactions; introduce a replica set if the accepted persistence design requires them. Do not weaken consistency requirements merely to preserve the local topology.

## OpenAI

The server uses the Responses API with strict Structured Outputs. `OPENAI_MODEL` defaults to `gpt-4o-mini` and remains configurable. Configure `OPENAI_API_KEY` only for an authorized live discovery run. Never expose secrets through Vite-prefixed variables. The first retained genuine run used three model calls, 3,636 input tokens, and 162 output tokens; its evidence contains no copy of the configured key.

For an explicitly injected local wiring check, set `DISCOVERY_MODEL_MODE=mock` or run `npm run mock:system` while the banking UI is running. The mock provider uses the same discovery controller and strict action contract, but its choices are scripted and must never be described as genuine LLM discovery evidence. If `AUTOMATION_MONGODB_URI` is reachable, `mock:system` uses an isolated temporary database and removes it afterward; otherwise, it exercises the local-file fallback. It leaves reviewable local run evidence under `.local/runs/`.

The first-run defaults allow 40 actions, ten minutes overall, two minutes per model request, 30 seconds per UI action, three transient model attempts, and three repeated identical state/action decisions. All are configurable in `.env`. Authentication/configuration errors stop; transient rate-limit, timeout, connection, and 5xx failures retry with bounded exponential delay. A failed UI click is recorded as an unknown-effect result and is not blindly repeated.

## Verification commands

- `npm run typecheck`: strict TypeScript checks across services and UIs.
- `npm test`: all Node and Chromium integration tests. Restricted environments must permit loopback servers and browser launch.
- `npm run test:discovery`: goal/action contracts, artifact compilation/catalog behavior, and Chromium-driven dispatcher/replay tests without a model call.
- `npm run test:bank-ui`: full employee lookup, verification, account, history, empty-state, and route-isolation walkthrough; start `npm run dev:bank` first.
- `npm run mock:system`: injected discovery → draft compilation → different-input model-free validation replay against the running real banking UI.
- `npm run live:system`: genuine OpenAI discovery → draft compilation → different-period model-free validation replay against the running real banking UI.
- `npm run handoff:system`: injected employee-session expiry → same-session human relay → checkpointed model-free resume.
- `npm run evidence:export`: reconstruct and scan the reviewed evidence bundle from retained local runs.
- `npm run build`: type-check, compile services, and build both React apps.
- `npm run db:check`: read-only database connectivity check.
- `npm run browser:check`: launch Chromium and click a local in-memory test page. It is a tooling smoke check, not discovery evidence.

Health routes are development diagnostics only. These services bind to loopback and do not yet provide production authentication or durable browser-session recovery.
