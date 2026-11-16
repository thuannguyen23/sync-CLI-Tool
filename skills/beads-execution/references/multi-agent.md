# Multi-agent / cross-host execution safety

**Host portability:** Codex, Antigravity and OpenCode receive identical shared policy/skill through `sync-CLI-Tool`. An agent with shell access can call `bd` in its coding repository; an agent without shell must use an explicitly approved connector or fall back to the plan/handoff workflow. A symlinked skill is not proof that a host supports all shell features.

**One executor by default.** Do not equate `bd ready` with a dispatcher. Before delegating multiple authorized tasks:

1. Partition into independent, non-overlapping ownership scopes, preferably separate Git worktrees. Do not concurrently write the same source files or share one mutable checkout.
2. Record real dependencies. If B is blocked by A, do not launch B as if ready.
3. Use a shared, verified Beads server mode for concurrent writers/atomic claims, or one coordinator that *serializes* all Beads updates. Embedded Dolt has a single writer. Do not claim cross-clone atomicity or use independent un-synced databases as a shared lock.
4. Assign exact Bead IDs, scope, tests and return artifacts to each worker. An orchestrator (e.g., Orca when explicitly authorized and available) handles spawning; Beads only tracks state.
5. Review integration changes; rerun tests in the merged worktree, and close issues after evidence. Approval, commit/push, remote sync and deploy are separate explicit actions.

If a worker is interrupted or another agent's claim is ambiguous, stop that shared mutation, inspect `bd show` in the actual backing workspace and reconcile ownership before resuming. Do not use `--force` or delete locks to hide a conflict.

Do not configure Gas Town, MCP bridges, `bd setup`, hooks, Dolt remotes or server mode implicitly. These are separate deployment decisions with version compatibility and operational costs.
