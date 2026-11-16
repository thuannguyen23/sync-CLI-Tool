---
name: beads-execution
description: Coordinate or resume implementation tasks in a Git repository that explicitly uses Beads (bd) for durable execution state. Use when a user asks an agent to continue a Beads issue, track multi-step implementation progress, work across Codex/OpenCode/Antigravity sessions, inspect blockers, or prepare a Beads-linked handoff. Do not trigger for ordinary questions, small standalone edits, or projects without an enabled Beads workflow.
---

# Beads execution across coding agents

Beads tracks **execution state**, not specification authority, approval or agent dispatch. Keep the agreed project spec and approved plan as the source of work. Do not use `bd ready` as permission to start unrelated tasks. Follow the shared host policy, project AGENTS.md and user instructions first.

## Start or resume

1. Read project instructions, task's canonical spec/issue, approved plan and current Git status. Establish whether this is new, in progress, verifying or reviewing work; do not reopen completed design phases.
2. Inspect the project opt-in (the helper is distributed with `sync-CLI-Tool`):

   ```bash
   node ~/.agents/scripts/beads-workflow.mjs inspect --project . --json
   ```

   If the helper is not present at that location, locate this repository's `scripts/beads-workflow.mjs`; if unavailable, inspect `.agent-workflow.json` and run the native `bd` CLI only after verifying its workspace. Do not install software to recover a missing helper.
3. `DISABLED` or `FALLBACK`: use the existing plan/progress/handoff. Do not run `bd init`, install a plugin or create a task database automatically. `AVAILABLE`: use the pinned bridge and optionally the bounded ready queue:

   ```bash
   node ~/.agents/scripts/beads-workflow.mjs run --project . -- prime
   node ~/.agents/scripts/beads-workflow.mjs run --project . -- show <assigned-id>
   node ~/.agents/scripts/beads-workflow.mjs ready --project . --json
   ```
4. Compare Beads' recorded status with the current worktree and fresh tests. Treat discrepancies as a reconciliation task; do not close, overwrite or claim work from stale status.

## Execute within authority

- Before creating an issue, identify the explicit parent issue/spec, approved plan and observable exit criterion. Use the [task contract](references/task-contract.md). A plan's small checkboxes need not each become a Bead.
- Use the bridge `ready` to discover unblocked work and `run -- dep tree <id>` to inspect dependencies. Select only work authorized by the user or upstream task scope.
- If authorized to write to that workspace, use `node ~/.agents/scripts/beads-workflow.mjs run --project . --allow-write -- update <id> --claim` to claim the exact issue; record meaningful discoveries with `run --allow-write -- remember <insight>` only if appropriate and non-sensitive. `--allow-write` is a *local safety flag*, not approval to mutate an external service. Never embed passwords, tokens, personal data or bank/customer records in Beads.
- Use the existing phase-appropriate skills for investigation, TDD, implementation and verification. Beads does **not** replace `executing-plans`, `systematic-debugging` or `verification-before-completion`.
- Close an execution issue only after its own acceptance tests and expected review/approval gates are satisfied, with an evidence pointer in the authoritative progress record (use `run --allow-write -- close <id>`). Never force-close blockers merely to make a ready queue green.
- For a session handoff, generate `node ~/.agents/scripts/handoff.mjs --project . --task <notes.md> --bead <id> --output <new-file.md>` if the user authorized the handoff write. Handoff stores only the Bead identifier; the next agent reads its current state.

## Multi-agent mode is conditional

Beads is **not** an orchestrator. Do not spawn workers or assume automatic parallelism. Default to one executor. Follow [multi-agent safety](references/multi-agent.md) before parallel work. Shared embedded Dolt is single-writer; genuine concurrent claims require an independently configured and verified server-backed workspace or a coordinator serializing writes.

## Further detail

- [Task contract and lifecycle](references/task-contract.md)
- [Multi-agent and worktree safety](references/multi-agent.md)
- For installation and compatibility, see `docs/integrations/beads.md` in the canonical `sync-CLI-Tool` checkout.
