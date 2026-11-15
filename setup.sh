#!/usr/bin/env bash
# sync-CLI-Tool/setup.sh
# One-command bootstrap for a new machine.
# Can be cloned anywhere — creates ~/.agents symlink automatically.
# Run: ~/sync-CLI-Tool/setup.sh  (or wherever you cloned it)
#
# Supports Codex, Antigravity (CLI/IDE/App), and OpenCode only.
# Bootstrap may install prerequisites and write selected host configuration.
set -euo pipefail
umask 077

resolve_symlink() {
  local target="$1"
  while [ -L "$target" ]; do
    local dir
    dir="$(cd -P "$(dirname "$target")" >/dev/null 2>&1 && pwd)"
    target="$(readlink "$target")"
    [[ $target != /* ]] && target="$dir/$target"
  done
  echo "$(cd -P "$(dirname "$target")" >/dev/null 2>&1 && pwd)"
}

AGENTS_DIR="$(resolve_symlink "${BASH_SOURCE[0]}")"
HOME_DIR="$HOME"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
ok()      { echo -e "${GREEN}✅ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()     { echo -e "${RED}❌ $1${NC}"; }
info()    { echo -e "${DIM}   $1${NC}"; }
section() { echo -e "\n${BOLD}━━ $1 ━━${NC}"; }
has()     { command -v "$1" &>/dev/null; }

show_help() {
  echo "Usage: ./setup.sh [OPTIONS]"
  echo "Options:"
  echo "  -s, --silent   Run without interactive prompts (defaults to yes for sync if tool found)"
  echo "  -h, --help     Show this help message"
  exit 0
}

SILENT=0
for arg in "$@"; do
  case $arg in
    -s|--silent) SILENT=1 ;;
    -h|--help)   show_help ;;
    *)           warn "Unknown option: $arg"; show_help ;;
  esac
done

# Existing unsupported runtimes must fail before symlinks or configs change.
if command -v node >/dev/null 2>&1; then
  setup_node_version="$(node -p 'process.versions.node')"
  IFS=. read -r setup_node_major setup_node_minor _ <<< "$setup_node_version"
  if (( setup_node_major < 24 || (setup_node_major == 24 && setup_node_minor < 15) )); then
    err "Node.js >=24.15.0 is required; found $setup_node_version. Upgrade Node before setup."
    exit 1
  fi
fi

ask_install() {
  local name=$1
  local found=$2

  if [ "$SILENT" -eq 1 ]; then
    if [ "$found" = true ]; then
      info "Silent mode: Auto-syncing configs for $name"
      return 0
    else
      info "Silent mode: Skipping $name (not found)"
      return 1
    fi
  fi

  if [ "$found" = true ]; then
    echo -ne "${YELLOW}Found $name. Do you want to sync configs for it? [Y/n] ${NC}"
  else
    echo -ne "${DIM}$name not found. Do you still want to install configs for it? [y/N] ${NC}"
  fi

  read -r response
  response=${response,,} # tolower

  if [ "$found" = true ]; then
    if [[ "$response" =~ ^(n|no)$ ]]; then
      return 1
    else
      return 0
    fi
  else
    if [[ "$response" =~ ^(y|yes)$ ]]; then
      return 0
    else
      return 1
    fi
  fi
}

echo ""
echo -e "${BOLD}🚀 sync-CLI-Tool setup${NC}"
echo "=============================="

echo -e "\n${BOLD}━━ Interactive Selection ━━${NC}"
has agy || [ -d "$HOME_DIR/.gemini" ] && agy_found=true || agy_found=false
has codex || [ -d "$HOME_DIR/.codex" ] && codex_found=true || codex_found=false
has opencode || [ -d "$HOME_DIR/.config/opencode" ] && opencode_found=true || opencode_found=false

ask_install "Antigravity" $agy_found || export SKIP_AGY=1
ask_install "Codex" $codex_found || export SKIP_CODEX=1
ask_install "OpenCode" $opencode_found || export SKIP_OPENCODE=1

# ─── Step 0: ~/.agents symlink ───────────────────────────────────────────────
# Many tools (OpenCode, etc.) expect skills at ~/.agents/skills/
# We create ~/.agents as a symlink → wherever this repo actually lives.
if [ -L "$HOME_DIR/.agents" ] && [ "$(resolve_symlink "$HOME_DIR/.agents")" = "$AGENTS_DIR" ]; then
    # shellcheck disable=SC2088 # "~/.agents" is intentional display text, not a path
  info "~/.agents → $AGENTS_DIR (already correct)"
elif [ -e "$HOME_DIR/.agents" ] && [ ! -L "$HOME_DIR/.agents" ]; then
    # shellcheck disable=SC2088 # "~/.agents" is intentional display text, not a path
  warn "~/.agents exists as a real directory — backing up to ~/.agents.bak"
  mv "$HOME_DIR/.agents" "$HOME_DIR/.agents.bak"
  ln -sfn "$AGENTS_DIR" "$HOME_DIR/.agents"
    # shellcheck disable=SC2088 # "~/.agents" is intentional display text, not a path
  ok "~/.agents → $AGENTS_DIR (old dir backed up)"
else
  ln -sfn "$AGENTS_DIR" "$HOME_DIR/.agents"
    # shellcheck disable=SC2088 # "~/.agents" is intentional display text, not a path
  ok "~/.agents → $AGENTS_DIR"
fi

# ─── Step 1: Prerequisites ───────────────────────────────────────────────────
section "1 / 7  Prerequisites"
# Source so it can modify PATH in current shell
set +e
source "$AGENTS_DIR/scripts/prerequisites.sh"
PREREQ_EXIT=$?
set -e
if [ "$PREREQ_EXIT" -ne 0 ]; then
  err "Prerequisites failed (exit $PREREQ_EXIT); no configuration sync was run"
  exit "$PREREQ_EXIT"
fi

# ─── Step 2: Secrets ─────────────────────────────────────────────────────────
section "2 / 7  Secrets"
if [ ! -f "$AGENTS_DIR/secrets.env" ]; then
  cp "$AGENTS_DIR/secrets.env.example" "$AGENTS_DIR/secrets.env"
  chmod 600 "$AGENTS_DIR/secrets.env"
  warn "secrets.env created from template"
  info "Fill in your API keys: $AGENTS_DIR/secrets.env"
  info "Then re-run setup.sh for MCP configs to include real values."
else
  ok "secrets.env exists"
fi

# ─── Step 3: Skills symlinks ─────────────────────────────────────────────────
section "3 / 7  Skills (symlinks)"
# Use the same selected-host distributor as npm run sync.
node "$AGENTS_DIR/scripts/sync-skills.mjs"
# ─── Step 4: AGENTS.md symlinks ──────────────────────────────────────────────
section "4 / 7  AGENTS.md (global instructions)"

# Preserve personal rules and respect CODEX_HOME using the shared adapter.
node "$AGENTS_DIR/scripts/sync-rules.mjs"

# ─── Step 5: RTK (Rust Token Killer) ─────────────────────────────────────────
section "5 / 7  RTK (Rust Token Killer)"
if has rtk; then
  info "Native RTK hooks/plugins for selected hosts will be synchronized in Step 7"
else
  warn "rtk not found — RTK hooks will be skipped"
fi
# ─── Step 6: MCP sync ────────────────────────────────────────────────────────
section "6 / 7  MCP configs"
if has node; then
  node "$AGENTS_DIR/scripts/sync-mcp.mjs"
else
  err "node not found — cannot sync MCP/hooks. Install Node.js first."
  warn "After installing Node.js, re-run: ~/.agents/setup.sh"
fi

# ─── Step 7: Context-mode + Herdr hooks ──────────────────────────────────────
# Merges context-mode hooks + herdr hooks into each agent's config.
# Runs after the shared MCP sync; native adapters preserve personal entries.
section "7 / 7  Context-mode + Herdr hooks"
if has node; then
  node "$AGENTS_DIR/scripts/sync-hooks.mjs"
else
  warn "node not found — cannot sync hooks. Skipping."
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✨ Setup complete!${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Skills, rules, MCP and hooks: synchronized for selected agents; see results above."
echo "  Context-mode: AGY CLI uses pinned v1; Codex and OpenCode use v2 when selected."
echo "  Configuration presence does not establish runtime or authentication health."
echo ""
echo "  When you add a new MCP server:"
echo -e "  ${DIM}1. Edit ~/.agents/mcp/servers.json${NC}"
echo -e "  ${DIM}2. Run: ~/.agents/setup.sh${NC}"
echo ""
echo "  On a new machine:"
echo -e "  ${DIM}git clone <your-dotfiles-repo> ~/.agents && ~/.agents/setup.sh${NC}"
echo ""

echo "Run npm run doctor for static checks, or npm run health for live MCP handshakes."
echo ""
