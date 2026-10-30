# Workflow Evaluation Implementation Plan

> **For agentic workers:** Execute sequentially in one owner context. No delegation,
> Git mutation, dependency installation or provider run is authorized by this plan.

**Goal:** Compare instruction variants using three reproducible agent tasks.
**Architecture:** One Node CLI prepares copied workspaces, runs external outcome
checks and compares reports with explicit measurement provenance.
**Tech Stack:** Node built-ins, ESM, node:test; Node 20/22 CI conventions.
**Spec:** docs/workflow-eval.md and the user-approved complete source preview.

## Global constraints

- Preserve existing user work and client configuration.
- No provider calls, package installs, Git mutations or implicit live sync.
- Isolated directories and HOME are not an OS security sandbox.
- Agent metadata and measurements are self-reported; unavailable values are null.
- Three representative tasks do not establish general model or CLI performance.
- Only the reviewed six files belong to this change.

## Review focus and acceptance mapping

| Unit | Evidence |
| --- | --- |
| Seed drift / existing output | refusal and preservation tests |
| Bug, sync and stale handoff | seeded-negative and repaired-positive graders |
| Edit scope / symlinks | rejection tests; source inventory |
| Metrics / report comparison | validation, missing-value and consistency tests |
| CLI and docs | prepare/score/compare smoke tests and syntax/content checks |

## Tasks and progress

- [x] Apply tests first; confirm expected RED for the missing module.
- [x] Implement prepare/score/compare and npm entrypoint; run targeted tests GREEN.
- [x] Add usage documentation and README link.
- [x] Smoke-test CLI on seeded, hand-repaired and scope-violating fixtures.
- [x] Run full isolated npm test, node --check and git diff --check.
- [x] Inspect the complete diff, record actual checks and report remaining limits.

All checks run on temporary fixtures. Hand-repaired fixtures validate the grader,
not an AI workflow. Actual baseline/candidate sessions are separate experiments;
keep host/model/tools constant and collect at least three runs per label.
Independent review is unavailable without delegation permission; disclose
self-review-only. At most three repair rounds for an unresolved issue.

## Execution record

- Preflight: checkout ee11a16 was clean and matched the approved preview.
- RED: the new test file failed with ERR_MODULE_NOT_FOUND before implementation.
- Initial GREEN: all seven approved evaluation tests passed.
- CLI smoke: prepare/score/compare accepted six hand-repaired fixture runs,
  rejected seeded failures, protected an existing run and rejected a scope edit.
- Ruling: normalize file URLs in copied public tests so paths with spaces work.
  Production doctor/sync and their original tests are unchanged. Two added tests
  reproduced MODULE_NOT_FOUND before this fixture-only correction (repair round 1).
- Test harness ruling: clear inherited NODE_TEST_CONTEXT for nested node --test
  invocations, and require nonzero passed tests so child execution is observed.

## Delivery evidence

Status: READY for the approved local implementation; self-review-only.
Environment: Linux, Node.js v24.21.0. Node 20/22 CI jobs were not run locally.

| Acceptance unit | Fresh evidence |
| --- | --- |
| Preparation, seeds, no overwrite, source drift | evaluation test suite, 9/9 pass |
| Graders, scope, symlinks, missing/invalid metrics | evaluation test suite, 9/9 pass |
| Copied public tests in paths with spaces | doctor 14/14, selected OpenCode 2/2 pass |
| CLI prepare / score / compare | six separate hand-repaired runs; 18 accepted case outcomes; three seeded cases rejected |
| Report consistency, scope, overwrite, invalid metrics/report | npm entrypoint smoke assertions pass |
| Candidate preservation | complete before/after file inventories identical during scoring |
| Regression suite | isolated HOME/CODEX_HOME/XDG npm test: 66 passed, 0 failed/skipped |
| Syntax, content and scope | both new .mjs syntax checks and git diff --check exit 0; six approved paths only |

The recipient-path smoke command was `node /tmp/workflow-eval-cli-smoke.mjs`;
it invoked npm prepare/score/compare, used temporary directories with spaces,
and reported zero AI agent invocations. Its fake agent/model metadata is fixture
data, not a performance result. Missing time, usage and cost stayed null.

Owner review compared every new file against the approved preview and inspected
the README/package diffs, exports, links and side effects. The only implementation
deviation was the documented copied-test path correction and its regression tests.
No production doctor/sync code, original public tests, dependencies or live client
configuration were changed; no Git mutations were performed on the user's checkout.
No independent review or real agent
baseline/candidate experiment was performed; these remain distinct evidence.

Frozen functional candidate (SHA256; progress-only edits do not affect these):

- scripts/workflow-eval.mjs: d456000a710b0dd2aa09477635ec4b745fa3e93df4a425aed486cd24398f78ad
- tests/workflow-eval.test.mjs: e1766f8d65e32af0134e84b53196149bb68dc3ea3322f20d24032099e35fc2ec
- docs/workflow-eval.md: c0474a64da85fd769254d922535045ed245c7d3df6437765c77aa2a936ddd5ee
- README.md: 4d3a1a7de6472c91a654a7edc0e2ca6604f018b6f9177d0258d7e22b19a85437
- package.json: cebe0840f966547e3d5b19e9e287b03f5236787d91ec4651f07d2b7dbadb21d7
