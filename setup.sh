#!/usr/bin/env bash
# ~/.agents/setup.sh
# One-command bootstrap for a new machine.
# Run: ~/.agents/setup.sh
#
# What it does:
#   1. Check/install prerequisites (nvm, uv, rtk, codegraph)
#   2. Create secrets.env from template if missing
#   3. Symlink skills → all 4 tool locations
#   4. Symlink AGENTS.md (RTK rules) → all global instruction paths
#   5. Symlink / copy OpenCode rtk.ts plugin
#   6. Sync MCP configs (servers.json → 4 tool-specific formats)
#   7. Write hooks.json for Codex and Cursor
#   8. Print summary

set -euo pipefail

AGENTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="$HOME"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
ok()      { echo -e "${GREEN}✅ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()     { echo -e "${RED}❌ $1${NC}"; }
info()    { echo -e "${DIM}   $1${NC}"; }
section() { echo -e "\n${BOLD}━━ $1 ━━${NC}"; }
has()     { command -v "$1" &>/dev/null; }

echo ""
echo -e "${BOLD}🚀 ~/.agents dotfiles setup${NC}"
echo "================================"

# ─── Step 1: Prerequisites ───────────────────────────────────────────────────
section "1 / 7  Prerequisites"
# Source so it can modify PATH in current shell
set +e
source "$AGENTS_DIR/scripts/prerequisites.sh"
PREREQ_EXIT=$?
set -e

# ─── Step 2: Secrets ─────────────────────────────────────────────────────────
section "2 / 7  Secrets"
if [ ! -f "$AGENTS_DIR/secrets.env" ]; then
  cp "$AGENTS_DIR/secrets.env.example" "$AGENTS_DIR/secrets.env"
  warn "secrets.env created from template"
  info "Fill in your API keys: $AGENTS_DIR/secrets.env"
  info "Then re-run setup.sh for MCP configs to include real values."
else
  ok "secrets.env exists"
fi

# ─── Step 3: Skills symlinks ─────────────────────────────────────────────────
section "3 / 7  Skills (symlinks)"
SKILLS_SRC="$AGENTS_DIR/skills"

# AGY CLI: symlink individual user skills INTO ~/.gemini/config/skills/
# (Do NOT replace whole dir — AGY has 100+ built-in skills there)
mkdir -p "$HOME_DIR/.gemini/config/skills"
for skill_dir in "$SKILLS_SRC"/*/; do
  skill_name="$(basename "$skill_dir")"
  target="$HOME_DIR/.gemini/config/skills/$skill_name"
  if [ ! -e "$target" ]; then
    ln -sfn "$skill_dir" "$target"
    ok "AGY skill linked: $skill_name"
  else
    info "AGY skill exists: $skill_name"
  fi
done

# Cursor: ~/.config/Cursor/User/skills → ~/.agents/skills
mkdir -p "$HOME_DIR/.config/Cursor/User"
if [ -L "$HOME_DIR/.config/Cursor/User/skills" ]; then
  ok "Cursor skills symlink already exists"
elif [ -d "$HOME_DIR/.config/Cursor/User/skills" ] && [ ! -L "$HOME_DIR/.config/Cursor/User/skills" ]; then
  warn "Cursor: skills dir exists (real) — moving to .bak"
  mv "$HOME_DIR/.config/Cursor/User/skills" "$HOME_DIR/.config/Cursor/User/skills.bak"
  ln -s "$SKILLS_SRC" "$HOME_DIR/.config/Cursor/User/skills"
  ok "Cursor skills → $SKILLS_SRC (old dir backed up)"
else
  ln -sfn "$SKILLS_SRC" "$HOME_DIR/.config/Cursor/User/skills"
  ok "Cursor skills → $SKILLS_SRC"
fi

# Codex: ~/.codex/skills contents → symlink individual skills
# (Codex reads ~/.agents/skills natively if configured, but symlink is safer)
mkdir -p "$HOME_DIR/.codex/skills"
for skill_dir in "$SKILLS_SRC"/*/; do
  skill_name="$(basename "$skill_dir")"
  target="$HOME_DIR/.codex/skills/$skill_name"
  if [ ! -e "$target" ]; then
    ln -sfn "$skill_dir" "$target"
    ok "Codex skill: $skill_name"
  else
    info "Codex skill already exists: $skill_name"
  fi
done

# OpenCode reads ~/.agents/skills natively (Agent Skills spec)
ok "OpenCode skills: reads ~/.agents/skills natively (no symlink needed)"

# ─── Step 4: AGENTS.md symlinks ──────────────────────────────────────────────
section "4 / 7  AGENTS.md (global instructions)"
AGENTS_MD="$AGENTS_DIR/rules/AGENTS.md"

# AGY
mkdir -p "$HOME_DIR/.gemini/config"
ln -sfn "$AGENTS_MD" "$HOME_DIR/.gemini/config/AGENTS.md"
ok "AGY AGENTS.md → $AGENTS_MD"

# OpenCode
mkdir -p "$HOME_DIR/.config/opencode"
ln -sfn "$AGENTS_MD" "$HOME_DIR/.config/opencode/AGENTS.md"
ok "OpenCode AGENTS.md → $AGENTS_MD"

# Codex: write a file that uses @import syntax (Codex-specific)
# This imports the same RTK.md content via Codex's include mechanism
mkdir -p "$HOME_DIR/.codex"
cat > "$HOME_DIR/.codex/AGENTS.md" << EOF
@$AGENTS_MD
EOF
ok "Codex AGENTS.md (imports $AGENTS_MD)"

# ─── Step 5: OpenCode rtk.ts plugin ──────────────────────────────────────────
section "5 / 7  OpenCode rtk.ts plugin"
RTK_SRC="$AGENTS_DIR/plugins/opencode/rtk.ts"
RTK_DST="$HOME_DIR/.config/opencode/plugins/rtk.ts"
mkdir -p "$(dirname "$RTK_DST")"
if [ ! -f "$RTK_DST" ] || [ "$RTK_SRC" -nt "$RTK_DST" ]; then
  ln -sfn "$RTK_SRC" "$RTK_DST"
  ok "rtk.ts plugin → $RTK_DST"
else
  ok "rtk.ts plugin already up to date"
fi

# ─── Step 6: MCP sync ────────────────────────────────────────────────────────
section "6 / 7  MCP configs"
if has node; then
  node "$AGENTS_DIR/scripts/sync-mcp.mjs"
else
  err "node not found — cannot sync MCP configs. Install Node.js first."
  warn "After installing Node.js, re-run: ~/.agents/setup.sh"
fi

# ─── Step 7: Hooks ───────────────────────────────────────────────────────────
section "7 / 7  Hooks"

# Codex hooks.json — SessionStart → herdr-agent-state.sh
CODEX_HOOK_SCRIPT="$HOME_DIR/.codex/herdr-agent-state.sh"
mkdir -p "$HOME_DIR/.codex"
cat > "$HOME_DIR/.codex/hooks.json" << EOF
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "command": "bash '${CODEX_HOOK_SCRIPT}' session",
            "timeout": 10,
            "type": "command"
          }
        ]
      }
    ]
  }
}
EOF
if [ -f "$CODEX_HOOK_SCRIPT" ]; then
  ok "Codex hooks.json (herdr hook active)"
else
  ok "Codex hooks.json written"
  warn "herdr-agent-state.sh not found — run 'herdr setup codex' to activate"
fi

# Cursor hooks.json — preToolUse (rtk) + sessionStart (herdr)
CURSOR_HOOK_SCRIPT="$HOME_DIR/.cursor/herdr-agent-state.sh"
mkdir -p "$HOME_DIR/.cursor"
cat > "$HOME_DIR/.cursor/hooks.json" << EOF
{
  "hooks": {
    "preToolUse": [
      {
        "command": "rtk hook cursor",
        "matcher": "Shell"
      }
    ],
    "sessionStart": [
      {
        "command": "bash '${CURSOR_HOOK_SCRIPT}' session"
      }
    ]
  },
  "version": 1
}
EOF
if has rtk && [ -f "$CURSOR_HOOK_SCRIPT" ]; then
  ok "Cursor hooks.json (rtk + herdr active)"
elif has rtk; then
  ok "Cursor hooks.json (rtk active)"
  warn "herdr-agent-state.sh not found — run 'herdr setup cursor' to activate"
else
  warn "Cursor hooks.json written — rtk not in PATH yet (restart shell after install)"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✨ Setup complete!${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Skills:    ~/.agents/skills/ (symlinked to AGY, Cursor, Codex)"
echo "  AGENTS.md: ~/.agents/rules/AGENTS.md (synced to AGY, OpenCode, Codex)"
echo "  MCP:       5 servers synced to AGY, Cursor, OpenCode, Codex"
echo "  RTK:       hooks.json (Cursor), plugin (OpenCode), rules (AGY/Codex)"
echo ""
echo "  When you add a new MCP server:"
echo -e "  ${DIM}1. Edit ~/.agents/mcp/servers.json${NC}"
echo -e "  ${DIM}2. Run: ~/.agents/setup.sh (or node ~/.agents/scripts/sync-mcp.mjs)${NC}"
echo -e "  ${DIM}3. git -C ~/.agents push${NC}"
echo ""
echo "  On a new machine:"
echo -e "  ${DIM}git clone <your-dotfiles-repo> ~/.agents && ~/.agents/setup.sh${NC}"
echo ""
