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

## Reading the design

The implementation plan is a starting proposal, not a record of implemented features. Its original time estimates and minimal-scope cuts will be revisited as the operating scope and stronger reliability goals are agreed. The roadmap reflects the current incremental approach.

Requirements define the minimum acceptance bar. Design decisions explain how we intend to meet and exceed it within a chosen scope. Tests and run evidence will establish what the implementation actually guarantees.

## As implementation progresses

- Record consequential accepted decisions and their alternatives alongside the design.
- Update sprint status only when its acceptance checks are satisfied.
- Add actual setup and demo commands to the root README after verifying them.
- Add sanitized live-run evidence with explicit provenance.
- Write the final report from implemented behavior, with unsupported cases and deliberate cuts stated clearly.

Avoid duplicating evolving contracts across documents. Link to their authoritative schemas and implementation when those files exist.
