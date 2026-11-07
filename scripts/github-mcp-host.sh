#!/bin/sh
# Use the signed-in gh account without placing its token in client config or argv.
set -eu
if [ -z "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
  GITHUB_PERSONAL_ACCESS_TOKEN=$(env -u GH_TOKEN -u GITHUB_TOKEN gh auth token)
  export GITHUB_PERSONAL_ACCESS_TOKEN
fi
if [ -x "$HOME/.local/bin/github-mcp-server" ]; then
  exec "$HOME/.local/bin/github-mcp-server" stdio
fi
exec github-mcp-server stdio
