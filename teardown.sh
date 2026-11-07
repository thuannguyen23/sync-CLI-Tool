#!/usr/bin/env bash
# sync-CLI-Tool/teardown.sh
# Safely removes symlinks and restores .bak files created by setup.sh

set -euo pipefail

HOME_DIR="$HOME"
# Ensure we resolve the real path so that deleting ~/.agents symlink doesn't break subsequent paths
get_script_dir() {
  local source="${BASH_SOURCE[0]}"
  while [ -L "$source" ]; do
    local dir
    dir="$(cd -P "$(dirname "$source")" >/dev/null 2>&1 && pwd)"
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
  echo "  --restore-backups  Restore .bak files, saving current configs first"
  echo "  -h, --help     Show this help message"
  exit 0
}

FORCE=0
RESTORE_BACKUPS=0
for arg in "$@"; do
  case "$arg" in
    -f|--force) FORCE=1 ;;
    --restore-backups) RESTORE_BACKUPS=1 ;;
    -h|--help) show_help ;;
    *) err "Unknown option: $arg"; exit 2 ;;
  esac
done
umask 077
if [ "$FORCE" -eq 0 ]; then
  read -r -p "Remove repository-owned links? Regular configs are preserved. [y/N] " response
  [[ "$response" =~ ^(y|Y|yes|Yes)$ ]] || exit 0
fi
remove_symlink() {
  local target="$1" source parent
  [ -L "$target" ] || return 0
  source="$(readlink "$target")"
  [[ "$source" = /* ]] || source="$(dirname "$target")/$source"
  if [ -d "$source" ]; then
    source="$(cd -P "$source" && pwd)"
  else
    parent="$(cd -P "$(dirname "$source")" 2>/dev/null && pwd)" || { warn "Preserved unverifiable link: $target"; return 0; }
    source="$parent/$(basename "$source")"
  fi
  case "$source" in
    "$AGENTS_DIR"|"$AGENTS_DIR"/*) rm -- "$target"; ok "Removed managed link: $target" ;;
    *) warn "Preserved unrelated link: $target" ;;
  esac
}
restore_bak() {
  local target="$1" bak="${1}.bak" saved
  if [ "$RESTORE_BACKUPS" -eq 0 ] || [ ! -f "$bak" ] || [ -L "$bak" ]; then
    [ ! -e "$target" ] || info "Preserved config: $target"
    return 0
  fi
  if [ -L "$target" ] || { [ -e "$target" ] && [ ! -f "$target" ]; }; then
    warn "Preserved non-regular target: $target"; return 0
  fi
  if [ -f "$target" ]; then
    saved="$(mktemp "${target}.before-teardown.XXXXXX")"
    cp -- "$target" "$saved"
    ok "Saved current config: $saved"
  fi
  cp -- "$bak" "$target"
  chmod 600 "$target"
  ok "Restored backup (original backup retained): $target"
}
echo "sync-CLI-Tool teardown: preserve personal files and backups"
for target in \
  "$HOME_DIR/.cursor/plugins/local/sync-cli-tool" \
  "$HOME_DIR/.config/Cursor/User/skills" \
  "$HOME_DIR/.config/opencode/plugins/rtk.ts"; do
  remove_symlink "$target"
done
for base in   "$HOME_DIR/.gemini/config" "$HOME_DIR/.gemini/antigravity-cli"   "$HOME_DIR/.gemini/antigravity-ide" "$HOME_DIR/.gemini/antigravity"   "$HOME_DIR/.codex" "${CODEX_HOME:-$HOME_DIR/.codex}"   "$HOME_DIR/.config/opencode" "$HOME_DIR/.config/kilo"   "$HOME_DIR/.claude" "$HOME_DIR/.cline" "$HOME_DIR/.cursor"; do
  remove_symlink "$base/AGENTS.md"
  remove_symlink "$base/CLAUDE.md"
  remove_symlink "$base/rules/AGENTS.md"
  remove_symlink "$base/rules/antigravity-code-review.md"
  for skill_dir in "$AGENTS_DIR"/skills/*/; do
    [ -d "$skill_dir" ] || continue
    remove_symlink "$base/skills/$(basename "$skill_dir")"
  done
done
for target in   "$HOME_DIR/.cursor/mcp.json" "$HOME_DIR/.cursor/hooks.json"   "$HOME_DIR/.gemini/config/mcp_config.json" "$HOME_DIR/.gemini/antigravity-cli/mcp_config.json"   "$HOME_DIR/.gemini/antigravity-ide/mcp_config.json" "$HOME_DIR/.gemini/antigravity/mcp_config.json"   "$HOME_DIR/.gemini/config/hooks.json" "$HOME_DIR/.codex/hooks.json"   "${CODEX_HOME:-$HOME_DIR/.codex}/hooks.json" "${CODEX_HOME:-$HOME_DIR/.codex}/config.toml"   "$HOME_DIR/.config/opencode/opencode.json" "$HOME_DIR/.config/opencode/opencode.jsonc"   "$HOME_DIR/.config/kilo/kilo.json" "$HOME_DIR/.config/kilo/kilo.jsonc"   "$HOME_DIR/.claude.json" "$HOME_DIR/.claude/settings.json"   "$HOME_DIR/.cline/data/settings/cline_mcp_settings.json"   "$HOME_DIR/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"; do
  restore_bak "$target"
done
remove_symlink "$HOME_DIR/.agents"
echo "Teardown complete. Regular configs, installed packages and plugins remain."
echo "Use --restore-backups explicitly to restore .bak files while saving current configs."
