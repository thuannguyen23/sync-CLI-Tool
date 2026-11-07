# Host script repairs

Scope: repair the six findings from the script audit without deleting personal configuration or modifying Git history. Existing staged changes are preserved. No dependency is added to package.json.

Design: regular configuration files survive teardown; restoring backups is explicit and saves the current file first. Health checks use a bounded MCP lifecycle and report only observed facts. A shared runtime helper resolves dotenv values and identifies missing inputs without logging secrets. Bootstrap checks Node >=24.15, installs the existing catalog's host dependencies and fails on prerequisite errors. AGY migration disables only its obsolete context-mode plugin. Version checks are explicit, read-only network requests.

Evidence: CodeGraph CLI found backupFile consumers in sync-hooks, sync-mcp and sync-rules; both syncCodex implementations and doctor are impacted. MCP tool is unavailable in this host; CLI exploration and focused repository reads are the fallback.

- [x] Teardown: RED/GREEN `node --test tests/teardown.test.mjs`; preserve unmanaged files/symlinks, snapshot before explicit restore, operate on active Codex home, never call real agents in lifecycle tests.
- [x] Health: RED/GREEN `node --test tests/health-check.test.mjs`; strict local stdio/HTTP fixtures verify initialized, tools/list pagination, malformed/error/timeout/exit handling, missing credentials, optional skips, opt-in MySQL tool calls and nonzero failures.
- [x] Secrets/doctor: RED/GREEN `node --test tests/mcp-runtime.test.mjs tests/doctor.test.mjs tests/sync-safety.test.mjs`; quoted dotenv values match, missing inputs are named only, Codex argv contains no secrets, config and backup modes are private.
- [x] AGY/bootstrap: RED/GREEN `node --test tests/bootstrap.test.mjs tests/sync-safety.test.mjs`; enforce runtime floor before host writes; migrate only the context-mode plugin and preserve RTK; host installer verifies downloads/builds and supports explicit update.
- [x] Versions/docs: `node --test tests/mcp-versions.test.mjs`; fixture registry checks cover npm, PyPI, GitHub and installed/unknown states. README and CI match commands and Node floor.
- [x] Final verification: fresh full suite, shell/JS syntax, isolated lifecycle, doctor and targeted actual-host MCP checks. No live database query without the explicit health flag. Record absent credentials and unsupported hooks as limits.

Gate: READY for the six code repair groups. Independent reviewer closed the material findings after three review rounds. Provider availability is explicitly incomplete, as expected when credentials are absent.

Fresh evidence:
- `npm test`: 97/97 passed, exit 0; includes teardown ownership/order, strict stdio/HTTP/SSE lifecycle, pagination, timeout/process exit, MySQL isError, quoted credentials, private backup modes and argv redaction.
- `npm run test:teardown`: isolated fixture suite passed; expanded current suite is included in the 97 tests. No actual user teardown was performed.
- Shell `bash -n`, JavaScript `node --check` and `git diff --check`: exit 0. Shellcheck is not installed locally.
- `node scripts/install-host-mcps.mjs --update`: exit 0, actual GitHub release checksum verified; Slack install and Telegram build succeeded.
- `SKIP_CURSOR=1 SKIP_KILO=1 SKIP_CLAUDE=1 SKIP_CLINE=1 npm run mcp:update`: exit 0. Python resolver reported mysql-mcp-server 0.4.5. MCP/hook sync completed for AGY, Codex and OpenCode; each MCP config has mode 0600.
- Actual catalog health: 9 PASS (initialize + tools/list), 2 SKIPPED (Slack/Telegram tokens), 2 UNCONFIGURED (MySQL JCF/Forbes inputs), expected exit 1. No MySQL business/schema tools invoked.
- Fresh AGY print session used `context-mode/ctx_execute` and returned `AGY_FIXED_MCP_OK`. Context-mode AGY lifecycle hooks remain unsupported by upstream v2; no compaction/recovery claim.
- Read-only registry version checks cover npm, PyPI, GitHub releases and source commits; cached versions are labeled CACHED, not treated as active sessions.

Limits: no clean operating-system bootstrap or all-agent lifecycle/compaction benchmark was performed. Git state and existing staged changes were preserved; no commit, push or merge.
