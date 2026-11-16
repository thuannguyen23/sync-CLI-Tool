# Agent-neutral execution workflow: Beads integration

This document is the operational runbook for `sync-CLI-Tool`'s **optional** per-project Beads integration. The integration exists to solve durable execution state and dependency tracking across **Codex, Antigravity, and OpenCode**. It does not replace source requirements, approved plans, human approvals, or an agent orchestrator.

References: [Beads project](https://github.com/gastownhall/beads), [current setup recipes](https://github.com/gastownhall/beads/blob/main/docs/getting-started/ide-setup.md), [dependency semantics](https://github.com/gastownhall/beads/blob/main/docs/core-concepts/dependencies.md), [installation](https://github.com/gastownhall/beads/blob/main/docs/getting-started/installation.md). CLI behavior and versions must be checked at deployment time.

This checkout reconstructs the integration from the supplied documents and skill
archive; it is not a byte-for-byte application of the unavailable original patch.
The current acceptance record is [the implementation plan](../superpowers/plans/2026-11-16-beads-execution-refactor.md).
The original files in `docs/` are preserved inputs; their older test counts and
ZIP release claims are not verification results for this implementation.

## 1. Architecture and source-of-truth contracts

```text
                    HUMAN / APPROVED REQUIREMENTS
                  Paperclip / GitHub / project spec
                                |
                         approved plan
                                |
                     shared global rules
                                |
               +----------------+----------------+
               |                |                |
             CODEX         ANTIGRAVITY        OPENCODE
               |                |                |
               +-------- first-party beads-execution skill
                                |
           coding repository's .agent-workflow.json (opt-in)
                                |
                     scripts/beads-workflow.mjs
                                |
                       bd CLI + .beads/
                                |
                   Dolt execution ledger
                  (ready/blocked/claim/history)
                                |
              approved coding/verification/review
                                |
                 existing plan + Git + handoff
```

**Authority hierarchy:** host/system/user authorization, project-specific architecture and canonical spec, approved plan, current source and verified evidence; Beads is a *derived execution ledger*. A Bead may link to a spec/plan but cannot silently amend either. Git and fresh checks determine implementation facts. `bd ready` means *unblocked*, never *approved for autonomous execution*.

**State boundaries:**

- `sync-CLI-Tool` owns only shared policy, skills and host configuration links. It contains no project task DB.
- The **coding repository** owns its `.agent-workflow.json` and `.beads/` workspace. Different projects should not share one accidental `BEADS_DIR`.
- The user/project's canonical tracker (Paperclip, GitHub Issues or other chosen source) owns requirements and business status. No automatic two-way issue sync.
- An orchestration tool (if separately approved) owns agent creation/delegation, not Beads. Beads tracks tasks and dependencies.
- `handoff.mjs` owns a minimal snapshot and optional Bead ID; it does not serialize issue content or claim review success.

### Task state transitions

| Stage | Agent action | Evidence / boundary |
| --- | --- | --- |
| Intake | Identify canonical source, task owner and authority | Spec link, scope and approved/user-given goal |
| Investigation/design | Read project code; resolve material choices | Existing approved spec/ADR; no Beads issue for mere Q&A |
| Plan | Write or resume one authoritative plan | Acceptance and verification criteria mapped to meaningful work units |
| Ready | Inspect `.agent-workflow.json`, `bd prime`, `bd show`, `bd ready` | Do not run unrelated ready work |
| Claim | One authorized worker claims an exact Bead | `bd update <id> --claim`, when its DB mutation is authorized |
| Execute | Implement only the planned task with phase-specific skills | Git changes; blocker/discovery recorded as needed |
| Verify | Tests, review, evidence | Fresh commands/results; don't substitute status labels for tests |
| Close | Close proven execution step, report upstream task separately | `bd close <id>` only after criteria; no auto PR/issue close |
| Handoff | Capture plan progress + Git snapshot + Bead ID | Next agent must reconcile current project state and DB |

The global workflow in `rules/AGENTS.md` remains applicable to questions, small edits, substantial work, debugging, review and verification. Beads only augments the execution paths that need persistent task state.

## 2. Repository onboarding (no automatic install or mutation)

First, install Beads yourself using a trusted release (e.g. `brew install beads` or `npm install -g @beads/bd`) and verify the checksum/version using Beads' release instructions. This integration currently requires **bd >=1.3.4**; a repo pinned to an older verified version must be reviewed/migrated separately instead of forcing an upgrade. Check upstream migration notes before moving an existing Dolt-backed project.

Inside the **target coding repository**, not in `sync-CLI-Tool`:

```bash
cd /path/to/coding-repository
bd version

# Explicit, reviewed initialization of that project's database.
# The skip flags avoid clobbering this workflow's shared instructions/hooks.
bd init --skip-agents --skip-hooks

# Review new/modified files and .gitignore before sharing anything.
git status --short

# Read-only; initially reports DISABLED until opting in.
node /path/to/sync-CLI-Tool/scripts/beads-workflow.mjs inspect --project . --json

# Preview first (no write).
node /path/to/sync-CLI-Tool/scripts/beads-workflow.mjs enable --project .

# Only when you explicitly authorize writing the project manifest:
node /path/to/sync-CLI-Tool/scripts/beads-workflow.mjs enable --project . --apply

# Read-only discovery / bounded ready task fields.
node /path/to/sync-CLI-Tool/scripts/beads-workflow.mjs ready --project . --json
```

`enable --apply` writes only a new, private `.agent-workflow.json`, after checking an existing real `.beads/` directory, `bd version` and a successful strict-readonly `bd ready --json --limit 50`. Preview performs the same probes without creating the manifest. Repeated enable validates and preserves an existing manifest; it does not rewrite it. It **does not** run `bd init`, mutate global agent configs, install Git hooks, claim work, write a Beads issue, run remote sync, or dispatch agents. Symlinked workspaces and `.beads/redirect` are refused. Use a verified installation and review schema compatibility before enabling.

A project manifest looks like:

```json
{
  "schemaVersion": 1,
  "tracker": {
    "provider": "beads",
    "coordination": "serialized",
    "minimumVersion": "1.3.4"
  }
}
```

This is a **capability declaration only**; it never grants permissions. Unknown keys and symlinks are rejected. `serialized` means *one Beads writer at a time*, even if multiple agents can independently inspect state. It does not assert a distributed lock and it does not convert separate embedded databases into a shared source of truth.

For a private or team repository, review Beads' `.beads/` files and Dolt remote guidance. Decide explicitly which metadata and remote refs are safe to share. Do not commit secrets, `.beads/.env`, local runtime databases, imported customer data or unsafe paths. Do not blindly copy another repository's database or issue prefix.

## 3. How each supported agent starts

The existing sync (`scripts/sync-skills.mjs` + `scripts/sync-rules.mjs`) distributes one shared policy and one `beads-execution` skill. The new integration makes **no** host-specific additions to `mcp/servers.json`, `sync-hooks.mjs` or native plugins.

| Host | Shared skill installed by existing sync | Task access |
| --- | --- | --- |
| Codex (default and `$CODEX_HOME`) | `.../skills/beads-execution/SKILL.md` | Agent reads project, uses shell/`bd` if allowed |
| Antigravity Global/CLI/IDE/App | `~/.gemini/<host>/skills/beads-execution/SKILL.md` | Same skill/policy; respect host tool permissions |
| OpenCode | `~/.config/opencode/skills/beads-execution/SKILL.md` | Same skill/policy, no forced provider or plugin |

The skill points to the canonical bridge: `~/.agents/scripts/beads-workflow.mjs` when installed through `setup.sh`, otherwise use an explicit path to the checkout. Native `bd` is a shell CLI, so an agent with no shell permission cannot run it solely by reading a skill: use the approved existing plan/handoff fallback or separately configure a verified MCP service. No model or host automatically becomes an orchestrator.

At the start of an **approved execution** session:

```bash
node ~/.agents/scripts/beads-workflow.mjs inspect --project . --json
# only if AVAILABLE; all native bd commands use the pinned project bridge:
node ~/.agents/scripts/beads-workflow.mjs run --project . -- prime
node ~/.agents/scripts/beads-workflow.mjs run --project . -- show <assigned-issue-id>
node ~/.agents/scripts/beads-workflow.mjs ready --project . --json
# mutation only when permitted by the current task and human policy:
node ~/.agents/scripts/beads-workflow.mjs run --project . --allow-write -- update <assigned-issue-id> --claim
```

`run` pins the exact Git root and `BEADS_DIR`, and removes inherited `BEADS_DOLT_SERVER_DATABASE`/`BD_DOLT_SERVER_DATABASE` selectors to avoid accidentally using a different Town/Rig database. Only known read commands run by default. Mutating `create`, `update`, `close`, `remember` and dependency add/remove require an explicit `--allow-write`; destructive commands, setup, migration and remote sync are refused even with it. This flag does not grant permission: the user's authorization and project policy still apply. For other CLI commands, use a separately reviewed manual invocation.

The bridge invokes `bd` directly without a shell. It clears inherited `BEADS_*`,
`BD_*`, `DOLT_*` and `GIT_*` selectors, sets the project's `BEADS_DIR`, disables
script hooks (`BD_NO_HOOKS=1`), automatic backup (`BD_BACKUP_ENABLED=false`) and
journal auto-pruning (`BD_EVENTS_JOURNAL_AUTO_PRUNE=false`). Every call uses
`--sandbox` to disable automatic Dolt push; reads also use `--readonly`. A write
first passes a strict-readonly ready probe. These flags follow the
[v1.3.4 CLI source](https://github.com/gastownhall/beads/blob/v1.3.4/cmd/bd/main.go)
and [configuration environment mapping](https://github.com/gastownhall/beads/blob/v1.3.4/internal/config/config.go).

This is not an OS sandbox or a database routing validator. A trusted binary and
reviewed project Beads configuration are required: custom routes, server settings,
credentials and storage paths remain Beads' responsibility. A real write can
perform internal storage/version maintenance; the readonly probe alone cannot
certify all migration behavior or external side effects of a newer binary.
Strict readonly also disables implicit server startup, so a server-backed project
must have its reviewed server running already. Do not treat a compatible version
number or successful fixture as proof of runtime compatibility.

Supported native forms (all bridge options go **before** `--`):

| Native form | Additional permitted flags |
| --- | --- |
| `prime` | None |
| `show <id>`, `ready`, `dep tree <id>` | `--json` |
| `create <title>` | `--type`, `--priority`, `--parent`, `--description`, `--assignee`, `--json` |
| `update <id>` | `--claim`, `--status`, `--assignee`, `--title`, `--description`, `--priority`, `--json` |
| `close <id>` | `--reason`, `--json` |
| `remember <insight>`, `dep add <id> <blocker>`, `dep remove <id> <blocker>` | None |

Only `--claim` and `--json` are valueless flags. Values and IDs cannot start with
`-`; aliases, combined/equal-sign flags, file imports and global overrides are
deliberately unsupported. Use the dedicated bridge `ready` command for bounded,
filtered output; native `run -- ready` returns the CLI's raw output.

The dedicated bridge `ready` limits output to 50 tasks and `id`, `title`, `status`, `priority`, `assignee`, page count and truncation signal; it does not emit descriptions or comments. A full page sets `truncated: true` conservatively, indicating there may be more tasks rather than claiming an exact total. Titles are capped at 500 characters. To proceed, the agent reads the specific authorized Bead via `bd show`, then cross-checks the canonical plan and actual Git status. It must not infer authorization from a queue of unblocked tasks.

## 4. Cross-session and multi-agent protocol

**One executor by default.** The agent claims an issue only when the current task and write authority permit it. Use `beads-workflow.mjs run --project . --allow-write -- dep add <dependent> <blocker>` to encode a real blocking dependency. Create issues only for meaningful execution units; do not mirror every plan checklist as a Bead. For work in several repositories, preserve each repository's own workspace and use documented external references deliberately, not an invented global registry.

**Cross-host handoff:**

```bash
node ~/.agents/scripts/handoff.mjs \
  --project . \
  --task docs/superpowers/plans/current-task.md \
  --bead bd-example.2 \
  --output HANDOFF-next-agent.md
```

The Bead ID is only an identifier. The receiving agent verifies Git HEAD, branch, dirty worktree, approved plan, available `bd` version, current Beads issue through the project-pinned bridge, and fresh tests. A handoff never carries forward an implicit approval or passes old test results as fresh proof.

**Parallel work:** Use a suitable orchestration tool only when the user authorized delegation and the environment supports it. Allocate independent scopes and ideally separate Git worktrees. For genuinely simultaneous Beads writes, verify Dolt server mode and shared issue identity first; otherwise let a single coordinator serialize all `bd` updates while workers produce isolated code changes. Embedded Dolt is single-writer; multiple independent clones must not be treated as a linearizable shared lock. Cross-agent review should be explicitly distinguished from a self-review.

**Failure behavior:**

- No opt-in manifest: `inspect` returns `DISABLED`; no `bd` called.
- No workspace/CLI or version below minimum: `FALLBACK`; continue existing workflow and disclose limitation.
- Corrupt/symlinked manifest or Beads directory: fail explicitly; never overwrite.
- `bd ready` failure or malformed JSON: fail explicitly; do not claim/close tasks.
- Stale claim or changed files: reconcile with actual Git and current authorized plan.
- Review not available: report unverified gate instead of closing/merging based on a label.

## 5. What this improves, and how to measure it

| Risk in previous workflow | Additional control | Expected observable effect (not a measured claim) |
| --- | --- | --- |
| Resume after context loss | Stable issue ID + plan link + handoff | Fewer steps re-discovered from prior chat |
| Incorrect order on dependency-heavy work | `bd dep` and `bd ready` | Fewer attempts to execute blocked tasks |
| Parallel agents conflicting | Explicit owner, serialized writes or verified server | Fewer duplicate claims; no shared-file edits if work is partitioned |
| New work discovered during debugging | Child/task and `discovered-from` link | Less untracked work in chat logs |
| Premature completion | Existing verification/review skill gates remain mandatory | More accurate closure backed by recorded evidence |

Do not claim speed, token savings or quality improvement without A/B trials. Use `docs/workflow-eval.md` for a controlled comparison with the same model, task, tools, approvals and permissions; compare with/without Beads on at least a multi-session dependency-heavy task. Track time to resume, incorrect blocked-task starts, duplicated work, skipped verification/review steps, and manual reconciliation. Model compliance and native host behavior require real sessions; Node fixtures prove only distribution and bridge contracts.

## 6. Validation and rollback

From **sync-CLI-Tool** checkout (no writes to real home):

```bash
node --test tests/beads-workflow.test.mjs tests/handoff.test.mjs tests/sync-skills.test.mjs
npm test
node --check scripts/beads-workflow.mjs
node --check scripts/handoff.mjs
```

To activate on installed hosts, `npm run sync` still requires normal approval; it writes global agent configuration links, MCPs and hooks just as before. To remove the integration from a project without deleting historical issue data, stop using the Beads skill and remove the **project** `.agent-workflow.json` in an explicitly authorized change. Keep `.beads/` data intact unless its own owner approves a separate archival/migration operation. Removing the manifest makes the bridge return `DISABLED`.

### Non-goals and remaining limits

- No production deployment, PR merge, issue close or provider-side writes are driven by this integration.
- No Gas Town adoption, Task Master resurrection, Paperclip API sync, automatic background scheduler, or new MCP daemon.
- No promise that Antigravity IDE or other agent environments allow shell execution; the shared rule/skill is portable, tools and permissions vary.
- No actual Beads v1.3.4 binary or multi-writer Dolt server is bundled with this project. Runtime database compatibility requires a separate local pilot.
