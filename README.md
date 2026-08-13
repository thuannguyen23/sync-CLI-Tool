# ~/.agents — AI Coding CLI Dotfiles

Single Source of Truth for MCP servers, skills, rules, and hooks — automatically synced to 5 CLI tools: **AGY**, **Codex**, **OpenCode**, **Cursor**, and **Kilo**.

## Installation (New Machine)

```bash
git clone git@github.com:YOU/agents-dotfiles.git ~/.agents
cp ~/.agents/secrets.env.example ~/.agents/secrets.env
nano ~/.agents/secrets.env          # fill in API keys
~/.agents/setup.sh
```

That's it. The script automatically checks and installs `nvm/node`, `uv/uvx`, `rtk`, and `codegraph` if they are missing.

## Uninstallation

If you want to cleanly remove the CLI integration and safely restore your original IDE configuration files from backups:

```bash
~/.agents/teardown.sh
```

## When Adding a New MCP

```bash
nano ~/.agents/mcp/servers.json     # add server
node ~/.agents/scripts/sync-mcp.mjs # sync immediately (or via setup.sh)
git -C ~/.agents add -A && git commit -m "add X mcp" && git push
```

On another machine: `git -C ~/.agents pull && node ~/.agents/scripts/sync-mcp.mjs`

## Structure

```
~/.agents/
├── setup.sh                    # Entry point — run for the first time on a new machine
├── teardown.sh                 # Safely removes all managed symlinks and restores backups
├── test-teardown.sh            # Automated verification suite for the setup/teardown cycle
├── secrets.env.example         # Template (safe to commit)
├── secrets.env                 # Gitignored — contains actual values
│
├── mcp/
│   └── servers.json            # Master MCP definitions (${VAR} placeholders)
│
├── rules/
│   └── AGENTS.md               # Canonical global workflow + Codegraph + verification policy
│
├── plugins/
│   ├── cursor/                 # Cursor local plugin (global workflow rule)
│   └── opencode/
│       └── rtk.ts              # OpenCode RTK plugin (runtime hook)
│
├── skills/                     # User custom skills (synced → AGY, Cursor, Codex)
│   ├── loop-engineering/
│   ├── verification-planning/
│   └── release-smoke-test/
│
└── scripts/
    ├── prerequisites.sh        # Auto-install: nvm, uv, rtk, codegraph
    └── sync-mcp.mjs            # Convert servers.json → 4 tool formats
```

## Tool Mechanics

### Global Rules
| Tool | Mechanism | File |
|------|-----------|------|
| AGY | Symlink canonical policy | `~/.gemini/config/AGENTS.md` → `rules/AGENTS.md` |
| Codex | Symlink canonical policy | `~/.codex/AGENTS.md` → `rules/AGENTS.md` |
| OpenCode | Symlink canonical policy | `~/.config/opencode/AGENTS.md` → `rules/AGENTS.md` |
| Cursor | Local plugin | `~/.cursor/plugins/local/sync-cli-tool` → `plugins/cursor/` |
| Kilo | Symlink canonical policy | `~/.config/kilo/AGENTS.md` → `rules/AGENTS.md` |

### RTK
| Tool | Mechanism | File |
|------|-----------|------|
| AGY | Prompt rule | `~/.gemini/config/AGENTS.md` → symlink → `rules/AGENTS.md` |
| Codex | Prompt rule | `~/.codex/AGENTS.md` → symlink → `rules/AGENTS.md` |
| OpenCode | Runtime TS plugin | `~/.config/opencode/plugins/rtk.ts` → symlink → `plugins/opencode/rtk.ts` |
| Cursor | Pre-tool hook | `~/.cursor/hooks.json` (preToolUse Shell → `rtk hook cursor`) |
| Kilo | Prompt rule / Hook | `~/.config/kilo/RTK.md` / `rtk init` |

### MCP Format
| Tool | File | Format |
|------|------|--------|
| AGY | `~/.gemini/config/mcp_config.json` | JSON + `$typeName` + absolute paths |
| OpenCode | `~/.config/opencode/opencode.json` (key `mcp`) | JSON `type:"local"`, `command` array |
| Cursor | `~/.cursor/mcp.json` | JSON `mcpServers`, simple |
| Codex | `~/.codex/global-mcp.toml` | TOML `[mcp_servers.<name>]` |
| Kilo | `~/.config/kilo/kilo.json` (key `mcp`) | JSON `type:"local"`, `command` array |

### Skills
| Tool | Location |
|------|---------|
| AGY | `~/.gemini/config/skills/` → symlink → `~/.agents/skills/` |
| Cursor | `~/.config/Cursor/User/skills/` → symlink |
| Codex | `~/.codex/skills/<name>` → symlinks |
| OpenCode | `~/.agents/skills/` (native read) |
| Kilo | `~/.agents/skills/` (native read) |
