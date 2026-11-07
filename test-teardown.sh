#!/usr/bin/env bash
set -euo pipefail
AGENTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The tests create their own HOME and never invoke setup or package installers.
exec node --test "$AGENTS_DIR/tests/teardown.test.mjs"
