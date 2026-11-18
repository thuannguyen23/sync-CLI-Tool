# Beads task contract and lifecycle

A Beads issue is an execution ledger item and must not rewrite the specification. Before creating one, capture references to:

- **Source**: the authoritative Paperclip/GitHub Issue, ticket or approved user request; include stable identifier/URL only. External tracker remains source of truth.
- **Plan**: approved plan/progress record path and the relevant step. A project may use another format; do not invent a new plan.
- **Scope**: exact component, change boundary and known exclusions.
- **Exit**: observable acceptance criteria and verification commands/outputs.
- **Dependencies**: real blocking predecessors rather than arbitrary sequencing.
- **Owner**: one executor at a time; review and approval roles are separate.
- **Evidence**: pointer to local test output/PR/progress entry, avoiding raw secrets or regulated data.

## Example (illustrative only)

```text
Source: Paperclip ECB-298 (authoritative requirements)
Plan: docs/superpowers/plans/ecb-298.md, step 3
Scope: Add conflicting-update regression in reissuance path
Blocked by: agreed concurrency design
Exit: deterministic conflicting-update test fails before fix, passes after; no silent overwrite
Evidence: test command/output recorded in plan
```

## Lifecycle

1. **Intake**: validate source and plan authority; no issue creation for mere Q&A.
2. **Plan**: use existing writing-plans/verification-planning as appropriate; map *meaningful* execution units to Beads with blockers.
3. **Ready**: inspect only issues authorized for the current task; `bd ready` excludes blocking predecessors, but does not validate approvals.
4. **Claim**: one executor claims the exact issue when allowed. In multi-writer mode ensure the shared backend is configured and tested; do not infer exclusivity from a local copy.
5. **Execute**: agent works from the plan and local code, recording concise factual progress and blockers.
6. **Verify**: fresh tests, self-review and any required human/independent review. Record evidence in the plan.
7. **Close**: close only the proven, authorized execution issue. Do not automatically close the source ticket or merge a PR.
8. **Resume/Handoff**: reference the Bead ID and plan path; next agent reconciles current DB, Git status and tests before continuing.

Beads state conflict resolution: the source/plan wins for requirements; Git and fresh checks win for implementation facts. When an issue title or status is wrong, reconcile explicitly instead of following it blindly.
