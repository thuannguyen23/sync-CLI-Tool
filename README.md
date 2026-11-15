# sync-CLI-Tool

Shared rules, skills, MCP configuration and native adapters for **Codex,
Antigravity and OpenCode**. `~/.agents` points to this checkout, so canonical
configuration can be maintained in one place.

## Supported hosts

| Host | Shared instructions | MCP configuration | RTK/context-mode integration |
| --- | --- | --- | --- |
| Codex | `~/.codex/AGENTS.md` and active `$CODEX_HOME/AGENTS.md` | Active profile `config.toml` | Native hooks and MCP; retain the legacy RTK delegate when already installed |
| Antigravity Global/CLI/IDE/App | `~/.gemini/{config,antigravity-cli,antigravity-ide,antigravity}/AGENTS.md` | Corresponding `mcp_config.json`; existing IDE User config also supported | Native managed plugins; AGY CLI uses the pinned compatible context-mode adapter |
| OpenCode v2 | `~/.config/opencode/AGENTS.md` | Existing `opencode.jsonc`, otherwise `opencode.json` | Native context-mode adapter and discovered `plugins/rtk.ts` |

Skills are linked individually into these same host directories. Personal skills,
unrelated links and Codex system skills are preserved. `SKIP_CODEX=1`,
`SKIP_AGY=1` and `SKIP_OPENCODE=1` select which hosts are excluded from sync.
Other coding clients are outside the supported scope: project commands no longer
configure, inspect or uninstall their adapters. Existing client files are left
in place. Old links into this checkout may still reference shared sources;
removing support does not unlink an old installation automatically.

## Layout and ownership

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Instructions specific to development of this repository |
| `rules/AGENTS.md` | Global policy distributed to all supported hosts |
| `skills/<name>/SKILL.md` | Canonical reusable procedures; upstream bodies stay unchanged |
| `scripts/agent-paths.mjs` | Shared policy/skill destination registry |
| `scripts/config-utils.mjs` | Config parsing, private backups and profile paths |
| `scripts/sync-*.mjs` | Host distribution and native integration |
| `mcp/servers.json` | Shared MCP catalog |
| `plugins/antigravity`, `plugins/opencode`, `hooks/codex` | Native adapters and compatibility hook |
| `tests/` | Isolated configuration and runtime-protocol regressions |
| `docs/workflow-eval.md` | Instructions for comparing actual agent outcomes |
| `docs/superpowers/plans/`, `docs/archive/` | Task progress and historical records |

The global policy keeps workflow routing inline; there is no required
`WORKFLOW.md`. Project instructions own local commands and architecture. Skills
supply methods only within the task's scope and permissions. Exact-string search,
Codegraph and current tests complement one another; empty graph results do not
prove absence of callers or tests.

## Setup and synchronization

Requires **Node.js >=24.15.0**. Tests use built-in Node modules and do not need a
package installation step. Bootstrap can install prerequisites and writes real
host configuration; run it deliberately:

```bash
./setup.sh          # Select installed/supported hosts interactively
./setup.sh --silent # Select detected hosts without prompts
```

Keep credentials in ignored `secrets.env` (created from `secrets.env.example`).
Never commit or print credentials. Configuration and backups may contain secrets;
shared helpers use private file permissions.

After reviewing changes to the sources, synchronize selected hosts:

```bash
npm run sync
SKIP_AGY=1 SKIP_CODEX=1 node scripts/sync-mcp.mjs
```

`sync` writes skills, rules, MCPs and hooks. It preserves personal entries and
backs up existing configuration before replacement. It may invoke installed
context-mode setup and Codex MCP commands; it is not a read-only check.
The managed rule paths are symlinks, so edits to `rules/AGENTS.md` are immediately
visible through existing links; restart sessions when updated instructions must
be loaded. Do not infer instruction loading or compliance from file equality.

Codex context-mode uses the installed package's native MCP/hooks; it does not
require a Git marketplace. After successful native setup, sync retires an orphan
`context-mode` marketplace pointing to the official upstream repository when no
cached plugin or `@context-mode` config reference uses it. Custom sources and
cached/configured plugins are preserved. This avoids unnecessary startup clones
for old registrations without disabling the directly installed MCP.

To add an MCP, edit `mcp/servers.json`, add credential placeholders to
`secrets.env.example` when needed, and run the selected-host MCP sync. Missing
optional credentials skip registration; an existing matching registration without
its required secret is reported as an error and preserved for review.

Ordinary sync preserves OpenCode's model and provider settings. To deliberately
change its top-level model, use `SYNC_OPENCODE_MODEL=provider/model` with the MCP
sync script. Explicit per-agent overrides remain separate. OpenCode v2 uses the
`plugins` array and `mcp.servers`; legacy aliases are normalized without removing
unmanaged configuration.

## Verification

```bash
npm test
npm run doctor
node --test tests/supported-hosts.test.mjs tests/sync-safety.test.mjs
bash -n setup.sh teardown.sh scripts/prerequisites.sh
```

Tests use disposable HOME/CODEX_HOME/XDG paths and fake external CLIs. The scope
regressions verify that supported hosts receive configuration and unsupported
client files remain untouched. These fixtures are not OS security sandboxes.
`doctor` inspects config, private credential inputs, policy content, skill links
and supported hook/plugin configuration; it does not execute models or hooks.

MCP connectivity is a separate operation which starts configured servers:

```bash
npm run health -- --server github
npm run health -- --json
```

Health checks require initialize, initialized notification and tools/list; optional
credentials may be skipped. Legacy SSE is unverified. `--mysql` explicitly calls
`get_schema_info`. Configuration presence, handshake, actual tool execution and
native agent behavior are different evidence categories.

OpenCode model execution is opt-in and may consume quota/create an archived
session. It requires a successful shell marker plus the expected final answer;
it does not establish general task quality, hook execution or an OS sandbox:

```bash
npm run health -- --opencode --timeout-ms 60000 --json
```

For policy comparisons, follow [workflow evaluation](docs/workflow-eval.md).
Keep model, CLI, tools, skills and permissions constant; compare repeated actual
agent runs. Checker tests or an agent reciting the rules do not prove improvement.

## Explicit package maintenance

```bash
npm run mcp:install -- --dry-run
npm run mcp:versions
npm run mcp:update -- --dry-run
```

Installation/update commands without dry-run can download or change packages.
Updates stop on failure; earlier package changes are not automatically rolled
back. Cached versions do not establish what a running session loaded. Restart
sessions after updates. Antigravity CLI's compatible pinned adapter is maintained
separately from Codex/OpenCode v2. See
[Antigravity recovery](docs/antigravity-session-recovery-guide.md) for history issues.

## Planning, handoff and teardown

Use one task plan for substantial work: scope, sources/decisions, acceptance,
design/impact, ordered progress and verification. Link it when handing off:

```bash
npm run handoff -- --task docs/superpowers/plans/your-plan.md --project /path/to/repo --output HANDOFF.md
```

The command collects Git metadata and supplied notes without Git mutations; it
refuses an existing output or symlink. Historical handoffs are not current evidence.

```bash
./teardown.sh --force
./teardown.sh --force --restore-backups
```

Teardown removes repository-owned links for supported hosts. Regular configs,
installed packages and plugin copies remain. Backup restoration is explicit and
saves current regular config first. It leaves unsupported-host configuration and
links untouched; inspect old installations separately before removing anything.

## Policy maintenance

Prefer specific commands and observable boundaries over generic exhortations.
Load specialized procedures only when relevant. Keep local facts local, and
remove obsolete or contradictory instructions when tools/models change. Preserve
scope and authorization while testing changes against real tasks.

Sources informing this design include [AGENTS.md](https://agents.md/),
[OpenAI's instruction/skill guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)
(model-specific), and [GitHub's agent-file guidance](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/)
(partly specialized-agent guidance). Research has reported both
[efficiency gains](https://arxiv.org/abs/2601.20404) and
[cost increases without general success gains](https://arxiv.org/abs/2602.11988).
Community discussions are useful hypotheses; local evaluation is required before
claiming improved speed, cost or compliance.
