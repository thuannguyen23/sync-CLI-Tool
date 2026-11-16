# Agent-neutral Beads Execution Workflow Refactor

> For agentic workers: read `AGENTS.md` and `rules/AGENTS.md` first. Use the existing project workflow; do not infer permission to install, delegate, commit, push, or modify other repositories from this plan.

**Goal:** Deliver one reliable execution lifecycle for Codex, Antigravity, and OpenCode, with opt-in per-project Beads state, safe cross-session handoff, and no changes to default host behavior.

**Architecture:** Keep the existing central `rules/`, `skills/`, `mcp/`, and native adapters as a configuration plane. A single lightweight, host-independent Beads bridge operates inside an explicitly enabled Git project and keeps its `.beads/` data there. Specification and approved plan remain authoritative; Beads holds execution state only. The existing distributor automatically links one new canonical skill to all three supported hosts; no Beads MCP or Gas Town dependency is installed.

**Tech stack:** Node.js >=24.15.0 built-ins, JSON manifest, existing Node test runner, optional external `bd` CLI (minimum documented v1.3.4), Git, Dolt managed by Beads.

**Scope and exclusions:** Refactor this ZIP only; do not modify a bank project or local machine's actual configuration. Preserve upstream skills and host adapters. No automatic agent spawning, Git operations, background automation, package installation, `bd init`, remote synchronization, external ticket writes or privilege escalation. Concurrent writers require a separately authorized and verified server-backed Beads workspace; the default is serialized execution.

## Invariants

1. Specs/approved plans and project rules outrank Beads issue text; `bd ready` is not work authorization.
2. Opt-in is explicit, per project. A repository without `.agent-workflow.json` behaves exactly as before.
3. A bridge command cannot silently create/migrate databases, install hooks, modify host files or run network sync.
4. Beads calls must be shell-free, target the selected Git root and not inherit another repository's `BEADS_DIR`.
5. Handoff references tasks but never copies issue descriptions, secrets or Beads database content.
6. Only one executor owns a work unit; parallel workers require independent scopes/worktrees and safe shared writer coordination. External Review is reported honestly.
7. Missing/incompatible Beads degrades to the existing plan/handoff workflow rather than blocking legitimate work.

## Planned files and acceptance tests

### Task 1: Project-level bridge
- Create `scripts/beads-workflow.mjs` implementing `inspect`, `ready`, `enable` (preview by default, `--apply` opt-in). Validate project Git root, manifest, Beads workspace, supported CLI, and safe paths. A version-aware, read-only probe must not mutate the repository; `enable` writes only a new `.agent-workflow.json`, never a database.
- Test `tests/beads-workflow.test.mjs`: unconfigured, valid, missing CLI, old CLI, malformed/linked manifest, wrong workspace, repeated enable, local-path project with spaces, in-project process cwd, malformed ready JSON, no hostile shell interpolation, and symlink safety.

### Task 2: Portable agent instructions
- Create `skills/beads-execution/SKILL.md` with succinct workflow and references for task contracts, lifecycle, and concurrent-agent constraints.
- Extend `rules/AGENTS.md` with a compact opt-in section (no duplicate workflow). Keep all upstream skills untouched and use existing `sync-skills` for Codex/AGY/OpenCode.
- Add tests asserting skill discovery by each supported host and that native host settings need no additional Beads hooks/MCP.

### Task 3: Reliable handoff
- Extend `scripts/handoff.mjs` with optional `--bead <id>` reference and safe, non-sensitive resume instructions. Keep `--task` required and original output stable when no bead is supplied.
- Extend `tests/handoff.test.mjs`: opt-in reference, strict ID validation, no Beads command or issue text included, no write to an existing handoff, no Git mutations.

### Task 4: Documentation and verification
- Document architecture, per-project initialization, trust/authorization boundaries, standalone vs parallel mode, version migration, skill lifecycle, and executable smoke scenarios in `docs/integrations/beads.md` and README.
- Run focused tests, all available Node tests, JavaScript/shell syntax and a source/fixture audit; report Node-version environmental failures honestly. Do not run live sync or `bd init` in user repositories.

## Review focus

- No manifest: does a session use the old workflow with no new writes?
- A malicious or broken `.agent-workflow.json`: does the bridge reject it rather than run a command or overwrite the file?
- A different global `BEADS_DIR`: are operations pinned to the requested project, preventing mistaken issue operations?
- `bd` absent/outdated: is the failure clear and does the agent have a documented offline fallback?
- Multiple agent environments: do all three get identical behavior and can neither `bd ready` nor a project file override human approvals?

## Progress

- [x] Inspected ZIP and existing policy/sync/handoff/tests; confirmed baseline under Node 22: 134/135 pass, setup host test requires Node >=24.15.0.
- [x] Added bridge, explicit native read/write command gate, portable skill, shared policy, and bead-only handoff with isolated regressions.
- [x] Checked full suite (147/148 on Node 22.16.0; only setup host fixture fails due documented Node >=24.15.0 requirement), focused bridge/handoff/rules tests and all JS/Bash syntax. No live bd binary was available, so runtime tests use fake bd plus isolated Git fixtures.
- [x] Prepared a self-contained release ZIP and a separately validated skill ZIP; no real host sync, project init, Dolt DB migration, or native agent runtime invocation was performed.

## Final self-review

- Authority and source selection: existing `rules/AGENTS.md` and project-specific spec/plan remain primary; Beads is a secondary execution ledger. No new universal approval or automatic dispatch.
- Storage/ownership: the sync-CLI-Tool checkout does not store `.beads` data. Only a manually initialized target coding repository can opt in through its versioned `.agent-workflow.json`.
- Host coverage: existing `sync-skills.mjs` links the new skill to all seven supported Codex/AGY/OpenCode directories; no MCP, hooks or model/provider configurations changed.
- Safety tests: opt-in preview is read-only, `enable --apply` writes only a new manifest, version and database probes guard enable, malformed/symlinked/oversized manifests are rejected, global Beads DB selectors are cleared, native writes require an explicit flag, dangerous commands are denied, and handoffs carry only safe task IDs.
- Compatible upstream CLI and actual Dolt single-/multi-writer behavior were not integration-tested. Real model compliance, performance gains and native agent capability are unknown pending an authorized pilot. No independent agent reviewed the implementation.
- Available Node is v22.16.0, below the repository's required >=24.15.0. The pre-existing setup fixture fails for that reason both before and after changes; all other full-suite cases pass. Node 24 CI must run before production distribution.
