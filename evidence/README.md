# Reviewed evidence

This directory contains schema-validated, sanitized evidence selected from local runs. `manifest.json` records provenance: `genuine_openai` is the paid discovery run, `live_model_free_replay` is deterministic Playwright replay, and `injected_runtime_condition` is the explicitly synthesized session-expiry takeover.

Run `npm run evidence:export` to reconstruct the bundle from the retained local run IDs. The exporter parses every run, artifact, event, and action-evidence record through the public schemas, excludes raw HTML and screenshots, verifies that replay contains no model requests, and scans for OpenAI keys and the synthetic employee PIN canary before writing the manifest and hashes.

The checked-in evidence uses fictional Northline members and accounts. It contains no real banking connection or customer data.
