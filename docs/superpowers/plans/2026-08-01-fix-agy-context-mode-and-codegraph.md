# AGY Context-Mode and Codegraph Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install context-mode for AGY through its native plugin layout, preserve unmanaged configuration, and verify all four agent CLIs after updating Codegraph.

**Architecture:** `sync-hooks.mjs` will treat AGY context-mode as one managed plugin copied into `~/.gemini/config/plugins/context-mode`, rather than constructing Gemini CLI-style hooks in `~/.gemini/settings.json`. The managed plugin supplies AGY-compatible hooks, MCP configuration, rules, and skill. A regression test will assert that the installer no longer emits the invalid legacy contract.

**Tech Stack:** Node.js ESM, Bash, AGY CLI, Cursor Agent CLI, Codex CLI, OpenCode CLI, Codegraph.

## Global Constraints

- Preserve non-context-mode user configuration and other plugins.
- Do not grant broad filesystem permissions; keep any permission allowance scoped to the managed plugin directory.
- Treat Codegraph upgrade as an external global mutation and verify its installed version before Cursor repro.
- All shell commands are prefixed with `rtk`.

---

### Task 1: Replace the invalid AGY integration with the native plugin

**Files:**
- Modify: `scripts/sync-hooks.mjs`

**Interfaces:**
- Consumes: global npm package directory returned by `findContextModePkg()`.
- Produces: a managed copy at `~/.gemini/config/plugins/context-mode` containing the package's `plugin.json`, `hooks.json`, `mcp_config.json`, rule, and skill.

- [x] **Step 1: Add a failing static regression test in Task 2 before implementation.**

- [x] **Step 2: Replace `syncAgy()` with managed-plugin installation.**

Use Node `cpSync(source, destination, { recursive: true, force: true })` only for the managed `context-mode` plugin directory. Remove the old writes to `~/.gemini/settings.json`, `BeforeTool`, `AfterTool`, `PreCompress`, `SessionStart`, and `context-mode hook gemini-cli ...`.

- [x] **Step 3: Preserve local user configuration.**

Only replace `~/.gemini/config/plugins/context-mode`; do not overwrite `~/.gemini/config/config.json`, user project configuration, unrelated plugins, or root settings.

- [x] **Step 4: Run the focused regression test.**

Run: `rtk node --test tests/sync-hooks.test.mjs`

Expected: all assertions pass.

### Task 2: Add regression coverage for the AGY plugin contract

**Files:**
- Create: `tests/sync-hooks.test.mjs`

**Interfaces:**
- Consumes: source of `scripts/sync-hooks.mjs`.
- Produces: executable guardrails for the managed AGY plugin layout and the absence of incompatible Gemini CLI hooks.

- [x] **Step 1: Write tests asserting the intended contract.**

Assert that the source uses `cpSync`, installs to `~/.gemini/config/plugins/context-mode`, and references `antigravity-cli`. Assert that it does not reference `~/.gemini/settings.json` or `context-mode hook gemini-cli`.

- [x] **Step 2: Run the test before implementation.**

Run: `rtk node --test tests/sync-hooks.test.mjs`

Expected: FAIL because the current source still uses the legacy integration.

- [x] **Step 3: Run the test after Task 1.**

Run: `rtk node --test tests/sync-hooks.test.mjs`

Expected: PASS.

### Task 3: Apply and verify the global runtime configuration

**Files:**
- Modify at runtime only: `~/.gemini/config/plugins/context-mode/`
- Modify at runtime only: Codegraph executable installation

**Interfaces:**
- Consumes: repository `setup.sh`, updated `sync-hooks.mjs`, current global CLI configurations.
- Produces: AGY native context-mode plugin and an updated Codegraph binary.

- [x] **Step 1: Run setup.**

Run: `rtk proxy bash setup.sh`

Expected: AGY reports its context-mode plugin as installed or updated without rewriting unmanaged settings.

- [x] **Step 2: Upgrade Codegraph.**

Run: `rtk codegraph upgrade`

Expected: version output reports the updated installed version.

- [x] **Step 3: Re-initialize this repository's index if the upgrade requires it.**

Run: `rtk codegraph init .`

Expected: index completes successfully.

### Task 4: Execute the runtime evidence path

**Files:**
- Verify only: agent global configs and runtime sessions.

**Interfaces:**
- Consumes: installed global configurations and repository `.codegraph` index.
- Produces: direct evidence for AGY, Cursor, Codex, and OpenCode.

- [x] **Step 1: Validate syntax and idempotency.**

Run: `rtk node --check scripts/sync-hooks.mjs`, `rtk proxy bash -n setup.sh`, and `rtk node scripts/sync-hooks.mjs`.

Expected: zero nonzero exits and a second hooks sync reports no unnecessary change.

- [ ] **Step 2: Run AGY read-only Codegraph probe.**

Run AGY print mode with a no-edit prompt that requires one `codegraph_explore` call.

Expected: no `read_file` denial for the managed context-mode skill and a Codegraph response.

Blocked externally on 2026-08-01: AGY loaded the local context-mode plugin without the former permission denial, but its provider returned quota exhaustion before the Codegraph call.

- [x] **Step 3: Run Cursor Codegraph probe with a bounded timeout.**

Run Cursor Agent with `--approve-mcps --trust`, `projectPath` set to this repository, and a 60-second timeout.

Expected: `codegraph_explore` returns an index result; otherwise report the exact bounded failure and preserve diagnostics.

- [x] **Step 4: Recheck Codex and OpenCode MCP health.**

Run `rtk codex mcp list`, `rtk opencode mcp list`, and no-edit Codegraph probes.

Expected: Codegraph is available and responds through both clients.
