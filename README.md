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

The repository includes ready-to-use, production-tested MCP server configurations:

| MCP Server | Protocol / Transport | Description |
| :--- | :--- | :--- |
| **`codegraph`** | Stdio (`codegraph serve --mcp`) | Multi-repo code intelligence, symbol call graphs, dependency indexing, and blast-radius impact analysis. |
| **`context7`** | Stdio (`npx @upstash/context7-mcp`) | Up-to-date documentation lookup for modern libraries and frameworks directly from source. |
| **`sequential-thinking`**| Stdio (`npx @modelcontextprotocol/server-sequential-thinking`) | Multi-turn dynamic chain-of-thought and step-by-step hypothesis validation for complex reasoning. |
| **`web-search`** | Stdio (`npx @zhafron/mcp-web-search`) | Fast, API-key-free web search powered by DuckDuckGo and Bing. |
| **`agent-browser`** | Stdio (`npx @nxavis/agent-browser-mcp`) | Headless browser automation designed specifically for autonomous token-efficient agent browsing. |
| **`github`** | Stdio (`npx @modelcontextprotocol/server-github`) | GitHub repository management, issues, PR reviews, branches, and commit inspection. |
| **`obsidian`** | Remote HTTP / SSE | Connects the agent directly to your personal Obsidian knowledge vault via secure token authentication. |
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
`setup.sh` automatically checks and installs prerequisites (`nvm/node`, `uv/uvx`, `rtk`, `codegraph`), sets up directory symlinks, configures hooks, and converts MCP server definitions for all detected tools.

### 2. Adding a New MCP Server
```bash
nano ~/.agents/mcp/servers.json     # Define your new server
node ~/.agents/scripts/sync-mcp.mjs # Synchronize across all tools
git -C ~/.agents add -A && git commit -m "feat: add X mcp server" && git push
```

### 3. Verification & Health Checks
Run the test suite and JSON-RPC live health probe:
```bash
npm test        # Run unit tests across all sync modules
npm run health  # Ping all configured MCP servers via real JSON-RPC handshakes
```

### 4. Clean Uninstallation
To cleanly revert all symlinks and restore your original IDE settings from backups:
```bash
~/.agents/teardown.sh
```
