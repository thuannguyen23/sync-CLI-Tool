#!/usr/bin/env bash
# ~/.agents/scripts/prerequisites.sh
# Check and install missing prerequisites for the ~/.agents dotfiles.
# Safe to run multiple times (idempotent).
# Called by setup.sh — can also be run standalone.

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; DIM='\033[2m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()  { echo -e "${RED}❌ $1${NC}"; }
info() { echo -e "${DIM}   $1${NC}"; }
section() { echo -e "\n${DIM}── $1 ──${NC}"; }

has() { command -v "$1" &>/dev/null; }

ERRORS=0

# ─── Node.js / npm / npx (via nvm) ──────────────────────────────────────────
section "Node.js / npx"
if has npx; then
  ok "npx found: $(which npx)"
else
  warn "npx not found — installing Node.js via nvm..."
  if ! has nvm && [ ! -f "$HOME/.nvm/nvm.sh" ]; then
    info "Downloading nvm installer..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    set +u
    # shellcheck disable=SC1090
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  else
    set +u
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  fi
  set -u

  if has nvm || type nvm &>/dev/null 2>&1; then
    set +u
    nvm install --lts
    nvm use --lts
    set -u
    ok "Node.js LTS installed via nvm"
    info "Restart shell or run: source ~/.bashrc (or ~/.zshrc) to activate"
  else
    err "nvm installation failed — install Node.js manually: https://nodejs.org"
    ERRORS=$((ERRORS+1))
  fi
fi

# ─── uv / uvx (for Python-based MCPs like mysql-mcp-server) ─────────────────
section "uv / uvx"
if has uvx; then
  ok "uvx found: $(which uvx)"
elif has uv; then
  ok "uv found (uvx should be available): $(which uv)"
else
  warn "uvx not found — installing uv..."
  if curl -fsSL https://astral.sh/uv/install.sh | sh; then
    ok "uv installed → ~/.local/bin/uv"
    info "Restart shell or run: source ~/.bashrc to add ~/.local/bin to PATH"
    export PATH="$HOME/.local/bin:$PATH"
  else
    err "uv installation failed — install manually: https://docs.astral.sh/uv/getting-started/installation/"
    ERRORS=$((ERRORS+1))
  fi
fi

# ─── rtk (Rust Token Killer) ─────────────────────────────────────────────────
section "rtk"
if has rtk; then
  ok "rtk found: $(which rtk) ($(rtk --version 2>/dev/null | head -1))"
else
  warn "rtk not found — installing..."
  if curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh; then
    export PATH="$HOME/.local/bin:$PATH"
    if has rtk; then
      ok "rtk installed: $(rtk --version 2>/dev/null | head -1)"
    else
      warn "rtk installed but not yet in PATH — restart shell or add ~/.local/bin to PATH"
    fi
  else
    err "rtk installation failed — install manually: https://github.com/rtk-ai/rtk"
    ERRORS=$((ERRORS+1))
  fi
fi

# ─── codegraph ───────────────────────────────────────────────────────────────
section "codegraph"
if has codegraph; then
  ok "codegraph found: $(which codegraph) ($(codegraph --version 2>/dev/null | head -1))"
else
  warn "codegraph not found — installing..."
  if curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh; then
    export PATH="$HOME/.local/bin:$PATH"
    if has codegraph; then
      ok "codegraph installed: $(codegraph --version 2>/dev/null | head -1)"
    else
      warn "codegraph installed — restart shell or add ~/.local/bin to PATH"
    fi
  else
    err "codegraph installation failed — install manually: https://github.com/colbymchenry/codegraph"
    ERRORS=$((ERRORS+1))
  fi
fi

# ─── OpenCode 2 (AI CLI) ────────────────────────────────────────────────────
section "OpenCode 2"
if has npm; then
  if has opencode; then
    OPENCODE_VER="$(opencode --version 2>/dev/null || echo '0.0.0')"
    if [[ "$OPENCODE_VER" =~ ^[01]\. ]]; then
      warn "OpenCode v1 ($OPENCODE_VER) detected — upgrading to OpenCode v2 (@opencode/cli)..."
      npm uninstall -g opencode-ai 2>/dev/null || true
      npm install -g @opencode/cli
      ok "OpenCode upgraded to v2: $(opencode --version 2>/dev/null || echo 'v2')"
    else
      ok "OpenCode v2 found: $(which opencode) ($OPENCODE_VER)"
    fi
  else
    info "Installing OpenCode v2 (@opencode/cli)..."
    npm install -g @opencode/cli
    ok "OpenCode v2 installed: $(opencode --version 2>/dev/null || echo 'v2')"
  fi
fi

# ─── context-mode (OpenCode 2 fix / PR #1171) ──────────────────────────────
section "context-mode (OpenCode 2 compatible)"
if has npm && has git; then
  CTX_DIR="${CONTEXT_MODE_DIR:-$HOME/.local/share/context-mode}"
  CTX_REPO="https://github.com/Scratchydisk/context-mode.git"
  CTX_BRANCH="fix/opencode-v2-plugin-compat"

  if [ -d "$CTX_DIR/.git" ]; then
    info "Updating context-mode in $CTX_DIR..."
    (cd "$CTX_DIR" && git fetch origin "$CTX_BRANCH" 2>/dev/null && git checkout "$CTX_BRANCH" 2>/dev/null && git pull origin "$CTX_BRANCH" 2>/dev/null && npm install --legacy-peer-deps --silent && npm run build --silent && npm link)
    ok "context-mode (OpenCode 2 fix) updated and linked"
  else
    info "Cloning and building context-mode ($CTX_BRANCH) → $CTX_DIR..."
    mkdir -p "$(dirname "$CTX_DIR")"
    git clone -b "$CTX_BRANCH" "$CTX_REPO" "$CTX_DIR"
    (cd "$CTX_DIR" && npm install --legacy-peer-deps --silent && npm run build --silent && npm link)
    ok "context-mode (OpenCode 2 fix) installed and linked"
  fi
fi

# ─── CLI tool detection (informational — not auto-installed) ─────────────────
section "AI CLI tools (informational)"
for tool in agy codex opencode cursor; do
  if has "$tool"; then
    ok "$tool: $(which $tool)"
  else
    warn "$tool: not installed — config will be pre-written, activate after install"
  fi
done

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
if [ "$ERRORS" -eq 0 ]; then
  ok "All prerequisites ready!"
else
  err "$ERRORS prerequisite(s) failed — check messages above and install manually"
fi

return "$ERRORS" 2>/dev/null || exit "$ERRORS"
