# Codex, AGY CLI, and OpenCode sync repair plan

Status: READY for the approved repository repair scope. User approved the
concrete patch on 2026-10-23. Live installation was not requested or performed.

Scope: repair the findings from the three-agent audit. Existing configuration
must be preserved, active Codex profiles must receive their configuration,
and an installation failure must return a nonzero status. No new dependencies,
Git mutations, live sync, or model/MCP service calls are included.

Evidence baseline: Codex 0.163.0, AGY CLI 1.4.6, OpenCode 2.1.2;
25 existing tests passed in an isolated HOME. AGY native validation rejected
the installed context-mode hooks and rule; RTK validation and payload passed.

- [x] Add the proposed regression tests and run them against the original code.
      Confirm expected failures for preservation, profile routing, callback input,
      AGY plugin format, opt-out, and exit status before applying production edits.
- [x] Apply the approved shared config helpers and MCP/rules/skills repairs.
- [x] Apply the approved deployed AGY adapter and OpenCode RTK repairs.
- [x] Make setup reuse the selected agents' skills/rules/plugin implementations.
- [x] Run npm test in an isolated HOME/CODEX_HOME/XDG environment. Tests must
      not access real configuration, credentials, or MCP services.
- [x] Syntax-check changed JavaScript and Bash; run git diff --check.
- [x] Validate the generated AGY plugins with agy plugin validate --strict --json
      in a temporary environment; check two consecutive syncs there.
- [x] Verify a native Codex MCP upsert and headers in a temporary CODEX_HOME,
      and run the OpenCode callback using its V2 event.input contract.
- [x] Report evidence and limits. Live installation remains a separate action.

Execution: one owner, no delegation. Review is self-review only unless the user
separately authorizes independent review. Existing tests and probes do not
establish end-to-end provider, model, or live MCP compatibility.

Recovery: preserve the first .bak file, stop on malformed configuration, upsert
only declared MCP names, and report partial failures. This patch does not claim
transactional rollback across every agent or remove stale managed servers.

The callback regression uses Node native TypeScript loading on Node 22+; it is
explicitly skipped on Node 20. Run it on the installed Node 24 as part of delivery.

Progress: the 10 new regressions failed against the original production code,
then all 10 passed after applying the approved patch. No live config was synced.

Delivery evidence:
- Full npm test: 35 passed, 0 failed, 0 skipped on the installed Node 24.
- The first full suite run had one obsolete source-regex failure (34/35): it
  required .codex and AGENTS.md on one source line. Removed that redundant
  assertion; the two isolated Codex rules tests cover the behavior. This was
  one test-maintenance repair round; production behavior did not change.
- All six scripts/*.mjs files passed node --check. setup.sh, teardown.sh, and
  scripts/prerequisites.sh passed bash -n; git diff --check passed.
- AGY 1.4.6 native strict validation returned exit 0 for RTK and context-mode
  in both global and CLI locations, after two isolated hook syncs. Context-mode
  has an informational naming note about the top-level "hooks" key; hooks,
  MCP, rule, and skill are detected. There are no errors or warnings.
- Codex 0.163.0 native MCP sync ran twice in a temporary profile. Personal
  MCP remained, HTTP headers (including literal dollar sequences) parsed
  correctly, the first backup stayed intact, and fallback config was untouched.
- RTK's native AGY payload probe rewrote the sample command successfully.
- npm run sync ran twice for the three selected agents in an isolated HOME.
  Rules/skills reached the active profile, the OpenCode RTK symlink was
  installed, selected config contents were stable, and skipped agents' folders
  were absent. The fixture registered only dummy MCP endpoints and /bin/true;
  no MCP services or model sessions were launched.
- Self-review only, as approved. No dependency installs, commits, or live sync.

Limits: this is not a full bootstrap test of setup.sh (which can install
prerequisites), a Node 20/22 compatibility run, or an end-to-end provider/model
test. Shellcheck was unavailable; Bash syntax was checked. Skills-link warnings
retain their previous behavior; nonzero error reporting was verified for MCP
and hook sync. Multi-agent transactional rollback remains outside this patch.

Detailed local logs: /tmp/sync-cli-fix-preview-u241zqky/full-test-final.log,
native-verification.log, and entrypoint-verification.log in the same directory.

## Authorized live repair phase (2026-10-23)

User authorizes autonomous scoped fixes and real sessions for context-mode, RTK,
and CodeGraph in Codex, AGY CLI, and OpenCode. Earlier live-sync exclusion is
superseded for these three utilities only. One owner; no delegated review.

- [x] Regression RED/GREEN for missing Codex context-mode and OpenCode V2 MCP.
- [x] Repair CodeGraph shared daemon configuration and deploy targeted entries.
- [x] Deploy native hooks/MCP to the three live clients, preserving user settings.
- [x] Restore the installed model proxy without installation or dependency updates.
- [x] Exercise three fresh real agent sessions; inspect all nine utility results.
- [x] Run isolated regressions and record remaining limitations.

State: READY for the scoped runtime smoke criteria. Native evidence, not mocked regression output, is the
acceptance criterion for the nine client/utility combinations.

Live delivery evidence (2026-10-24):
- Codex native context-mode ctx_execute returned LIVE_CONTEXT_MODE_OK; CodeGraph
  explore returned current source/relationships; RTK automatically rewrote the
  native shell command to rtk git status --short, exit 0.
- OpenCode native session completed exit 0. Its execute bridge called CodeGraph
  explore and context-mode ctx_execute successfully. The RTK trace records both
  rewrite and actual rtk git status --short execution.
- AGY final fresh session completed exit 0, with actual exploration output saved
  in its native brain artifact, context-mode marker returned, and native shell
  reporting a pre-hook argument change followed by exit 0. Its log contains
  zero Invalid rule trigger messages and zero hook failure messages.
- Added native AGY frontmatter to the repository RTK rule and clarified automatic
  rewriting to avoid a second prefix. No upstream skill was changed.
- New Codex/OpenCode regressions first failed for the expected missing adapters.
  Final isolated npm test: 37 passed, 0 failed/skipped. RTK-only fixture now hides
  host npm discovery, so installed context-mode cannot pollute its assertions.
- Live strict AGY validation: context-mode and RTK exit 0; context-mode retains
  one informational naming note, no warnings/errors. Syntax and diff checks pass.
- CodeGraph now uses the shared daemon (CODEGRAPH_NO_DAEMON=0). Only the verified
  old direct helper was signaled; no index deletion or rebuild was performed.
- The existing 9router proxy was started directly without installers/updaters.
  No service autostart was added. Live snapshots and raw logs stay private.

Limits: native smoke probes cover the nine utility/client combinations, not
all tool APIs, long-context compaction, performance, or every lifecycle hook.
OpenCode uses context-mode native MCP; its legacy V1 lifecycle plugin was not
ported. The interrupted original Codex probe was stopped after three successful
calls, so its final-turn completion is not claimed. No dependencies installed,
no Git mutations, and no SQL/GitHub repair was attempted in this phase.

Evidence: /tmp/agent-runtime-repair-38bkbj_p/results.json and the named native
JSONL/RTK trace files in that private directory.
