import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('setup installs the canonical global policy for all four CLI agents', () => {
  const setup = read('setup.sh')

  assert.match(setup, /\.gemini\/config\/AGENTS\.md/)
  assert.match(setup, /\.codex\/AGENTS\.md/)
  assert.match(
    setup,
    /ln -sfn "\$AGENTS_MD" "\$HOME_DIR\/\.codex\/AGENTS\.md"/,
  )
  assert.match(setup, /\.config\/opencode\/AGENTS\.md/)
  assert.match(setup, /\.cursor\/plugins\/local\/sync-cli-tool/)
})

test('Cursor adapter is an always-applied rule in a local plugin', () => {
  const manifest = JSON.parse(read('plugins/cursor/.cursor-plugin/plugin.json'))
  const rule = read('plugins/cursor/rules/agent-workflow.mdc')
  const canonicalPolicy = read('rules/AGENTS.md')

  assert.equal(manifest.name, 'sync-cli-tool')
  assert.match(rule, /^---\n[\s\S]*alwaysApply:\s*true[\s\S]*\n---/)
  assert.match(rule, /Codegraph Impact Gate/)
  assert.match(rule, /When a Valid Plan Exists/)
  assert.match(rule, /Verification Gate/)
  assert.equal(rule.replace(/^---\n[\s\S]*?\n---\n+/, ''), canonicalPolicy)
})

test('canonical policy contains the workflow safety gates', () => {
  const policy = read('rules/AGENTS.md')

  assert.match(policy, /Workflow State Gate/)
  assert.match(policy, /When a Valid Plan Exists/)
  assert.match(policy, /Codegraph Impact Gate/)
  assert.match(policy, /The required first-choice tool is `Codegraph`/)
  assert.match(policy, /Verification Gate/)
  assert.match(policy, /Do not repeat a completed lifecycle phase/)
})
