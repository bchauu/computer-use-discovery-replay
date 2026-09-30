# Architecture

The implementation demonstrates one bounded capability against Northline, a synthetic employee banking interface: show the currently verified member’s checking or savings transaction history for the latest entry or the last 7, 14, or 30 days. A React target provides controlled runtime conditions; Node/Express owns Playwright browser sessions; OpenAI drives discovery; a compiler converts executed evidence into a capability; and a separate interpreter performs replay without a model transport.

Discovery observes a compact inventory of visible controls, headings, route, and bounded text. GPT-4o mini returns one schema-constrained action at a time. Ordinary code validates the observation revision, target, action shape, policy, ownership epoch, budgets, and independently measured completion. Executed actions and observations—not a model-authored step list—feed compilation.

Replay resolves a catalog artifact and executes its parameterized steps directly. Both paths use the same session ownership model, origin boundary, runtime-state vocabulary, safe telemetry, and policy concepts. MongoDB is optional: local schema-validated files make the demonstrated slice runnable without database infrastructure.

# Artifact schema

The JSON artifact is typed, serializable, versioned, and reviewable. It declares the capability effect, browser/top-frame surface, typed inputs and UI mappings, verified-member preconditions, ordered actions, exact target strategies, expected action effects, retry permissions, postconditions, stable route/heading/value checkpoints, extraction rules, completion predicates, budgets, and discovery provenance.

Targets use exact accessible roles or labels. Account selection scopes the history link to exactly one row containing the requested account type. Missing or multiple targets never fall back to the first match. Member and account IDs are runtime bindings; sensitive example values are not stored as artifact inputs. A draft is promoted only after a different-input model-free replay succeeds, and the catalog does not replace a validated artifact with a later draft.

# Determinism & error handling

Replay makes no model calls and does not require an OpenAI key. Each step observes, resolves exactly one target, constructs an action intent, evaluates policy, checks ownership, executes once, rechecks its execution lease, classifies the resulting UI, and verifies the declared checkpoint. An action that throws after dispatch is `attempted_effect_unknown` and is not blindly repeated.

Runtime conditions distinguish business outcomes, bounded recovery, intervention, hard failure, cancellation, and session loss. An absent requested account and an empty transaction period are business outcomes. A loading screen causes bounded re-observation without repeating the navigation click. A recognized maintenance notice uses a separately authored, recorded recovery. Permission, unknown dialogs, and session expiry intervene; application errors, missing/ambiguous targets, forbidden destinations, and unsupported states stop explicitly.

Failure diagnostics include phase, artifact step, action-effect state, expected route/headings/target count, sanitized observed route/headings/state hash, recovery decision, and an evidence reference. Tests cover model budgets, stale model observations, ambiguity, policy denial, slow rendering, known and unknown dialogs, application failure, account absence, cancellation boundaries, and lost-session classification.

# Heterogeneity & multi-tenant

The demonstrated adapter is browser/DOM-based and explicitly declares top-frame scope. The abstraction separates a business capability from a product-version target profile and a tenant binding. A future tenant binding would supply base origin, locale, route mapping, and approved label variations while only narrowing policy. A product-version change that breaks targets or checkpoints would quarantine the binding for validation or rediscovery; it would not silently mutate the live capability.

Native desktop, visual anchors, cross-frame targets, hostile tenant isolation, durable workers, and broad vendor normalization are design extensions. They require implemented adapters and tests before being claimed. Browser contexts provide adequate demo isolation, not a production multi-tenant security boundary.

# Escalation & handoff

Synthetic employee-session expiry demonstrates real pause, cede, and resume. Replay detects the blocked state after navigation, preserves the same Playwright page and browser context, and exposes an intervention. A control-token-protected endpoint grants one human owner and increments the ownership epoch. The relay permits only the declared synthetic PIN field and re-authentication button. It records the fill without its value.

Resume is rejected until the blocked artifact checkpoint is restored. Successful resume increments the epoch again and returns control to deterministic replay. A second claim, stale human command, premature resume, late post-resume command, and cancellation after completion are rejected in the HTTP integration test. Human actions remain run evidence and do not alter the reusable capability.

# Safety

The target uses only fictional data and has no banking API or mutation implementation. A centralized read-only policy checks origin, route, top-frame scope, target semantics, form association, expected effect, and link destination immediately before replay actions. Unknown effects and submit controls are denied. Discovery separately constrains model actions, rejects password fills, validates observation revisions, and blocks effectful labels. UI and model text cannot widen policy.

Persisted evidence contains bounded structural observations rather than raw HTML. Password values are excluded at observation time; event purposes and diagnostics are sanitized; unrestricted errors are not dumped. The evidence exporter reparses selected files through their schemas, verifies zero model requests in replay, labels genuine/injected provenance, excludes screenshots, scans for the configured API key and synthetic PIN canary, and hashes exported files.

# Cuts

The implementation supports one read-only browser capability. It does not claim arbitrary natural-language task coverage, production authentication, exactly-once UI writes, native desktop support, general visual automation, production RBAC, encrypted evidence storage, durable queues, high availability, or real multi-tenant isolation. The natural-language dispatcher intentionally recognizes the supported account-history contract; an upstream agent-facing catalog is optional rather than necessary to prove discovery and replay.

The retained genuine run used GPT-4o mini for three model-directed UI actions. Reviewed evidence includes that run, different-input validation replay, cross-member replay, and injected same-session handoff. The included runtime scenarios are deterministic assessment fixtures, not a production reliability claim.
