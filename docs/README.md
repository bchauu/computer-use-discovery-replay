# Documentation hub

Start with the [project overview](../README.md), then follow the [sprint roadmap](roadmap.md).

| Document | Status | Use it for |
|---|---|---|
| [Requirements](requirements.md) | Extracted assessment baseline | Understanding the required behavior and deliverables |
| [Implementation plan](implementation-plan.md) | Proposed design | Exploring architecture, contracts, data flow, and alternatives |
| [Setup](setup.md) | Core vertical slice verified | Environment, commands, and verification limits |
| [Capability artifact](capability-artifact.md) | V1 contract implemented and validated | Understanding observation, persisted evidence, compilation, and validation status |
| [Roadmap](roadmap.md) | Active planning | Choosing the next feature increment and its acceptance gate |
| [Acceptance traceability](acceptance.md) | R1–R17 verified locally | Mapping requirements to implementation, tests, and evidence |
| [Reviewed evidence](../evidence/README.md) | 12 runs plus stability study | Inspecting genuine discovery, model-free replay, runtime outcomes, and provenance |
| [Silent demo](assets/demo.mp4) | 27-second product walkthrough | Seeing the operator inspector, deterministic replay, and human takeover |

## Reading the design

The implementation plan is a starting proposal, not a record of implemented features. Its original time estimates and minimal-scope cuts will be revisited as the operating scope and stronger reliability goals are agreed. The roadmap reflects the current incremental approach.

Requirements define the minimum acceptance bar. Design decisions explain how we intend to meet and exceed it within a chosen scope. Tests and run evidence will establish what the implementation actually guarantees.

## Evidence discipline

- Record consequential decisions and alternatives alongside the design.
- Update sprint status only when its acceptance checks are satisfied.
- Label genuine model activity, model-free execution, scripted presentation, and injected conditions separately.
- Export only sanitized, schema-valid evidence and verify hashes before publishing.
- Keep the final report grounded in implemented behavior, with unsupported cases and deliberate cuts stated clearly.

Avoid duplicating evolving contracts across documents. Link to their authoritative schemas and implementation when those files exist.
