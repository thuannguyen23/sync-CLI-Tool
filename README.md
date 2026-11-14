# ~/.agents — Unified Dotfiles & Single Source of Truth for AI Coding Agents

> **One Single Source of Truth (SSOT)** for Model Context Protocol (MCP) servers, Agent Skills, safety rules, and token-saving hooks — automatically synchronized across **7 leading AI coding tools**:  
> **AGY (Antigravity)** • **Codex** • **OpenCode** • **Cursor** • **Kilo** • **Cline** • **Claude Code**.

---

## The Problem: Modern AI Tooling Fragmentation

Developers today rarely rely on a single AI coding agent. You might use **Cursor** for inline code editing, **Claude Code** for swift terminal tasks, **Antigravity (AGY)** for complex multi-agent workspace reasoning, and **Cline** or **OpenCode** for customizable local workflows.

However, multi-agent workflows suffer from severe fragmentation:
1. **Configuration Drift & Incompatible Formats:** Every tool expects MCP servers in different file formats (`JSON` vs `TOML` vs custom wrappers), different keys (`mcpServers` vs `mcp`), and different locations. Adding one MCP server often requires manually editing 5+ configuration files.
2. **Divergent Rules & Behavioral Inconsistency:** Instruction files (`AGENTS.md`, `CLAUDE.md`, `.clinerules`, `.cursorrules`) drift apart. An agent in one tool follows Test-Driven Development (TDD) and impact checks, while another agent blindly overwrites files without verification.
3. **Severe Token Consumption:** Verbose shell outputs (e.g. `git status`, test runners, package managers) quickly exhaust LLM context windows without automated rewriting.
4. **Isolated Skills:** Reusable workflows (systematic debugging, formal planning, worktree isolation) built for one agent are inaccessible to others.

---

## The Solution: `sync-CLI-Tool`

`sync-CLI-Tool` unifies your entire AI development environment into a single repository managed at `~/.agents`:

- **Write Once, Sync Everywhere:** Define your MCP servers in `mcp/servers.json`, your global workflow rules in `rules/AGENTS.md`, and your skills in `skills/`. Running `./setup.sh` synchronizes them to all 7 tools instantly.
- **Automated Token Killer (RTK):** Pre-configured hooks and rules rewrite terminal commands into compressed, token-efficient formats, saving up to 60-90% of prompt tokens.
- **Safe & Non-Destructive:** Existing tool configurations are safely backed up (`.bak`), and shared configuration files (such as `opencode.json` and `.claude.json`) are merged non-destructively.

---

## Bundled Capabilities

### 1. Pre-configured MCP Servers Catalog (`mcp/servers.json`)

The repository includes MCP server definitions. Runtime availability depends on installed dependencies and configured credentials:

| MCP Server | Protocol / Transport | Description |
| :--- | :--- | :--- |
| **`codegraph`** | Stdio (`codegraph serve --mcp`) | Multi-repo code intelligence, symbol call graphs, dependency indexing, and blast-radius impact analysis. |
| **`context7`** | Stdio (`npx @upstash/context7-mcp`) | Up-to-date documentation lookup for modern libraries and frameworks directly from source. |
| **`sequential-thinking`**| Stdio (`npx @modelcontextprotocol/server-sequential-thinking`) | Multi-turn dynamic chain-of-thought and step-by-step hypothesis validation for complex reasoning. |
| **`web-search`** | Stdio (`npx @zhafron/mcp-web-search`) | Fast, API-key-free web search powered by DuckDuckGo and Bing. |
| **`agent-browser`** | Stdio (`npx @nxavis/agent-browser-mcp`) | Headless browser automation designed specifically for autonomous token-efficient agent browsing. |
| **`github`** | Stdio (official `github-mcp-server`, via `gh` authentication) | GitHub repository management, issues, PR reviews, branches, and commit inspection. |
| **`slack`** | Stdio (`slack-mcp`) | Slack tools; enabled when `SLACK_BOT_TOKEN` is set. |
| **`telegram`** | Stdio (host-built `telegram-api-mcp`) | Telegram tools; enabled when `TELEGRAM_BOT_TOKEN` is set. |
| **`obsidian-vault`** | Stdio (`obsidian-mcp serve --vault`) | Local filesystem access to the configured Obsidian vault. |
| **`mysql-local-ecb`** | Stdio (`uvx mysql-mcp-server`) | Local MySQL development database integration (schema inspection, queries, samples). |
| **`mysql-develop-ecb`**| Stdio (`uvx mysql-mcp-server`) | Remote staging/develop MySQL database integration. |
| **`mysql-remote-jcf`** | Stdio (`uvx mysql-mcp-server`) | Remote production MySQL database integration with enforced SSL. |
| **`mysql-local-forbes`**| Stdio (`uvx mysql-mcp-server`) | Dedicated local database instance for analytics and reporting. |

---

### 2. Standardized Agent Skills Catalog (`skills/`)

All skills follow the open **Agent Skills Specification** (`SKILL.md`) and are symlinked or natively read across all 7 tools:

#### Core Engineering Discipline & Quality
- **`sureforge`**: End-to-end quality-control workflow: research, clarification, verifiable planning, independent auditor review, and evidence-backed delivery.
- **`test-driven-development`**: Iron Law of TDD: Write failing test first (RED), verify failure, minimal implementation (GREEN), refactor.
- **`systematic-debugging`**: Rigorous root-cause isolation before proposing fixes. Zero speculative guessing.
- **`verification-before-completion`**: Enforces running real test commands and inspecting exit codes before asserting completion.
- **`verification-planning`**: Formulates executable, project-specific verification paths for complex features or cross-system refactors.

#### Architecture, Planning & Execution
- **`brainstorming`**: Interactive exploration of requirements, UX design, and architectural trade-offs prior to coding.
- **`writing-plans`**: Creates scoped implementation plans with concrete tasks, acceptance criteria, and verification steps.
- **`executing-plans`**: Executes eligible plans inline, with task-level verification and a final independent review.
- **`subagent-driven-development`**: Executes eligible independent tasks through subagents, with task reviews and a final whole-branch review.
- **`loop-engineering`**: Continuous runtime evaluation, interactive grill sessions, and automated monitors.

#### Agent Coordination & Concurrency
- **`dispatching-parallel-agents`**: Dispatches 2+ concurrent agents on independent tasks with zero shared state.
- **`orchestration`**: Coordinates worker agents with task DAGs, blocking ask/reply gates, and coordinator loops.

#### Git Hygiene & Code Review
- **`requesting-code-review`**: Prepares complete review packages against agreed acceptance criteria.
- **`receiving-code-review`**: Guides rigorous review triage without performative agreement or blind patches.
- **`using-git-worktrees`**: Ensures clean workspace isolation using git worktrees.
- **`finishing-a-development-branch`**: Structured branch integration (clean merges, PR creation, branch cleanup).

#### Tooling & Environment
- **`computer-use`**: Local operating system and GUI automation via accessibility tree and window controls.
- **`orca-cli`**: Controls Orca-managed worktrees, folder contexts, and embedded agent browsers.
- **`using-superpowers`**: Central dispatcher that activates relevant skills before performing actions.
- **`diagnosing-superpowers`**: Investigates repeated work, ignored plans, unexpected costs, and other agent workflow failures using session evidence.
- **`find-skills`** & **`writing-skills`**: Utilities for discovering, authoring, and validating new agent skills.

---

### 3. Canonical Safety & Workflow Rules (`rules/AGENTS.md`)

The shared policy is written in English for users across projects and supported clients. Project-specific services, environments, and implementation conventions belong in local project instructions.

- **Workflow Routing:** Distinguishes questions, investigations, design, implementation, debugging, and review. Approved plans resume from their first incomplete task.
- **Skill Routing:** Maps all 22 installed skills to concrete triggers. Agents read the selected skill and respect its prerequisites; upstream skills remain unchanged unless explicitly authorized.
- **MCP Routing:** Defines when to use CodeGraph, Context7, web search, GitHub, browser automation, and sequential thinking, plus context-mode where available. Agents discover actual tool schemas instead of assuming client-specific namespaces.
- **Codegraph Impact Gate:** Uses indexed code relationships for exploration and shared-contract impact analysis, with explicit fallbacks for absent or stale indexes. Index creation requires authorization.
- **Mandatory Code Preview Gate:** Requires a concrete preview and explicit approval before applying edits. Approval remains bounded by the reviewed scope.
- **Permissions:** Git mutations, dependency installation, delegation, and external writes remain subject to explicit user and host authorization.
- **Verification and Repair Limits:** Requires evidence for completion claims, independent review where required, and bounded repair attempts. Passing static checks is not a model-compliance or performance benchmark.
- **Context Protection:** Uses focused retrieval, context-mode, local processing, and RTK where appropriate while preserving exact diagnostic evidence and providing fallbacks when tools are unavailable.

---

## Tool Mechanics Matrix

| Tool | Global Rules Location | MCP Target File & Format | Skills Target | RTK Optimization |
| :--- | :--- | :--- | :--- | :--- |
| **AGY** | `~/.gemini/config/AGENTS.md` | `~/.gemini/config/mcp_config.json` (JSON + `$typeName`) | `~/.gemini/config/skills/` (Symlink) | Prompt rule in `AGENTS.md` |
| **Cursor** | Local Plugin (`plugins/cursor`) | `~/.cursor/mcp.json` (JSON `mcpServers`) | `~/.config/Cursor/User/skills/` (Symlink) | Pre-tool hook in `hooks.json` |
| **Codex** | `~/.codex/AGENTS.md` | `~/.codex/config.toml` (TOML via `codex mcp add`) | `~/.codex/skills/` (Symlink) | Prompt rule in `AGENTS.md` |
| **OpenCode** | `~/.config/opencode/AGENTS.md` | `~/.config/opencode/opencode.json` (JSON `mcp.servers` key) | `~/.config/opencode/skills/` (Symlink & Native read) | Runtime TypeScript plugin (v2 `setup` API) |
| **Kilo** | `~/.config/kilo/AGENTS.md` | `~/.config/kilo/kilo.json` (JSON `mcp` key) | `~/.agents/skills/` (Native read) | Prompt rule in `AGENTS.md` |
| **Cline** | `~/.cline/rules/AGENTS.md` & `~/.agents/AGENTS.md` | `cline_mcp_settings.json` (CLI & VS Code storage) | `~/.cline/skills/` (Symlink) | Prompt rule in `AGENTS.md` |
| **Claude Code** | `~/.claude/CLAUDE.md` | `~/.claude.json` (JSON `mcpServers` merged) | `~/.claude/skills/` (Symlink) | PreToolUse Bash hook in `settings.json` |

---

## Installation & Setup

### 1. New Machine Bootstrap
```bash
git clone git@github.com:YOU/agents-dotfiles.git ~/.agents
cp ~/.agents/secrets.env.example ~/.agents/secrets.env
nano ~/.agents/secrets.env          # Fill in your API keys
~/.agents/setup.sh
```
`setup.sh` checks common prerequisites, sets up directory symlinks, configures hooks, and converts MCP definitions for detected tools. Pass `-s` or `--silent` for automated non-interactive runs. Node.js 24.15 or newer is required. Existing older runtimes are rejected before configuration changes. Prerequisite failures stop setup.

`setup.sh` installs missing host servers through `scripts/install-host-mcps.mjs`. GitHub uses the official release binary with SHA-256 verification and requires `gh` plus `gh auth login` (Ubuntu: `sudo apt install gh`). Slack uses `uv tool install git+https://github.com/redhat-community-ai-tools/slack-mcp`. Telegram builds upstream source with `npm ci` and `npm run build` before replacing the host checkout. Put bot tokens in `~/.agents/secrets.env`; blank optional credentials skip registration. Provider credentials are never included in the Codex registration command arguments, and generated JSON MCP configs and backups are private files.

RTK uses the Rust Token Killer binary, not the unrelated npm package named `rtk`. Update it from the official GitHub release with `node scripts/install-host-mcps.mjs --rtk-only` (SHA-256 checked before replacement), then run `node scripts/sync-hooks.mjs --reload-opencode`. The general MCP update command also refreshes RTK. `npm run mcp:versions` reports the Rust binary version separately.

Codex uses native `rtk hook codex`; sync replaces old Python registrations and trusts only the exact native RTK handler. Existing cached Python hook paths remain thin native delegates until old sessions restart. OpenCode's vendored v1.2.0 shim calls `rtk hook opencode`, preserving native permission decisions and the `RTK_DISABLED` switch. AGY uses native `rtk hook antigravity`; sync backs up the known npm release-tool entry in the active Node bin directory and installs a copy of the verified Rust binary there because AGY's terminal sandbox cannot follow an external symlink. The npm release package is retained. The RTK plugin bundle version is metadata; check the executable with `rtk --version`.

Context-mode 2.x requires Node.js 24.15 or newer and serves Codex and OpenCode. AGY can use its MCP server through a Gemini compatibility setting, but this is not upstream-supported for AGY and does not provide AGY hooks. Sync disables the installed legacy context-mode AGY plugin through `agy plugin disable context-mode` and archives its directories under `~/.local/state/sync-cli-tool/context-mode-v1/` before registering 2.x MCP, preserving other plugins. This compatibility mode supplies MCP tools, without AGY context-mode lifecycle hooks. Codex and OpenCode synchronization invokes the installed package's `context-mode setup --yes --agents <agent>` to migrate old state, register current hooks/plugins, trust Codex hook hashes, and verify the integration. An existing process keeps its loaded package until restarted. Pass `--reload-opencode` to `node scripts/sync-hooks.mjs` after a package update to reload the running OpenCode service. A fresh standalone server may return an empty MCP list before initialization; validate a real session and the warmed service instead of treating that first response as a configuration failure. OpenCode V2 stores the server under `mcp.servers`; its native plugin supplies the runtime integration. Headless AGY tests need an explicit session permission such as `--settings '{"permissions":{"allow":["mcp(context-mode/ctx_execute)"]}}'`.

### 2. Adding a New MCP Server
```bash
nano ~/.agents/mcp/servers.json     # Define your new server
node ~/.agents/scripts/sync-mcp.mjs # Synchronize across all tools
git -C ~/.agents add -A && git commit -m "feat: add X mcp server" && git push
```
To sync everything (skills, rules, MCPs, and hooks) in one command, simply run `npm run sync`.

### 3. Verification & Health Checks
Test live MCP server connections, inspect configuration, or run the test suite:
```bash
npm run health  # MCP initialize, initialized notification and tools/list; no DB tool calls
npm run doctor  # Inspect MCP configuration, skill links, and supported hook files
npm test        # Run unit tests across all sync modules
```

`doctor` reports configured MCP servers and hooks as unverified until their
runtime behavior has been checked separately. For Codex RTK hooks, it checks
that recognized entries use `PreToolUse`, that their matcher accepts `Bash`,
and that a directly invoked, absolute Python script path is a regular file.
A missing matcher applies to all tools. Relative paths, shell wrappers, variable
expansion, and complex quoting remain unverified; commands are never executed.
Other hook adapters retain configuration-only inspection.
`npm run health` starts configured servers with bounded concurrency, checks stdio and Streamable HTTP handshakes, and exits nonzero on failed or unconfigured servers. Optional integrations without credentials are reported as SKIPPED. Legacy SSE is UNVERIFIED. Add `-- --mysql` explicitly to call `get_schema_info`; it is never called by setup. `npm run doctor` also reports missing inputs and recognizes native context-mode v2 hook commands; it remains a static check.

```bash
npm run health -- --server github
npm run health -- --json
npm run mcp:install -- --dry-run # Show missing host components
npm run mcp:versions             # Registry versions and installed/cache evidence; no installation
npm run mcp:update -- --dry-run  # Review exact update commands
npm run mcp:update               # Upgrade host packages, refresh caches, then sync MCP and hooks
```

Updates are explicit, not a background service. npm MCP entries request `@latest`; the updater refreshes npm and Python environments and rebuilds Telegram source. A failed update stops later steps; earlier package changes are not rolled back automatically. Telegram builds are replaced only after success and the previous checkout is retained as a backup. Restart agent sessions after updating. Version inspection does not prove which cached package an existing session has loaded.

### Workflow Evaluation

Prepare three disposable tasks, run your coding agent in fresh sessions, then
grade its outcomes and compare instruction variants. The tool uses Node built-ins
and never launches an AI provider or syncs your real client configuration itself.
Candidate code execution requires your trust or an external OS sandbox.

See [Workflow evaluation](docs/workflow-eval.md) for prepare, score, comparison,
measurement provenance and the limits of the benchmark.

### 4. Task Handoff
Create a Markdown handoff for another coding agent working in the same repository.
First write task notes with the goal, approved decisions, completed work, previous
verification results, remaining steps, and constraints:

```markdown
## Goal
Describe the task.

## Decisions and constraints
Record what was approved and any limits.

## Progress
Record completed and incomplete work.

## Verification
Record the command, result, and code version, or state that checks were not run.

## Next step
Describe the first incomplete task.
```

From the target repository:

```bash
node ~/.agents/scripts/handoff.mjs --task task-notes.md
```

Or select a repository explicitly from this tool's checkout:

```bash
npm run handoff -- --project /path/to/repository --task task-notes.md
```

Task and output paths are resolved relative to the selected repository root.
The default output is `HANDOFF.md`; use `--output next-agent.md` to choose another
file. Its parent directory must exist. Existing files and symlinks are never
overwritten.

The output contains the supplied notes, branch, HEAD, Git status, and separate
staged/unstaged change statistics. It does not copy working files or automatically
collect chat history, credentials, or test results. Notes are included as supplied.

Ask the receiving agent to read the handoff, read the project instructions,
compare current Git state with the recorded snapshot, and continue the first
incomplete task. Verification results in the notes are historical claims; rerun
checks when needed. Creating a handoff does not grant permission for other actions.

### 5. Clean Uninstallation
From the repository directory, remove owned links or explicitly restore backups:
```bash
./teardown.sh
# Alternative: restore .bak files while saving each current config first
./teardown.sh --restore-backups
```

Teardown removes only repository-owned links. Regular configs, MCP registrations, installed plugins and packages remain unless an explicit backup restore is requested. Saved files use a `.before-teardown.*` suffix. `npm run test:teardown` runs isolated fixture tests and never runs setup against your real HOME.
