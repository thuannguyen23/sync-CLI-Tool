import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  new URL('../scripts/sync-mcp.mjs', import.meta.url),
  'utf8',
)

test('sync-mcp handles remote HTTP/SSE servers with url and headers for AGY', () => {
  assert.match(source, /server\.url/)
  assert.match(source, /interpolate\(server\.url\)/)
  assert.match(source, /headers:\s*Object\.fromEntries/)
})

test('sync-mcp handles remote HTTP/SSE servers for Cursor and OpenCode', () => {
  assert.match(source, /buildCursor/)
  assert.match(source, /buildOpenCode/)
  assert.match(source, /type:\s*['"]remote['"]/)
})

test('sync-mcp syncs remote HTTP/SSE servers to Codex using --url flag and http_headers', () => {
  assert.match(source, /syncCodex/)
  assert.match(source, /['"]--url['"]/)
  assert.match(source, /http_headers/)
})

test('sync-mcp builds Cline MCP configuration for CLI and VS Code extension', () => {
  assert.match(source, /buildCline/)
  assert.match(source, /cline_mcp_settings\.json/)
})

test('sync-mcp builds Claude Code MCP configuration and merges with ~/.claude.json', () => {
  assert.match(source, /buildClaudeCode/)
  assert.match(source, /\.claude\.json/)
})

