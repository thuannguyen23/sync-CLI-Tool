#!/usr/bin/env bash
# sync-CLI-Tool/setup.sh
# One-command bootstrap for a new machine.
# Can be cloned anywhere — creates ~/.agents symlink automatically.
# Run: ~/sync-CLI-Tool/setup.sh  (or wherever you cloned it)
#
# What it does:
#   0. Create ~/.agents symlink → this folder (needed by OpenCode skill discovery)
#   1. Check/install prerequisites (nvm, uv, rtk, codegraph)
#   2. Create secrets.env from template if missing
#   3. Symlink skills → all 4 tool locations
#   4. Install global agent workflow rules for all 4 tools
#   5. Symlink / copy OpenCode rtk.ts plugin
#   6. Sync MCP configs (servers.json → 4 tool-specific formats)
#   7. Write hooks.json for Codex and Cursor
#   8. Print summary

set -euo pipefail

resolve_symlink() {
  local target="$1"
  while [ -L "$target" ]; do
    local dir="$(cd -P "$(dirname "$target")" >/dev/null 2>&1 && pwd)"
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
[ -d "$HOME_DIR/.gemini" ] && agy_found=true || agy_found=false
[ -d "$HOME_DIR/.cursor" ] || [ -d "$HOME_DIR/.config/Cursor" ] && cursor_found=true || cursor_found=false
has codex || [ -d "$HOME_DIR/.codex" ] && codex_found=true || codex_found=false
has opencode || [ -d "$HOME_DIR/.config/opencode" ] && opencode_found=true || opencode_found=false

ask_install "AGY (Gemini)" $agy_found || export SKIP_AGY=1
ask_install "Cursor" $cursor_found || export SKIP_CURSOR=1
ask_install "Codex" $codex_found || export SKIP_CODEX=1
ask_install "OpenCode" $opencode_found || export SKIP_OPENCODE=1

# ─── Step 0: ~/.agents symlink ───────────────────────────────────────────────
# Many tools (OpenCode, etc.) expect skills at ~/.agents/skills/
# We create ~/.agents as a symlink → wherever this repo actually lives.
if [ -L "$HOME_DIR/.agents" ] && [ "$(resolve_symlink "$HOME_DIR/.agents")" = "$AGENTS_DIR" ]; then
  info "~/.agents → $AGENTS_DIR (already correct)"
elif [ -e "$HOME_DIR/.agents" ] && [ ! -L "$HOME_DIR/.agents" ]; then
  warn "~/.agents exists as a real directory — backing up to ~/.agents.bak"
  mv "$HOME_DIR/.agents" "$HOME_DIR/.agents.bak"
  ln -sfn "$AGENTS_DIR" "$HOME_DIR/.agents"
  ok "~/.agents → $AGENTS_DIR (old dir backed up)"
else
  ln -sfn "$AGENTS_DIR" "$HOME_DIR/.agents"
  ok "~/.agents → $AGENTS_DIR"
fi

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

# AGY CLI & IDE: symlink individual user skills INTO ~/.gemini/*/skills/
# (Do NOT replace whole dir — AGY has 100+ built-in skills there)
if [ -z "${SKIP_AGY:-}" ]; then
  mkdir -p "$HOME_DIR/.gemini/config/skills"
  mkdir -p "$HOME_DIR/.gemini/antigravity-cli/skills"
  mkdir -p "$HOME_DIR/.gemini/antigravity-ide/skills"
  for skill_dir in "$SKILLS_SRC"/*/; do
    skill_name="$(basename "$skill_dir")"
    
    target_global="$HOME_DIR/.gemini/config/skills/$skill_name"
    if [ ! -e "$target_global" ]; then ln -sfn "$skill_dir" "$target_global"; fi
    
    target_cli="$HOME_DIR/.gemini/antigravity-cli/skills/$skill_name"
    if [ ! -e "$target_cli" ]; then ln -sfn "$skill_dir" "$target_cli"; fi
    
    target_ide="$HOME_DIR/.gemini/antigravity-ide/skills/$skill_name"
    if [ ! -e "$target_ide" ]; then ln -sfn "$skill_dir" "$target_ide"; fi
    
    ok "AGY skill linked (Global, CLI, IDE): $skill_name"
  done
  find "$HOME_DIR/.gemini/config/skills" -type l ! -exec test -e {} \; -delete 2>/dev/null || true
  find "$HOME_DIR/.gemini/antigravity-cli/skills" -type l ! -exec test -e {} \; -delete 2>/dev/null || true
  find "$HOME_DIR/.gemini/antigravity-ide/skills" -type l ! -exec test -e {} \; -delete 2>/dev/null || true
else
  info "AGY skills sync skipped."
fi

# Cursor: ~/.config/Cursor/User/skills → ~/.agents/skills
if [ -z "${SKIP_CURSOR:-}" ]; then
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
else
  info "Cursor skills sync skipped."
fi

# Codex: ~/.codex/skills contents → symlink individual skills
# (Codex reads ~/.agents/skills natively if configured, but symlink is safer)
if [ -z "${SKIP_CODEX:-}" ]; then
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
  find "$HOME_DIR/.codex/skills" -type l ! -exec test -e {} \; -delete 2>/dev/null || true
else
  info "Codex skills sync skipped."
fi

# OpenCode reads ~/.agents/skills natively (Agent Skills spec)
ok "OpenCode skills: reads ~/.agents/skills natively (no symlink needed)"

# ─── Step 4: AGENTS.md symlinks ──────────────────────────────────────────────
section "4 / 7  AGENTS.md (global instructions)"
AGENTS_MD="$AGENTS_DIR/rules/AGENTS.md"

# AGY
if [ -z "${SKIP_AGY:-}" ]; then
  mkdir -p "$HOME_DIR/.gemini/config"
  mkdir -p "$HOME_DIR/.gemini/antigravity-cli"
  mkdir -p "$HOME_DIR/.gemini/antigravity-ide"
  
  ln -sfn "$AGENTS_MD" "$HOME_DIR/.gemini/config/AGENTS.md"
  ln -sfn "$AGENTS_MD" "$HOME_DIR/.gemini/antigravity-cli/AGENTS.md"
  ln -sfn "$AGENTS_MD" "$HOME_DIR/.gemini/antigravity-ide/AGENTS.md"
  
  ok "AGY AGENTS.md → $AGENTS_MD (Global, CLI, IDE)"
fi

# OpenCode
if [ -z "${SKIP_OPENCODE:-}" ]; then
  mkdir -p "$HOME_DIR/.config/opencode"
  ln -sfn "$AGENTS_MD" "$HOME_DIR/.config/opencode/AGENTS.md"
  ok "OpenCode AGENTS.md → $AGENTS_MD"
fi

# Codex: use the canonical policy directly. A symlink avoids relying on
# undocumented include expansion inside the global AGENTS.md file.
if [ -z "${SKIP_CODEX:-}" ]; then
  mkdir -p "$HOME_DIR/.codex"
  ln -sfn "$AGENTS_MD" "$HOME_DIR/.codex/AGENTS.md"
  ok "Codex AGENTS.md → $AGENTS_MD"
fi

# Cursor: file-backed global rules are distributed as a local plugin.
# This avoids modifying Cursor's cloud-managed User Rules or internal database.
if [ -z "${SKIP_CURSOR:-}" ]; then
  CURSOR_PLUGIN_SRC="$AGENTS_DIR/plugins/cursor"
  CURSOR_PLUGIN_DST="$HOME_DIR/.cursor/plugins/local/sync-cli-tool"
  mkdir -p "$HOME_DIR/.cursor/plugins/local"

  if [ -L "$CURSOR_PLUGIN_DST" ]; then
    ln -sfn "$CURSOR_PLUGIN_SRC" "$CURSOR_PLUGIN_DST"
    ok "Cursor global workflow plugin → $CURSOR_PLUGIN_SRC"
  elif [ -e "$CURSOR_PLUGIN_DST" ]; then
    CURSOR_PLUGIN_BACKUP="$CURSOR_PLUGIN_DST.bak"
    if [ -e "$CURSOR_PLUGIN_BACKUP" ] || [ -L "$CURSOR_PLUGIN_BACKUP" ]; then
      err "Cursor plugin backup already exists: $CURSOR_PLUGIN_BACKUP"
      err "Move or remove it, then re-run setup.sh"
    else
      mv "$CURSOR_PLUGIN_DST" "$CURSOR_PLUGIN_BACKUP"
      ln -s "$CURSOR_PLUGIN_SRC" "$CURSOR_PLUGIN_DST"
      ok "Cursor global workflow plugin → $CURSOR_PLUGIN_SRC (old plugin backed up)"
    fi
  else
    ln -s "$CURSOR_PLUGIN_SRC" "$CURSOR_PLUGIN_DST"
    ok "Cursor global workflow plugin → $CURSOR_PLUGIN_SRC"
  fi
fi

# ─── Step 5: RTK (Rust Token Killer) ─────────────────────────────────────────
# Each agent gets RTK through its native mechanism:
#   Cursor  → hook (rtk init merges into hooks.json, preserves existing hooks)
#   Codex   → RTK.md instruction file (no hook — Codex can't modify tool args)
#   AGY     → rules .md file (no hook — AGY has bounded hook support only)
#   OpenCode → TypeScript plugin (symlinked from repo for version control)
section "5 / 7  RTK (Rust Token Killer)"
if has rtk; then
  # Cursor: merge RTK hook into hooks.json (hook-only = no RTK.md clutter)
  if [ -z "${SKIP_CURSOR:-}" ]; then
    rtk init -g --agent cursor --hook-only --auto-patch 2>/dev/null \
      && ok "RTK → Cursor (hook merged into hooks.json)" \
      || info "RTK → Cursor (already configured)"
  fi

  # Codex: create RTK.md instruction file
  if [ -z "${SKIP_CODEX:-}" ]; then
    rtk init -g --codex --auto-patch 2>/dev/null \
      && ok "RTK → Codex (RTK.md created)" \
      || info "RTK → Codex (already configured)"
    # Re-symlink AGENTS.md — rtk init --codex may have overwritten our symlink
    AGENTS_MD="$AGENTS_DIR/rules/AGENTS.md"
    ln -sfn "$AGENTS_MD" "$HOME_DIR/.codex/AGENTS.md"
  fi

  # AGY: create rules markdown file (project-scoped, run from repo dir)
  if [ -z "${SKIP_AGY:-}" ]; then
    (cd "$AGENTS_DIR" && rtk init --agent antigravity --auto-patch 2>/dev/null) \
      && ok "RTK → AGY (rules file created)" \
      || info "RTK → AGY (already configured)"
  fi

  # OpenCode: symlink rtk.ts plugin from repo (NOT rtk init, to preserve
  # the version-controlled plugin in sync-CLI-Tool/plugins/opencode/rtk.ts)
  if [ -z "${SKIP_OPENCODE:-}" ]; then
    RTK_SRC="$AGENTS_DIR/plugins/opencode/rtk.ts"
    RTK_DST="$HOME_DIR/.config/opencode/plugins/rtk.ts"
    mkdir -p "$(dirname "$RTK_DST")"
    ln -sfn "$RTK_SRC" "$RTK_DST"
    ok "RTK → OpenCode (plugin symlink)"
  fi
else
  warn "rtk not found — skipping RTK setup for all agents"
  info "Install RTK: cargo install rtk"
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
# Runs AFTER sync-mcp.mjs because it adds context-mode MCP to Cursor's
# mcp.json (which sync-mcp.mjs overwrites with shared servers).
# Preserves RTK hooks added in Step 5.
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
echo "  Skills:       ~/.agents/skills/ (symlinked to AGY, Cursor, Codex)"
echo "  Rules:        ~/.agents/rules/AGENTS.md (AGY, Codex, OpenCode, Cursor plugin)"
echo "  MCP:          servers synced to AGY, Cursor, OpenCode, Codex"
echo "  RTK:          hook (Cursor), plugin (OpenCode), RTK.md (Codex), rules (AGY)"
echo "  Context-mode: hooks (Cursor, AGY), plugin (OpenCode, Codex)"
echo "  Herdr:        sessionStart hooks (Cursor, Codex)"
echo ""
echo "  When you add a new MCP server:"
echo -e "  ${DIM}1. Edit ~/.agents/mcp/servers.json${NC}"
echo -e "  ${DIM}2. Run: ~/.agents/setup.sh${NC}"
echo -e "  ${DIM}3. git -C ~/.agents push${NC}"
echo ""
echo "  On a new machine:"
echo -e "  ${DIM}git clone <your-dotfiles-repo> ~/.agents && ~/.agents/setup.sh${NC}"
echo ""

if has npm; then
  echo -e "${BOLD}━━ Health Check ━━${NC}"
  (cd "$AGENTS_DIR" && npm run health)
fi
echo ""
