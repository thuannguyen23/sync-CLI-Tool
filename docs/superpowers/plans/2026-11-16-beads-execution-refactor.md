# Agent-neutral Beads Execution Workflow Refactor

> For agentic workers: read `AGENTS.md` and `rules/AGENTS.md` first. Use the existing project workflow; do not infer permission to install, delegate, commit, push, or modify other repositories from this plan.

**Goal:** Deliver one reliable execution lifecycle for Codex, Antigravity, and OpenCode, with opt-in per-project Beads state, safe cross-session handoff, and no changes to default host behavior.

**Architecture:** Keep the existing central `rules/`, `skills/`, `mcp/`, and native adapters as a configuration plane. A single lightweight, host-independent Beads bridge operates inside an explicitly enabled Git project and keeps its `.beads/` data there. Specification and approved plan remain authoritative; Beads holds execution state only. The existing distributor automatically links one new canonical skill to all three supported hosts; no Beads MCP or Gas Town dependency is installed.

**Tech stack:** Node.js >=24.15.0 built-ins, JSON manifest, existing Node test runner, optional external `bd` CLI (minimum documented v1.3.4), Git, Dolt managed by Beads.

**Scope and exclusions:** Implement the supplied documents in this checkout only; do not modify a bank project or local machine's actual configuration. Preserve upstream skills and host adapters. No automatic agent spawning, Git operations, background automation, package installation, `bd init`, remote synchronization, external ticket writes or privilege escalation. Concurrent writers require a separately authorized and verified server-backed Beads workspace; the default is serialized execution.

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

## Current implementation record (2026-11-16)

Authority: user explicitly authorized reconstruction from the supplied documents after creating branch `feat/beads-execution`. Original inputs in `docs/` remain unchanged. The missing original patch is not reconstructed byte-for-byte.

Quality tier: Standard, self-review-only; delegation is not authorized and independent review is not an acceptance requirement.

### Decisions and interface checks

- Bridge consumes the manifest described in [runbook](../../integrations/beads.md); skill invokes the same CLI. `serialized` is the only supported coordination declaration. A server deployment requires separate operational verification, not an invented automatic mode.
- Existing sync discovers skill directories dynamically; add an isolated all-host discovery regression, without altering distributors or host settings.
- Existing handoff preserves its output without `--bead`; optional IDs use a strict bounded syntax and never invoke `bd`.
- Beads v1.3.4 upstream `cmd/bd/main.go` documents strict `--readonly` and `--sandbox` (no auto-push); use both on read probes and sandbox on writes. Clear inherited database selectors and disable script hooks. This is a CLI boundary, not a filesystem/network sandbox; project Beads configuration and binary must be trusted and reviewed before real writes.
- Source references: https://github.com/gastownhall/beads/blob/v1.3.4/cmd/bd/main.go and https://github.com/gastownhall/beads/blob/v1.3.4/cmd/bd/ready.go . No installed real `bd`; fake CLI tests cannot prove Dolt/runtime compatibility.

### Acceptance and evidence map

| Unit | Acceptance | Evidence |
| --- | --- | --- |
| Bridge | Disabled/fallback, safe manifest, pinned process, command gate, bounded ready output | `tests/beads-workflow.test.mjs`, JS syntax, self-review |
| Skill/policy/distribution | Shared opt-in workflow, no extra authority, all supported destinations | Isolated skill sync regression, policy/consumer and link inspection |
| Handoff | Valid ID only, no DB reads, no overwrite/Git mutation, legacy output | `tests/handoff.test.mjs` |
| Docs | Executable paths and honest limits, preserve inputs | Local links/CLI help and smoke fixtures |
| Existing consumers | Preserve supported-host safety and workflow eval | Full `npm test`, syntax and whitespace |

### Progress

- Research/plan gate READY: supplied requirements + current peer/caller inspection; scope and missing patch resolved by user.
- Baseline: Node v24.22.3, `npm test` exit 0, 135/135 pass; `/tmp/sync-cli-beads-baseline.log`. Base HEAD `adc34832a1c99757129ecfcae479aa3315bef9d9`.
- Task 1 complete: bridge regressions captured RED before implementation (`/tmp/sync-cli-beads-red.log`), then 12/12 GREEN. Added RED/GREEN regressions for malformed ID types and DB preflight (`/tmp/sync-cli-beads-preflight-{red,green}.log`), plus maintenance-suppression environment regression (`/tmp/sync-cli-beads-maintenance-red.log`, covered by final GREEN suite).
- Task 2 complete: extracted all four skill files byte-for-byte from `docs/skill.zip`; isolated distribution regression failed before extraction and passed after it, across seven supported locations with repeated sync/personal entries preserved. Shared policy revision advanced to `focused-2026-11-16`; routing/permission semantics remain opt-in.
- Task 3 complete: optional `--bead` and strict identifier validation added without native CLI calls. RED/GREEN captured in `/tmp/sync-cli-beads-handoff-{red,green}.log`; existing handoff scenarios also pass.
- Task 4 complete: canonical runbook and README/local instructions linked; input documents/archive remain unchanged. No release ZIP or missing original patch is claimed as produced.

### Final verification and self-review

Candidate: base HEAD `adc34832a1c99757129ecfcae479aa3315bef9d9`, branch `feat/beads-execution`, uncommitted source changes dated 2026-11-16. No staged files. Node v24.22.3.

| Check | Result |
| --- | --- |
| `node --test tests/beads-workflow.test.mjs tests/handoff.test.mjs tests/sync-skills.test.mjs tests/rules-sync.test.mjs` | Exit 0, 30/30 pass; `/tmp/sync-cli-beads-focused.log` |
| `npm test` (final candidate) | Exit 0, 152/152 pass; `/tmp/sync-cli-beads-final.log`; includes supported-host/sync safety and workflow-eval fixtures |
| `node --check` on all 36 `scripts/*.mjs` and `tests/*.mjs` | Exit 0 |
| `bash -n setup.sh teardown.sh scripts/prerequisites.sh` | Exit 0 |
| `git diff --check` plus new-file whitespace scan | Exit 0 |
| Local Markdown link resolution (README, canonical plan/runbook, new skill) | No missing local links |
| Skill archive versus extracted canonical skill | All four files byte-identical |
| `node scripts/beads-workflow.mjs --help` and `inspect --project . --json` | Exit 0; this checkout reports DISABLED, no manifest/database created |

Self-review coverage: bridge parser/schema/version checks, subprocess cwd/environment/flags, read/write command grammar, ready projection/failure paths, manifest creation/no-overwrite, workspace symlink/redirect refusal; handoff validation and original output path; all new skill files; README/runbook/plan and shared/local rules; affected tests and unchanged dynamic distributors. Methods: source/caller/contract inspection plus execution against isolated/adversarial fixtures. Existing safety suite verifies host config preservation. No independent reviewer or native-agent pressure scenario was run.

Source research found optional automatic backup and journal pruning in upstream v1.3.4. The bridge disables both via documented `BD_*` environment mapping in addition to script hooks and automatic push. Real writes first pass strict-readonly ready validation. Ruling: these controls bound the bridge's requested operations; they cannot certify every side effect of a trusted third-party binary or custom project configuration. The runbook explicitly requires review/pilot for routing, credentials, server/storage configuration and migration behavior.

Execution gate READY for the local implementation: all mapped fixture/static checks pass, no unresolved local finding. Delivery gate READY with self-review-only and the limits below; this is not runtime deployment acceptance.

Remaining unverified: real Beads/Dolt integration and schema/version behavior, actual single-/multi-writer server coordination, native Codex/Antigravity/OpenCode sessions and instruction compliance, performance gains. No live `bd` binary was available. These require a separately authorized runtime pilot; Node fixtures prove the bridge and distribution contracts only.
- No install, live host sync, project DB initialization, commit, push, delegation or external tracker writes authorized/performed.
