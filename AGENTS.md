# sync-CLI-Tool repository instructions

This repository distributes configuration for **Codex, Antigravity and OpenCode**.
The global policy source is `rules/AGENTS.md`; this file contains repository-local
facts, commands and side effects. Do not copy the global policy here.

## Sources and layout

- `scripts/agent-paths.mjs`: supported policy/skill destinations, including the
  active `CODEX_HOME` and Antigravity Global/CLI/IDE/App paths.
- `scripts/config-utils.mjs`: shared config parsing, private backups and paths.
- `scripts/sync-{skills,rules,mcp,hooks}.mjs`: distribution entry points. MCP and
  hook schemas are host-specific; preserve personal entries and repeated-sync safety.
- `rules/AGENTS.md`: shared behavioral contract. `skills/` contains upstream
  procedures; keep them read-only unless the user explicitly requests skill edits.
- `mcp/servers.json`: shared catalog. Credentials belong in ignored `secrets.env`;
  use `secrets.env.example` for names and placeholders only.
- `plugins/`: Antigravity RTK and OpenCode RTK adapters. `hooks/codex/`: legacy
  compatibility delegate. `tests/`: Node tests with disposable host fixtures.
- `docs/superpowers/plans/`: task plans and historical evidence. Continue an
  applicable plan's progress record; old host mentions are historical, not support.

## Commands and boundaries

Requires Node.js >=24.15.0. There is no dependency install/build step for tests.

- Full isolated suite: `npm test`.
- Focused safety/scope checks: `node --test tests/supported-hosts.test.mjs tests/sync-safety.test.mjs`.
- Syntax: `node --check scripts/<changed-file>.mjs`, `bash -n setup.sh teardown.sh scripts/prerequisites.sh`.
- Whitespace: `git diff --check`.
- Read-only configuration diagnostics: `npm run doctor`.
- Agent behavior evaluation instructions: `docs/workflow-eval.md`; checker tests
  alone do not establish agent behavior or a performance improvement.

`npm run sync` writes real host configs, creates symlinks/backups and invokes
installed adapters. `setup.sh` can install prerequisites. `npm run mcp:update`
updates packages. `teardown.sh` removes owned links; `--restore-backups` additionally
restores configs. Do not use these as verification against a real home by default.
Test distributors with disposable HOME/CODEX_HOME/XDG paths and fake external CLIs,
following `tests/sync-safety.test.mjs`. HOME overrides are test fixtures, not an OS
security sandbox. A live operation needs task authorization for its side effects.

## Change and verification expectations

Preserve supported hosts' personal MCPs, hooks, model/provider settings, system
skills, malformed-config refusal, private backups, symlink ownership and repeated
syncs. Keep Antigravity adapters separate from Gemini CLI semantics. Changes to
supported destinations must cover rules, skills, MCP/hooks, setup, doctor and
teardown; assert that unsupported client configs remain untouched.

Use targeted behavioral regressions for distributor fixes. Policy edits require
checking routing, permission/skill conflicts, documentation and all distributing
consumers. Changes to workflow-eval anchors also require its fixture/checker tests.
Do not update upstream skill bodies to make policy assertions pass.
