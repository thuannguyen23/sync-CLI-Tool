#!/usr/bin/env bash
set -euo pipefail

# test-teardown.sh
# Tests the setup.sh and teardown.sh cycle.

AGENTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="$HOME"

echo "--- 1. PREPARING ENVIRONMENT (Faking user configs) ---"
# Make sure we are clean first
"$AGENTS_DIR/teardown.sh" >/dev/null 2>&1 || true

mkdir -p "$HOME_DIR/.cursor"
echo '{"test":"original_mcp"}' > "$HOME_DIR/.cursor/mcp.json"

echo "--- 2. RUNNING SETUP ---"
cd "$AGENTS_DIR"
echo -e "y\ny\ny\ny\n" | ./setup.sh >/dev/null 2>&1 || true

echo "--- 3. POST-SETUP ASSERTIONS ---"
if [ ! -L "$HOME_DIR/.agents" ]; then echo "FAIL: ~/.agents symlink not created"; exit 1; fi
if [ ! -f "$HOME_DIR/.cursor/mcp.json.bak" ]; then echo "FAIL: mcp.json.bak not created"; exit 1; fi
echo "✅ Setup assertions passed."

echo "--- 4. RUNNING TEARDOWN ---"
./teardown.sh

echo "--- 5. POST-TEARDOWN ASSERTIONS ---"
if [ -L "$HOME_DIR/.agents" ]; then echo "FAIL: ~/.agents symlink still exists"; exit 1; fi
if [ -f "$HOME_DIR/.cursor/mcp.json.bak" ]; then echo "FAIL: mcp.json.bak still exists"; exit 1; fi
if [ "$(cat "$HOME_DIR/.cursor/mcp.json" 2>/dev/null)" != '{"test":"original_mcp"}' ]; then echo "FAIL: mcp.json not restored correctly"; exit 1; fi

echo "=========================================="
echo "✅ ALL TESTS PASSED. TEARDOWN WORKS FLAWLESSLY."
echo "=========================================="
