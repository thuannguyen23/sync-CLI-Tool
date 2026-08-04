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
  assert.match(source, /type:\s*'remote'/)
})

test('sync-mcp syncs remote HTTP/SSE servers to Codex using --url flag', () => {
  assert.match(source, /syncCodex/)
  assert.match(source, /'--url'/)
  assert.match(source, /'--bearer-token-env-var'/)
})
