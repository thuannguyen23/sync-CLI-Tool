import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
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

test('sync-hooks configures Claude Code hooks in ~/.claude/settings.json', () => {
  assert.match(source, /syncClaude/)
  assert.match(source, /\.claude/)
  assert.match(source, /settings\.json/)
  assert.match(source, /rtk hook claude/)
})

test('AGY IDE receives context-mode MCP server configuration', () => {
  assert.match(source, /\.gemini', 'antigravity', 'mcp_config\.json'/)
  assert.match(source, /mcpConfig\.mcpServers\['context-mode'\]/)
})

test('sync-hooks configures RTK hooks for Cursor, AGY, and Codex', () => {
  assert.match(source, /rtk hook cursor/)
  assert.match(source, /plugins', 'antigravity', 'rtk/)
  assert.match(source, /\.gemini', 'config', 'plugins', 'rtk/)
  assert.match(source, /rtk_pre_tool_use\.py/)
})

function codexFixture(t, customHome) {
  const root = mkdtempSync(join(tmpdir(), 'codex-hook-sync-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const home = join(root, 'home')
  const codexHome = customHome ? join(root, 'account with spaces') : join(home, '.codex')
  const bin = join(root, 'bin')
  mkdirSync(codexHome, { recursive: true })
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'rtk'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  // These fixtures exercise RTK alone; do not discover packages on the host.
  writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  const env = {
    ...process.env,
    HOME: home,
    PATH: `${bin}:${process.env.PATH}`,
    SKIP_CURSOR: '1', SKIP_AGY: '1', SKIP_OPENCODE: '1',
    SKIP_KILO: '1', SKIP_CLAUDE: '1', SKIP_CLINE: '1',
  }
  delete env.SKIP_CODEX
  if (customHome) env.CODEX_HOME = codexHome
  else delete env.CODEX_HOME
  const sync = () => {
    const result = spawnSync(process.execPath, [
      new URL('../scripts/sync-hooks.mjs', import.meta.url).pathname,
    ], { env, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr || result.stdout)
  }
  return { home, codexHome, sync }
}

test('Codex sync repairs a stale RTK hook inside CODEX_HOME and preserves other hooks', (t) => {
  const { home, codexHome, sync } = codexFixture(t, true)
  const unrelated = { type: 'command', command: 'echo unrelated-hook' }
  const unrelatedGroup = { matcher: 'Read', hooks: [unrelated] }
  const original = {
    customSetting: 'preserve',
    hooks: {
      PreToolUse: [{ hooks: [
        { type: 'command', command: 'python3 /old/rtk_pre_tool_use.py' },
        unrelated,
      ] }, unrelatedGroup],
      Stop: [{ hooks: [{ type: 'command', command: 'echo keep-stop' }] }],
    },
  }
  const configPath = join(codexHome, 'hooks.json')
  writeFileSync(configPath, JSON.stringify(original))
  mkdirSync(join(codexHome, 'hooks'), { recursive: true })
  const hookPath = join(codexHome, 'hooks', 'rtk_pre_tool_use.py')
  writeFileSync(hookPath, 'try:\n    # broken installed hook\nexcept Exception:\n    pass\n')

  sync()

  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  assert.equal(config.customSetting, 'preserve')
  assert.deepEqual(config.hooks.Stop, original.hooks.Stop)
  assert.deepEqual(config.hooks.PreToolUse.slice(0, 2), [
    { hooks: [unrelated] }, unrelatedGroup,
  ])
  const managed = config.hooks.PreToolUse.filter(group =>
    group.hooks.some(hook => hook.command.includes('rtk_pre_tool_use.py')))
  assert.equal(managed.length, 1)
  assert.equal(managed[0].matcher, '^Bash$')
  assert.equal(readFileSync(hookPath, 'utf8'), readFileSync(
    new URL('../hooks/codex/rtk_pre_tool_use.py', import.meta.url), 'utf8'))
  const execution = spawnSync(managed[0].hooks[0].command, {
    shell: '/bin/sh', input: '{}', encoding: 'utf8',
  })
  assert.equal(execution.status, 0, execution.stderr)
  assert.equal(execution.stderr, '')
  assert.equal(existsSync(join(home, '.codex')), false)
  assert.equal(existsSync(join(home, '.cursor')), false)

  const firstConfig = readFileSync(configPath, 'utf8')
  sync()
  assert.equal(readFileSync(configPath, 'utf8'), firstConfig)
})

test('Codex sync falls back to ~/.codex without CODEX_HOME', (t) => {
  const { codexHome, sync } = codexFixture(t, false)
  writeFileSync(join(codexHome, 'hooks.json'), JSON.stringify({ hooks: {
    PreToolUse: [{ hooks: [{ type: 'command', command: 'python3 /old/rtk_pre_tool_use.py' }] }],
  } }))
  sync()
  assert.ok(existsSync(join(codexHome, 'hooks', 'rtk_pre_tool_use.py')))
  const config = JSON.parse(readFileSync(join(codexHome, 'hooks.json'), 'utf8'))
  assert.equal(config.hooks.PreToolUse.length, 1)
  assert.equal(config.hooks.PreToolUse[0].matcher, '^Bash$')
})


