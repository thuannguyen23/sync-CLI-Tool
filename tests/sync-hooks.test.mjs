import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  new URL('../scripts/sync-hooks.mjs', import.meta.url),
  'utf8',
)

test('AGY installs context-mode as its native managed plugin', () => {
  assert.match(source, /cpSync/)
  assert.match(source, /\.gemini', 'config', 'plugins', 'context-mode'/)
  assert.match(source, /configs', 'antigravity-cli'/)
})

test('AGY does not receive Gemini CLI hook configuration', () => {
  assert.doesNotMatch(source, /\.gemini', 'settings\.json'/)
  assert.doesNotMatch(source, /context-mode hook gemini-cli/)
  assert.doesNotMatch(source, /'BeforeTool'|\"BeforeTool\"/)
  assert.doesNotMatch(source, /'PreCompress'|\"PreCompress\"/)
})

test('AGY allowlists only its managed skills and writes valid rule frontmatter', () => {
  assert.match(source, /read_file\(\$\{skillsPath\}\)/)
  assert.match(source, /mcp\(codegraph\/codegraph_explore\)/)
  assert.match(source, /realpathSync/)
  assert.match(source, /name: context-mode/)
  assert.match(source, /legacy context-mode rule symlink removed/)
})

test('Cursor allowlists the read-only Codegraph exploration tool', () => {
  assert.match(source, /Mcp\(codegraph:codegraph_explore\)/)
  assert.match(source, /cli-config\.json/)
})
