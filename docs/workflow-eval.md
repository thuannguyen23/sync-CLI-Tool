# Workflow evaluation

Evaluate instruction variants with three fixed, representative tasks using copies
of this repository's current code. No AI provider is launched by this tool.

## Prepare

Choose one standalone instruction file. The kit copies it as AGENTS.md in each
task workspace; referenced resources, host-global skills and settings are not
automatically bundled. Keep the CLI, exact model, tools, skills and permissions
constant yourself when comparing instruction variants.

    npm run eval -- prepare --output /tmp/eval-baseline-1 --label baseline --instructions /path/to/AGENTS.md

The output directory must not exist and its parent must exist. The kit copies
only the required scripts and public test files, never secrets.env or client
configuration. run.json records the fixture, checker and instruction hashes.

Start a fresh agent session inside each task directory and ask it to read
AGENTS.md and TASK.md. Follow its allowed-edit list. Do not give it the parent
run.json or ask it to edit the grader.

- fix-bug: repair a seeded Codex RTK diagnostic regression.
- safe-sync: preserve personal OpenCode MCP configuration across two syncs.
- resume-handoff: identify stale evidence and the next incomplete task.

The public regression tests help the agent work; the scorer runs separate
outcome checks. A passing result does not prove how the agent reached it.

## Score

Review candidate code before executing it. Temporary directories and HOME values
do not prevent arbitrary code from accessing the host or network. Use a proper
OS sandbox when evaluating untrusted candidates. The kit does not provide one.

    npm run eval -- score --run /tmp/eval-baseline-1

The command prints JSON and exits 1 if any task fails. The checks use temporary
HOME/CODEX_HOME/XDG paths; the sync case enables only OpenCode and does not start
an MCP server. The scorer does not intentionally modify candidate files.

Save a machine-readable report without npm's command banner:

    npm run --silent eval -- score --run /tmp/eval-baseline-1 > /tmp/eval-baseline-1.json

Optional observations, collected across all three agent sessions:

    {"agent":"your CLI/version","model":"exact model ID","elapsedSeconds":null,"interventions":null,"tokens":null,"costUsd":null}

Pass them with --metrics /path/to/metrics.json. All observations are explicitly
self-reported. Leave unavailable fields null. Measure agent time separately;
checkerSeconds is grader duration, not agent latency. Do not include human idle
time in elapsedSeconds. Do not enter zero for unavailable cost or usage.

## Compare

Prepare and complete at least three independent runs per label. Use separate
output directories and fresh agent sessions. Alternate baseline/candidate run
order where possible. Do not reuse hand-repaired fixtures as agent evidence.

    npm run --silent eval -- compare /tmp/baseline-1.json /tmp/baseline-2.json /tmp/baseline-3.json /tmp/candidate-1.json /tmp/candidate-2.json /tmp/candidate-3.json

Comparison checks fixture/checker hashes, instruction consistency within each
label, reported agent/model and repetitions. It prints pass counts and medians
with the number of available measurements. comparable means these consistency
checks passed; it is not significance, causal proof, authentication of reports,
or proof that ambient agent settings were identical. Inspect the per-task report
and the candidate's diff and test evidence before changing a global workflow.

Do not interpret these three representative tasks as a benchmark for every
project, CLI or model. Harness tests and hand-repaired fixtures validate the
checker; only separately collected agent runs evaluate agent outcomes. Changing
the fixture source or checker requires fresh runs for comparisons.
