# OpenCode configuration and runtime verification

Scope: preserve personal models and providers; normalize context-mode's OpenCode
configuration after upstream setup; add an explicit, bounded OpenCode runtime
check to the existing health command. Keep Superpowers and add no dependencies.
The pre-existing package.json change belongs to the user and is excluded.

Evidence: OpenCode 2.2.7 resolves both plugin and plugins into duplicate entries.
buildOpenCode writes both keys; upstream context-mode setup can reintroduce the
legacy key after syncOpenCode has normalized it. The default 9router endpoint
refused connections, while opencode/deepseek-v4.1-flash-free executed a shell
marker successfully in a real session. These observations are not benchmarks.

Impact: scripts/sync-mcp.mjs, scripts/sync-hooks.mjs, scripts/doctor.mjs,
scripts/health-check.mjs, their existing tests, README.md and rules/AGENTS.md.
The Cursor policy mirror follows the canonical rule change. workflow-eval.mjs
must include config-utils.mjs in doctor fixtures after the new doctor import.
Use existing script/test patterns. Work proceeds sequentially in this owner
context; no delegation, Git mutation or dependency installation is authorized
by this plan. Independent review is unavailable; report self-review explicitly.

- [x] RED/GREEN: sync twice with a fake upstream setup that writes legacy keys;
  retain personal plugins, model, provider and MCP entries, with one canonical
  context-mode registration. An explicit SYNC_OPENCODE_MODEL selects a model;
  ordinary sync preserves it, without hardcoding a model for other users.
- [x] RED/GREEN: opt-in health --opencode launches a private archived session;
  verify a completed shell marker and final response, not just process exit.
  Reject provider retries, tool failures, answer-only responses, missing CLI,
  malformed output and timeout. Kill the private process group on failure.
  Stub the CLI in tests; never launch a real agent from the test suite.
- [x] RED/GREEN: doctor reports duplicate OpenCode plugins and keeps model
  execution UNVERIFIED. It never invokes the model or changes configuration.
- [x] Document configuration/runtime evidence separately, one authoritative
  task progress record and evidence-backed handoff. No second workflow engine.
- [x] Run focused tests, full suite, syntax and diff checks. Apply OpenCode-only
  sync with the tested DeepSeek model, inspect resolved config, rerun sync for
  idempotence, and execute the explicit runtime check in a real session.

Progress and evidence will be recorded below as each check completes. Runtime
checks may create archived OpenCode sessions and tool statistics, but must not
edit project files. A successful marker proves only this bounded tool workflow,
not arbitrary tasks, cost savings or lifecycle/compaction behavior.

## Final progress and evidence

Status: implementation and bounded verification complete; self-review-only.
No remaining task in this scope. Next optional work is investigating the
9router service or explicitly selecting a model for the explorer subagent;
its existing 9router override is preserved, not covered by the main-agent pass.

- TDD: new model-preservation and post-setup normalization tests failed against
  the old implementation. New doctor/runtime checks also failed before the
  implementation. The focused suite subsequently passed 72/72.
- Final isolated suite: `node --test --test-reporter=tap tests/*.test.mjs`,
  113 tests passed, zero failures/skips. Original output:
  `/tmp/sync-cli-opencode-final.tap`. Includes provider retry, timeout, missing
  CLI, false-success, invalid JSON, failed shell and preservation cases.
- Syntax checks for all five changed scripts and `git diff --check` passed.
- Actual configuration: OpenCode-only MCP/hook sync ran twice, both exit 0;
  final config bytes were identical across runs. Provider, agent and permission
  settings matched the pre-sync snapshot. Default model is now
  `opencode/deepseek-v4.1-flash-free`. OpenCode resolved one context-mode plugin
  and 12 MCP registrations. Registrations are not MCP connection results.
- `opencode reload`: exit 0. Runtime versions: OpenCode 2.2.7, context-mode
  package 2.1.10. Updated shared rules distributed to AGY and both Codex homes,
  plus OpenCode (7 target paths); their MCP/hook configs were not resynced.
- Actual agent session: `node scripts/health-check.mjs --opencode
  --timeout-ms 60000 --json`, exit 0, PASS in 13052 ms; session
  `ses_e26f8527bffeeNmYa1UeHU1qAi`. Required completed shell marker and final
  answer were observed. No model override was passed to this command.
- Actual negative control: the same check with
  `--model 9router/ag/claude-opus-4-6-thinking --timeout-ms 15000`, expected
  exit 1, ERROR after 3195 ms. It stopped on the provider failure.
- Doctor: exit 0, OpenCode plugins OK, model remains UNVERIFIED by this static
  command as intended. A successful runtime result is separate evidence.
- Backup and private JSON/log evidence:
  `/home/thuannguyen23/.local/state/sync-cli-tool/opencode-runtime-kcd07qe4/`.
  Directory mode 0700; config/log files 0600.
- The user's package.json SHA256 stayed
  `16d6b49c6543d6a7e02e653cb42eb14b6bd8b158563d39dd94370f6206a06041`.
  No new dependency, MCP or framework; no commit, push or merge.

Limits: actual runtime checks above are for OpenCode's main agent on this Linux
host. They do not verify every MCP, RTK rewriting, compaction, the explorer's
override, Codex/AGY sessions, productivity or cost. The smoke prompt is not an
OS sandbox; use trusted instructions/plugins/models. No independent reviewer
was dispatched. The 9router service itself remains unavailable.
