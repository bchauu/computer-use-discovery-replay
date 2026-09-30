# Capability artifact v1

`CapabilityArtifactV1` is the compiler output and deterministic replay input for the first supported capability, `view_transaction_history`.

The discovery observer reads the rendered DOM and creates a bounded semantic observation in memory. It includes route, headings, visible text, and interactive-control metadata. Raw HTML is not persisted. After an action is validated and attempted, the run persists a strict `ActionEvidenceV1` record containing a sanitized state summary, the selected target and bounded structural context, the action outcome (`executed`, `not_executed`, or `failed_unknown_effect`), a post-action summary, and the independent completion result.

Successful executed evidence is compiled into a draft artifact. A rejected suggestion that never executed is not a workflow step. Any action with an unknown effect invalidates compilation, even if a later action reaches the goal. The compiler also rejects unsuccessful runs, missing post-action evidence, cross-run evidence, persisted fill actions, and targets that cannot be represented by the supported semantic strategies.

The initial artifact declares:

- `accountType`: `checking` or `savings`
- `period`: `latest`, `7_days`, `14_days`, or `30_days`
- a verified-member precondition
- typed actions and semantic targets with exact cardinality
- explicit browser/top-frame scope and expected action effects
- bounded retry conditions and timeouts
- per-step postconditions
- structured output extraction declarations, including exact and bounded pagination
- independent completion conditions
- discovery-run and tested-model provenance

Generated drafts remain under `.local/runs/<run-id>/artifact.draft.json` and are ignored by Git. The dispatcher resolves the preferred catalog entry for `view-transaction-history`: a validated artifact runs in `replay` mode, a draft runs in `validation_replay` mode, and no artifact starts discovery. A draft is promoted only after model-free replay succeeds with an account type or period different from its discovery input. The file catalog never replaces its validated preferred entry with a later unvalidated draft.

Replay resolves every semantic target to exactly one element, applies the central read-only origin/route/target/effect policy, executes within declared attempt and time bounds, and verifies a learned route/heading/selected-value checkpoint after every step. Runtime conditions produce typed business, recovery, intervention, and failure results with structural diagnostics. Final verification independently confirms the verified member, account type, history route, and selected period. Extraction follows the artifact's bounded exact-name pagination rule, checks progress and uniqueness, and returns all matching pages or an explicit failure. Replay imports no model transport and works without an OpenAI API key.

The source contracts are in `src/contracts/capability.ts`, `src/contracts/discovery.ts`, and `src/contracts/run.ts`. Discovery evidence construction is in `src/discovery/evidence.ts`, deterministic compilation is in `src/discovery/compiler.ts`, dispatch is in `src/discovery/dispatcher.ts`, and replay is in `src/discovery/replay.ts`.
