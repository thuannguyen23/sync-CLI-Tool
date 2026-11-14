# Unified Agent Policy Implementation Plan

Status: COMPLETE for the authorized bounded scope. User approved consolidating essential workflow routing in
one AGENTS.md and keeping detailed procedures in existing skills. This amends
the earlier two-file implementation; its archived evidence remains at
~/.local/state/sync-cli-tool/evidence/2026-11-14-shared-workflow-155850/.

Goal and scope: all supported hosts receive the same self-contained policy;
remove the requirement to read a separate workflow document. Preserve user
changes, authorization semantics, canonical skill selection, six-area planning,
plan resumption, impact analysis, verification, review and repair limits.
No upstream skill edits, dependency installations, Git mutations, or delegation.

Design: consolidate the required orchestration into rules/AGENTS.md with a
policy revision. Mirror Cursor exactly. Remove rules/WORKFLOW.md. Update the
shared distributor to remove only old owned WORKFLOW.md symlinks (including
dangling and aliased links), after successfully linking the current policy.
Keep personal files, unrelated links and skipped hosts intact. Doctor checks
only the canonical policy. Existing setup delegation remains valid; teardown
retains ownership-aware cleanup for legacy workflow links.

Acceptance and checks:
- One policy contains routing, resumption, planning, skills and completion gates.
- Rules sync succeeds without any workflow source and is idempotent.
- Owned stale links are removed; personal files/unrelated links/skipped clients
  survive; missing canonical policy fails before configuration changes.
- Doctor detects policy drift without requiring WORKFLOW.md.
- Existing isolated suite, JS/Bash syntax, and staged/working diff checks pass.
- Apply rules sync live; inspect all supported targets and three priority hosts.
- Run fresh read-only Codex/OpenCode/AGY sessions that report the policy revision
  and routes from loaded instructions, without prompting them to read a workflow.
  This is a bounded loading/routing probe, not general compliance or performance.

Tasks:
- [x] Establish RED for single-file distribution, safe migration and doctor.
- [x] Apply policy, scripts, documentation and remove the separate workflow.
- [x] Run focused/full isolated verification and inspect the scoped diff.
- [x] Apply live distribution and verify policy content and old-link cleanup.
- [x] Run bounded native loading/routing probes and record evidence/limits.

Progress: COMPLETE. Four expected RED failures established; focused 61/61 and
full 124/124 passed in isolated HOME, with zero skipped tests. JS/Bash syntax and
both staged/working diff checks passed. Live rules sync ran twice and linked 10
matching policy files; no managed workflow links remain and doctor reported no
ERROR rows. Policy is 9,237 bytes. Staged changes remain the original three files
and +75 lines; no Git mutation, installation, or upstream skill edit occurred.

Fresh native sessions: Codex 0.167.2, OpenCode 2.2.7 using
opencode/deepseek-v4.1-flash-free, and AGY 1.5.9 all exited 0 without timeout.
All reported unified-2026-11-14 and correctly answered investigation, tiny edit,
plan resumption, no separate workflow dependency, canonical skill priority,
persistent authorization, and three-round repair limit from loaded instructions.
Event logs show zero tool calls; no additional instruction file reads occurred.
This establishes bounded instruction availability/routing, not universal task
compliance, actual skill execution, or a speed benchmark. Codex MCP was disabled
only through per-invocation overrides. Native probes were sequential.

Review: self-review only. Full setup and live teardown were not executed; their
existing isolated consumer regressions passed. Historical workflow cleanup in
teardown remains for compatibility, and personal files/unrelated links survive.

Evidence directory: /home/thuannguyen23/.local/state/sync-cli-tool/evidence/2026-11-14-unified-policy-161304
Includes RED/GREEN logs, full tests, native JSONL traces, live inventory,
summary.json and final-scoped.diff. Evidence permissions are private.

Current step: complete. Blockers: none for this scope. Next: ordinary tasks use
the unified policy; broader behavioral/performance evaluation is separate.
