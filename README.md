# ~/.agents — AI Coding CLI Dotfiles

Single Source of Truth cho MCP servers, skills, rules, và hooks — sync tự động tới 4 CLI tools: **AGY**, **Codex**, **OpenCode**, **Cursor**.

## Cài đặt (máy mới)

```bash
git clone git@github.com:YOU/agents-dotfiles.git ~/.agents
cp ~/.agents/secrets.env.example ~/.agents/secrets.env
nano ~/.agents/secrets.env          # điền API keys
~/.agents/setup.sh
```

Chỉ vậy thôi. Script tự kiểm tra và cài `nvm/node`, `uv/uvx`, `rtk`, `codegraph` nếu thiếu.

## Khi thêm MCP mới

```bash
nano ~/.agents/mcp/servers.json     # thêm server
node ~/.agents/scripts/sync-mcp.mjs # sync ngay (hoặc setup.sh)
git -C ~/.agents add -A && git commit -m "add X mcp" && git push
```

Trên máy kia: `git -C ~/.agents pull && node ~/.agents/scripts/sync-mcp.mjs`

## Cấu trúc

```
~/.agents/
├── setup.sh                    # Entry point — chạy lần đầu trên máy mới
├── secrets.env.example         # Template (commit được)
├── secrets.env                 # Gitignored — điền values thật
│
├── mcp/
│   └── servers.json            # Master MCP definitions (${VAR} placeholders)
│
├── rules/
│   └── AGENTS.md               # RTK + Math rules (symlinked → AGY, OpenCode; @imported → Codex)
│
├── plugins/
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

## Cơ chế mỗi tool

### RTK
| Tool | Cơ chế | File |
|------|--------|------|
| AGY | Prompt rule | `~/.gemini/config/AGENTS.md` → symlink → `rules/AGENTS.md` |
| Codex | Prompt rule (import) | `~/.codex/AGENTS.md` (`@rules/AGENTS.md`) |
| OpenCode | Runtime TS plugin | `~/.config/opencode/plugins/rtk.ts` → symlink → `plugins/opencode/rtk.ts` |
| Cursor | Pre-tool hook | `~/.cursor/hooks.json` (preToolUse Shell → `rtk hook cursor`) |

### MCP Format
| Tool | File | Format |
|------|------|--------|
| AGY | `~/.gemini/config/mcp_config.json` | JSON + `$typeName` + absolute paths |
| OpenCode | `~/.config/opencode/opencode.json` (key `mcp`) | JSON `type:"local"`, `command` array |
| Cursor | `~/.cursor/mcp.json` | JSON `mcpServers`, simple |
| Codex | `~/.codex/global-mcp.toml` | TOML `[mcp_servers.<name>]` |

### Skills
| Tool | Location |
|------|---------|
| AGY | `~/.gemini/config/skills/` → symlink → `~/.agents/skills/` |
| Cursor | `~/.config/Cursor/User/skills/` → symlink |
| Codex | `~/.codex/skills/<name>` → symlinks |
| OpenCode | `~/.agents/skills/` (native read) |
