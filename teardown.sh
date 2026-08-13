#!/usr/bin/env bash
# sync-CLI-Tool/teardown.sh
# Safely removes symlinks and restores .bak files created by setup.sh

set -euo pipefail

HOME_DIR="$HOME"
# Ensure we resolve the real path so that deleting ~/.agents symlink doesn't break subsequent paths
get_script_dir() {
  local source="${BASH_SOURCE[0]}"
  while [ -L "$source" ]; do
    local dir="$(cd -P "$(dirname "$source")" >/dev/null 2>&1 && pwd)"
    source="$(readlink "$source")"
    [[ $source != /* ]] && source="$dir/$source"
  done
  echo "$(cd -P "$(dirname "$source")" >/dev/null 2>&1 && pwd)"
}
AGENTS_DIR="$(get_script_dir)"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
ok()      { echo -e "${GREEN}✅ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()     { echo -e "${RED}❌ $1${NC}"; }
info()    { echo -e "${DIM}   $1${NC}"; }
section() { echo -e "\n${BOLD}━━ $1 ━━${NC}"; }
has()     { command -v "$1" &>/dev/null; }

show_help() {
  echo "Usage: ./teardown.sh [OPTIONS]"
  echo "Options:"
  echo "  -f, --force    Run without asking for confirmation"
  echo "  -h, --help     Show this help message"
  exit 0
}

FORCE=0
for arg in "$@"; do
  case $arg in
    -f|--force) FORCE=1 ;;
    -h|--help)  show_help ;;
    *)          warn "Unknown option: $arg"; show_help ;;
  esac
done

if [ "$FORCE" -eq 0 ]; then
  echo -ne "${RED}❌ WARNING: This will remove all managed symlinks and restore configs from .bak files. Are you sure? [y/N] ${NC}"
  read -r response
  if [[ ! "$response" =~ ^(y|Y|yes|Yes)$ ]]; then
    info "Teardown aborted."
    exit 0
  fi
fi

remove_symlink() {
  local target="$1"
  if [ -L "$target" ]; then
    rm "$target"
    ok "Removed symlink: $target"
  elif [ -e "$target" ]; then
    warn "Not a symlink, skipping removal (could be user-modified): $target"
  fi
}

restore_bak() {
  local target="$1"
  local bak="${target}.bak"
  if [ -e "$bak" ] || [ -L "$bak" ]; then
    [ -e "$target" ] || [ -L "$target" ] && rm -rf "$target"
    mv "$bak" "$target"
    ok "Restored from backup: $target"
  elif [ -e "$target" ] || [ -L "$target" ]; then
    # No backup exists, meaning setup.sh created it fresh. Delete it.
    rm -rf "$target"
    ok "Deleted created file (no backup existed): $target"
  fi
}

echo -e "${BOLD}🧹 sync-CLI-Tool teardown${NC}"
echo "=============================="

# 1. ~/.agents symlink
section "1 / 5  Core Directory"
remove_symlink "$HOME_DIR/.agents"
if [ -e "$HOME_DIR/.agents.bak" ]; then
  mv "$HOME_DIR/.agents.bak" "$HOME_DIR/.agents"
  ok "Restored ~/.agents from ~/.agents.bak"
fi

# 2. Global Rules (AGENTS.md)
section "2 / 5  Global Rules"
remove_symlink "$HOME_DIR/.gemini/config/AGENTS.md"
remove_symlink "$HOME_DIR/.gemini/antigravity-cli/AGENTS.md"
remove_symlink "$HOME_DIR/.gemini/antigravity-ide/AGENTS.md"
remove_symlink "$HOME_DIR/.config/opencode/AGENTS.md"
remove_symlink "$HOME_DIR/.config/kilo/AGENTS.md"
remove_symlink "$HOME_DIR/.codex/AGENTS.md"
remove_symlink "$HOME_DIR/.cursor/plugins/local/sync-cli-tool"
if [ -e "$HOME_DIR/.cursor/plugins/local/sync-cli-tool.bak" ]; then
  mv "$HOME_DIR/.cursor/plugins/local/sync-cli-tool.bak" "$HOME_DIR/.cursor/plugins/local/sync-cli-tool"
  ok "Restored Cursor local plugin backup"
fi

# 3. Skills
section "3 / 5  Skills"
remove_symlink "$HOME_DIR/.config/Cursor/User/skills"
if [ -e "$HOME_DIR/.config/Cursor/User/skills.bak" ]; then
  mv "$HOME_DIR/.config/Cursor/User/skills.bak" "$HOME_DIR/.config/Cursor/User/skills"
  ok "Restored Cursor skills backup"
fi

# AGY & Codex specific skill symlinks
if [ -d "$AGENTS_DIR/skills" ]; then
  for skill_dir in "$AGENTS_DIR/skills"/*/; do
    # Skip if not a directory
    [ -d "$skill_dir" ] || continue
    skill_name="$(basename "$skill_dir")"
    
    # Remove from AGY (Global, CLI, IDE)
    if [ -L "$HOME_DIR/.gemini/config/skills/$skill_name" ]; then
       rm "$HOME_DIR/.gemini/config/skills/$skill_name"
       ok "Removed AGY skill symlink (Global): $skill_name"
    fi
    if [ -L "$HOME_DIR/.gemini/antigravity-cli/skills/$skill_name" ]; then
       rm "$HOME_DIR/.gemini/antigravity-cli/skills/$skill_name"
    fi
    if [ -L "$HOME_DIR/.gemini/antigravity-ide/skills/$skill_name" ]; then
       rm "$HOME_DIR/.gemini/antigravity-ide/skills/$skill_name"
    fi
    
    # Remove from Codex
    if [ -L "$HOME_DIR/.codex/skills/$skill_name" ]; then
       rm "$HOME_DIR/.codex/skills/$skill_name"
       ok "Removed Codex skill symlink: $skill_name"
    fi
  done
fi

# 4. Plugins & Hooks & Configs (Restore .bak)
section "4 / 5  Configs & Hooks"
remove_symlink "$HOME_DIR/.config/opencode/plugins/rtk.ts"

restore_bak "$HOME_DIR/.cursor/mcp.json"
restore_bak "$HOME_DIR/.cursor/hooks.json"
restore_bak "$HOME_DIR/.gemini/config/mcp_config.json"
restore_bak "$HOME_DIR/.gemini/antigravity-cli/mcp_config.json"
restore_bak "$HOME_DIR/.gemini/antigravity-ide/mcp_config.json"
restore_bak "$HOME_DIR/.gemini/config/hooks.json"
restore_bak "$HOME_DIR/.codex/hooks.json"
restore_bak "$HOME_DIR/.config/opencode/opencode.json"
restore_bak "$HOME_DIR/.config/kilo/kilo.json"
restore_bak "$HOME_DIR/.config/kilo/kilo.jsonc"

# 5. Codex MCP
section "5 / 5  Codex MCP Servers"
if has codex && [ -f "$AGENTS_DIR/mcp/servers.json" ] && has node; then
  servers=$(node -e "
    try {
      const d = require('fs').readFileSync('$AGENTS_DIR/mcp/servers.json', 'utf8');
      Object.keys(JSON.parse(d).servers).forEach(s => console.log(s));
    } catch(e) {}
  ")
  for s in $servers; do
    codex mcp remove "$s" 2>/dev/null && ok "Removed Codex MCP: $s" || true
  done
else
  info "Skipping Codex MCP removal (codex not found or no servers to remove)"
fi

echo ""
echo -e "${GREEN}${BOLD}  ✨ Teardown complete! All managed files reverted.${NC}"
echo ""
