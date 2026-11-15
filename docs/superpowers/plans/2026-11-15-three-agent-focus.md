# Three-agent focus and policy simplification

Status: COMPLETE for repository refactoring; READY on the bounded evidence below. Authoritative design, task progress and verification record.

## Goal, scope and authority

Support Codex (including an active CODEX_HOME), Antigravity Global/CLI/IDE/App,
and OpenCode only. The user authorized implementation, removal of other host
support and proportionate structural refactoring. Preserve personal configuration,
secrets, supported-host behavior and upstream skill sources. No dependency
installation, Git mutations, index rebuild, external writes or delegated agents.
Execute inline; review is self-review-only. SureForge Standard, because this is
a bounded multi-file configuration-distributor refactor.

## Sources and design decisions

- Current peers: scripts/config-utils.mjs, sync-{rules,skills,mcp,hooks}.mjs,
  doctor.mjs, setup.sh, teardown.sh and isolated tests/sync-safety.test.mjs.
- Keep scripts/, rules/, skills/, plugins/ and docs/; remove unsupported adapters
  rather than moving stable public entry points for cosmetic reasons.
- Add a small shared supported-host path registry beside config-utils.mjs; use
  it for rules, skills and doctor so supported destinations cannot drift.
- Keep one global rules/AGENTS.md, with task routing inline and detailed methods
  loaded only when applicable. Add root AGENTS.md for this repository's commands,
  side effects and verification. Do not restore standalone WORKFLOW.md.
- Skills supply methods within the authorized task, not new permissions or
  mandatory lifecycle phases. Preserve upstream skills unchanged.
- Codegraph supports structural navigation; exact searches and dynamic consumer
  checks use rg/current sources. Empty graph results do not establish absence.
- Existing unsupported-client files in the user's home are outside migration;
  after this change project commands neither configure nor tear down those hosts.
  Remove only tracked unsupported adapters. Source policy edits reach existing
  managed symlinks, including old installations, until users unlink those.
- No speed/compliance claim without actual comparative agent runs.

Research used in the preceding read-only assessment:
https://agents.md/ (Markdown format, no required schema);
https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra
(conditional document/skill loading, precise decision boundaries; model-specific);
https://arxiv.org/abs/2602.11988 and https://arxiv.org/abs/2601.20404
(different results, so measure locally rather than assume benefit);
https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/
(concrete commands and boundaries; partly specialized-agent guidance);
https://www.reddit.com/r/cursor/comments/1uldhvv/anyone_else_find_their_claudemd_agentsmd_files/
(anecdotal maintenance and executable checks, not controlled evidence).

## Acceptance and evidence path

1. Rules, skills, MCPs, hooks, setup, diagnostics and teardown target only the
   three supported hosts. Isolated runs preserve unsupported-host sentinel files
   and do not create their directories; supported paths still receive output.
2. Existing supported-host safety tests remain green: personal MCP/hooks/model
   preservation, malformed-config refusal, private backups, symlink write safety,
   repeated syncs, AGY plugin install and active Codex profiles.
3. Global policy preserves scope/authority, plan resumption, evidence and repair
   limits while removing compulsory tool choice and unconditional skill phases.
   Root instructions match real paths and package scripts. Inspect content and
   distribution; do not equate textual assertions with agent compliance.
4. Active documentation describes only supported adapters. Historical plans and
   unmodified upstream skills may mention other agents and are not runtime support.
5. npm test, focused scope regressions, JS/Bash syntax and git diff --check pass.
   Existing workflow-eval fixture/checker tests remain runnable after the refactor.
6. No live setup, dependency update, native agent session or full-home teardown
   is necessary for repository refactoring; disclose these untested categories.

## Ordered work

- [x] Inspect current sources/consumers, source-based research and clean status.
      Baseline: npm test -> 134/134, zero skipped, exit 0.
      Codegraph index uses an older engine; current source/rg supplements impact.
- [x] Establish failing isolated tests for supported-host-only distribution and
      preservation of unsupported host configuration; update obsolete contracts.
- [x] Refactor supported destinations and remove unsupported runtime adapters,
      setup/teardown branches and tracked Cursor plugin.
- [x] Simplify global policy; add root instructions; update README and active docs.
- [x] Run focused and full checks, inspect complete diff and remaining host names;
      record self-review findings and limits, then deliver.

## Progress, rulings and checks

Current step: complete; hand over the verified working tree for user review.
- Scope regressions: four expected RED failures, then 4/4 GREEN. Supported paths
  are populated; retired-client configs remain byte-for-byte and links survive.
- Policy reduced from 1,287 words / 9,237 bytes to 1,031 words / 7,262 bytes.
- Integration failure: prepared workflow-eval fixtures omitted the new doctor
  dependency (ERR_MODULE_NOT_FOUND for agent-paths.mjs). Repair round 1 bundled
  it in tasks; 8/9 eval tests passed, exposing the same missing file in the
  drift-test's cloned fixture. Round 2 added it to that fixture too; all evaluation fixture/checker tests passed. Issue closed within two repair rounds.
- Ruling: preserve Antigravity IDE User MCP output formerly nested in the Cursor
  branch; move it under SKIP_AGY with AGY-wide malformed-config preflight.
- Ruling: preserve existing retired-host files in the real home. No migration or
  uninstall of those clients is performed by this repository refactor.
Task authorization is explicit; no further design approval required. Upstream
skill approval/commit/delegation defaults do not expand this contract.


## Final verification and self-review

Gate: READY for the authorized repository refactor. Review is self-review-only;
no independent agent, provider session or performance evaluation was run.

- Candidate base HEAD: `da03ddfd5e61882886cf1f487462eeccc6789a44` (unchanged). Modified/new/deleted-file
  SHA256 (sorted path + NUL + bytes or DELETED marker + NUL; excludes this ledger):
  `eaf83fb7aa8256bef04badc9f4e94ce45f821100325ecc0bb379b0362a5dd09c`.
- Final `npm test`: exit 0, 132/132 passed, zero failed/skipped. Nine obsolete
  supported-host contracts were removed/replaced; seven focused scope regressions
  were added. No supported-host regression was waived to obtain a green result.
- `tests/supported-hosts.test.mjs`: 7/7, covers all supported rule/skill paths,
  retired client preservation, MCP/hooks, teardown, doctor drift, setup delegation
  and AGY IDE User config preflight. Four original scope regressions and the doctor
  coverage regression were observed failing before production changes.
- Doctor/host scope/workflow-eval targeted consumer run: 33/33 before the final
  two scope cases were added; the final full suite includes all seven cases.
- Node v24.22.1: every scripts/*.mjs syntax check, four Bash syntax checks and
  `git diff --check`: 22 checks, zero failures. Tests were also syntax-checked
  during the earlier pass. ShellCheck is unavailable locally and was not installed;
  its existing CI job remains. CI itself was not executed remotely.
- Read-only live `npm run --silent doctor`: exit 0, 151 OK, 19 UNVERIFIED,
  2 UNCONFIGURED. These are configuration observations, not proof of MCP/hook
  execution or credential completeness. No live setup/sync/update/teardown ran.
- Local Markdown links checked in root instructions, README, evaluation and AGY
  recovery docs: all resolve. Historical root HANDOFF.md moved byte-for-byte to
  docs/archive/2026-10-29-handoff.md; other historical plans remain intact.
- Active runtime/docs/hidden-config audit: no unsupported-host adapter branches
  remain. CI's obsolete generated Cursor mirror step removed. The unrelated
  MCP pagination variable named cursor is retained. Tests intentionally mention
  retired clients to assert that their data remains untouched.
- Global policy: 1,031 words / 7,262 bytes versus 1,287 / 9,237 baseline. This
  establishes reduced text size only, not reduced inference cost or better behavior.
- Upstream skills unchanged. No dependency installation, Git mutation, index
  rebuild or delegation. Real-home retired-client links/configs were not removed.

Self-review findings resolved:
1. Antigravity IDE User MCP support had lived under Cursor; preserved it under
   AGY selection and verified personal entries/malformed-config preflight.
2. New doctor import was missing in evaluation fixture bundles; fixed both
   production fixture declarations and the drift-test clone (two repair rounds).
3. CI referenced the deleted Cursor mirror; removed the obsolete step.
4. Doctor inspected fewer policy paths than distributors; shared registry now
   covers every supported policy location, verified by a RED/GREEN drift test.

Remaining limits: no native model-session/A-B claims, no live hook execution,
no fresh MCP handshake, no clean-OS bootstrap or package installation exercise,
and no local ShellCheck/remote CI run. Existing optional credential gaps remain.


## Authorized live application — 2026-11-15

User follow-up authorized running the sync on the real machine. This extends
repository-only scope to supported-host configuration writes; the earlier statement
that no live sync ran describes the refactor delivery, not this application.

- Fresh preflight: `node --test tests/supported-hosts.test.mjs tests/sync-safety.test.mjs`
  -> exit 0, 43/43 passed, zero skipped.
- Private current-state snapshot/logs:
  `/home/thuannguyen23/.local/state/sync-cli-tool/evidence/2026-11-15-live-sync-a21dl9di/`.
  Snapshot includes 51 supported paths; manifest/logs are private.
- Native profile `CODEX_HOME=/home/thuannguyen23/.codex npm run sync`: exit 0;
  Codex, Antigravity and OpenCode selected. 25 canonical skills, six policy paths.
- Existing Orca Codex profile: `SKIP_AGY=1 SKIP_OPENCODE=1` with its explicit
  CODEX_HOME and `npm run sync`: exit 0. Both Codex policy/skill locations handled;
  active profile MCP/hooks registered. No other account profiles were selected.
- Post-sync: all 7 live policy links match focused-2026-11-15; all 26 captured
  canonical SKILL.md hashes unchanged. All 17 retired-client path snapshots
  unchanged (including owned links), with no retired-client cleanup.
- Post-sync registration/preservation checks: 15/15. Both Codex context-mode MCPs
  and native RTK hooks present; unmanaged Codex MCP entries preserved; OpenCode
  model/provider/agent settings preserved; supported AGY MCPs/plugins present.
- Fresh doctor on default Codex profile: exit 0, 151 OK / 19 UNVERIFIED /
  2 UNCONFIGURED. On Orca profile: exit 0, 174 OK / 22 UNVERIFIED /
  2 UNCONFIGURED. Missing inputs belong to mysql-remote-jcf and
  mysql-local-forbes; no credentials were invented or printed.
- READY for applied configuration. These checks establish current configuration
  and preservation only. No model-session, MCP handshake, live database tool call,
  general compliance/performance claim, package install, Git mutation or teardown.
  Restart/new sessions are needed to load configuration into existing agents.


## Codex context-mode marketplace timeout repair — 2026-11-15

User reported startup update failure: git clone marketplace source timed out after
30 seconds, fatal early EOF, on the Orca Codex profile. Authorized investigation,
scoped repository repair and live configuration correction.

Findings:
- Both native and Orca profiles had marketplaces.context-mode pointing to
  https://github.com/mksglu/context-mode.git (revision metadata dated September 3).
  The pre-sync snapshots prove the registration predated the latest live sync.
- Neither profile had configured plugin settings or content in the context-mode
  plugin cache. context-mode 2.1.10 was independently registered through native
  MCP/hooks. The Git marketplace was therefore redundant in these profiles.
- Read-only git ls-remote succeeded in 0.83 seconds during investigation. This
  confirms current remote reachability, not the cause of the earlier clone EOF.
- Official CLI documentation inspected:
  https://developers.openai.com/plugins/build/plugins
  Local CLI confirms marketplace list/remove support and JSON output.

Repair and evidence:
- Saved private config backups under
  /home/thuannguyen23/.local/state/sync-cli-tool/evidence/2026-11-15-marketplace-fix-pvwea_pg/.
- Ran codex plugin marketplace remove context-mode --json for each explicit
  CODEX_HOME. Both exit 0. Parsed TOML comparison confirms every other setting
  and any other marketplace remained unchanged.
- scripts/sync-hooks.mjs now retires only the known official orphan marketplace
  after successful native v2 setup. It preserves custom sources and any cached
  plugin or @context-mode configuration reference; backups use existing helpers.
- Regression for orphan retirement observed RED (marketplace remained), then
  GREEN after the implementation. Repeated syncs preserve direct/personal MCPs
  and model settings; cached plugin and custom-source preservation tests pass.
  An initial test insertion landed inside an existing fake-CLI template string;
  moved the block before obtaining the meaningful RED. No production repair round
  was spent on that fixture syntax mistake.
- Full suite: npm test -> exit 0, 135/135, zero failed/skipped. Changed JS syntax
  and git diff --check pass. README documents native setup and selective cleanup.
- Ran repaired sync-hooks.mjs on both real Codex profiles, exit 0 each. Fresh
  marketplace list: native retains openai-curated only; Orca has no configured
  marketplace. context-mode is absent after upstream setup and our sync.
- Actual configured context-mode MCP on both profiles: initialize succeeded,
  tools/list returned 9 tools, and tools/call ctx_execute printed the exact
  CONTEXT_MODE_MARKETPLACE_FIX_OK marker. MCP processes stopped after the probe.

Gate: READY for this repair; self-review-only. One production repair cycle.
No dependency install, Git mutation, marketplace re-clone, global Git/network
setting change, or other-host sync. The earlier network/EOF cause remains
unproven; the unnecessary clone trigger is removed. Existing Codex sessions need
restart/reload to stop using an already loaded marketplace configuration. No
model-session or actual hook execution claim is made.
