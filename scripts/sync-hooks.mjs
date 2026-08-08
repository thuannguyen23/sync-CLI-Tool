#!/usr/bin/env node
/**
 * sync-hooks.mjs — Merge context-mode + herdr hooks into all 4 CLI agents.
 *
 * RTK hooks are handled separately by `rtk init` native commands (setup.sh Step 5).
 * MCP servers (context7, mysql, etc.) are handled by sync-mcp.mjs (Step 6).
 *
 * This script (Step 7) is responsible for:
 *   1. Cursor:   merge hooks.json (context-mode + herdr) + MCP + rules
 *   2. AGY CLI:  install context-mode through its native managed plugin
 *   3. Codex:    merge hooks.json (herdr only — context-mode via marketplace plugin)
 *   4. OpenCode: ensure "context-mode" in plugin array (hooks via TypeScript plugin)
 *
 * Idempotent: safe to run multiple times.
 * Non-destructive: merges entries, preserves RTK hooks and other unmanaged config.
 *
 * Design: For each hooks file, the script identifies entries by a unique keyword
 * in the command string (e.g. "context-mode", "herdr"). It adds missing entries
 * and leaves everything else (like RTK hooks) untouched.
 */

import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
  symlinkSync, unlinkSync, lstatSync, realpathSync, cpSync
} from 'fs'
import { join, dirname } from 'path'
import { execSync } from 'child_process'
import { homedir } from 'os'

const HOME = homedir()

// ─── Terminal colours ───────────────────────────────────────────────────────
const GREEN = '\x1b[32m', YELLOW = '\x1b[33m', RED = '\x1b[31m'
const DIM = '\x1b[2m', NC = '\x1b[0m'
const ok   = msg => console.log(`${GREEN}✅ ${msg}${NC}`)
const warn = msg => console.log(`${YELLOW}⚠️  ${msg}${NC}`)
const err  = msg => console.log(`${RED}❌ ${msg}${NC}`)
const info = msg => console.log(`${DIM}   ${msg}${NC}`)

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch { return null }
}

function writeJSON(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
}

function hasCmd(cmd) {
  try { execSync(`which ${cmd}`, { stdio: 'ignore' }); return true }
  catch { return false }
}

function safeSymlink(src, dst) {
  if (!existsSync(src)) return false
  mkdirSync(dirname(dst), { recursive: true })
  try {
    const stat = lstatSync(dst)
    if (stat.isSymbolicLink()) unlinkSync(dst)
    else return false // real file/dir exists — don't overwrite
  } catch { /* doesn't exist, safe to create */ }
  symlinkSync(src, dst)
  return true
}

/**
 * Find context-mode npm global package directory.
 * Returns the package root (e.g. /home/user/.nvm/.../context-mode) or null.
 */
function findContextModePkg() {
  try {
    const root = execSync('npm root -g', {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']
    }).trim()
    const pkg = join(root, 'context-mode')
    if (existsSync(join(pkg, 'configs'))) return pkg
  } catch { /* npm not available */ }
  return null
}

function allowAgyManagedSkillReads() {
  const skillsLink = join(HOME, '.agents', 'skills')
  if (!existsSync(skillsLink)) return

  const skillsPath = realpathSync(skillsLink)
  const settingsPath = join(HOME, '.gemini', 'antigravity-cli', 'settings.json')
  const settings = readJSON(settingsPath) || {}
  if (!settings.permissions) settings.permissions = {}
  if (!Array.isArray(settings.permissions.allow)) settings.permissions.allow = []

  const permissions = [
    `read_file(${skillsPath})`,
    'mcp(codegraph/codegraph_explore)',
  ]
  const missing = permissions.filter(
    permission => !settings.permissions.allow.includes(permission),
  )
  if (missing.length > 0) {
    settings.permissions.allow.push(...missing)
    writeJSON(settingsPath, settings)
    ok('AGY      permissions (managed skills + Codegraph explore)')
  }
}

function normalizeAgyContextRule(pluginDst) {
  const rulePath = join(pluginDst, 'rules', 'context-mode.md')
  if (!existsSync(rulePath)) return

  const rule = readFileSync(rulePath, 'utf8')
  if (!rule.startsWith('---\n')) {
    writeFileSync(
      rulePath,
      '---\nname: context-mode\ndescription: Context-mode routing for Antigravity CLI.\n---\n\n' + rule,
      'utf8',
    )
  }

  // Previous setup versions created this external symlink without frontmatter.
  // Remove only that symlink; never delete a user-authored regular rule file.
  const legacyRulePath = join(HOME, '.gemini', 'config', 'rules', 'context-mode.md')
  try {
    if (lstatSync(legacyRulePath).isSymbolicLink()) {
      unlinkSync(legacyRulePath)
      info('AGY      legacy context-mode rule symlink removed')
    }
  } catch { /* no legacy rule */ }
}

// ─── Hook merge helpers ─────────────────────────────────────────────────────

/**
 * Ensure a hook entry exists in a Cursor-style hooks object.
 * Format: hooks[event] = [{ command, matcher? }]
 * Matches by checking if `identifier` appears in the command string.
 */
function ensureCursorHook(hooks, event, entry, identifier) {
  if (!hooks[event]) hooks[event] = []
  const exists = hooks[event].some(h =>
    (h.command || '').includes(identifier)
  )
  if (!exists) { hooks[event].push(entry); return true }
  return false
}

/**
 * Ensure a hook entry exists in a Codex-style hooks object.
 * Format: hooks[Event] = [{ hooks: [{ type, command, timeout? }], matcher? }]
 * Same structure as AGY but with different event names and optional fields.
 */
function ensureCodexHook(hooks, event, entry, identifier) {
  if (!hooks[event]) hooks[event] = []
  const exists = hooks[event].some(group =>
    (group.hooks || []).some(h => (h.command || '').includes(identifier))
  )
  if (!exists) { hooks[event].push(entry); return true }
  return false
}

// ─── 1. Cursor CLI ──────────────────────────────────────────────────────────

function syncCursor(ctxPkgDir) {
  let hooksChanged = false

  // ── 1a. hooks.json: context-mode + herdr ──
  const hooksPath = join(HOME, '.cursor', 'hooks.json')
  const config = readJSON(hooksPath) || { version: 1, hooks: {} }
  if (!config.hooks) config.hooks = {}
  const hooks = config.hooks

  // Herdr sessionStart
  const herdrScript = join(HOME, '.cursor', 'herdr-agent-state.sh')
  if (existsSync(herdrScript)) {
    hooksChanged |= ensureCursorHook(hooks, 'sessionStart', {
      command: `bash '${herdrScript}' session`
    }, 'herdr')
  }

  // Context-mode hooks (preToolUse, postToolUse, stop)
  if (hasCmd('context-mode')) {
    hooksChanged |= ensureCursorHook(hooks, 'preToolUse', {
      command: 'context-mode hook cursor pretooluse',
      matcher: 'Shell|Read|Grep|WebFetch|mcp_web_fetch|mcp_fetch_tool|Task|MCP:ctx_execute|MCP:ctx_execute_file|MCP:ctx_batch_execute|MCP:(?!ctx_)'
    }, 'context-mode')

    hooksChanged |= ensureCursorHook(hooks, 'postToolUse', {
      command: 'context-mode hook cursor posttooluse'
    }, 'context-mode')

    hooksChanged |= ensureCursorHook(hooks, 'stop', {
      command: 'context-mode hook cursor stop'
    }, 'context-mode')
  }

  if (hooksChanged) writeJSON(hooksPath, config)
  ok(`Cursor   hooks.json ${hooksChanged ? '(updated)' : '(up to date)'}`)

  // ── 1b. mcp.json: ensure context-mode MCP server ──
  // Note: sync-mcp.mjs overwrites mcp.json with shared servers,
  // so this runs AFTER sync-mcp.mjs to add context-mode back.
  if (hasCmd('context-mode')) {
    const mcpPath = join(HOME, '.cursor', 'mcp.json')
    const mcpConfig = readJSON(mcpPath) || { mcpServers: {} }
    if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {}

    if (!mcpConfig.mcpServers['context-mode']) {
      mcpConfig.mcpServers['context-mode'] = { command: 'context-mode' }
      writeJSON(mcpPath, mcpConfig)
      ok('Cursor   mcp.json (added context-mode MCP)')
    } else {
      info('Cursor   mcp.json context-mode MCP already present')
    }
  }

  // ── 1c. Cursor Agent CLI: allow read-only Codegraph exploration ──
  // Cursor's global approval mode can otherwise reject MCP calls even when the
  // server itself is enabled. Keep this grant to the single read-only tool.
  const cliConfigPath = join(HOME, '.cursor', 'cli-config.json')
  const cliConfig = readJSON(cliConfigPath) || {}
  if (!cliConfig.permissions) cliConfig.permissions = {}
  if (!Array.isArray(cliConfig.permissions.allow)) cliConfig.permissions.allow = []
  if (!cliConfig.permissions.allow.includes('Mcp(codegraph:codegraph_explore)')) {
    cliConfig.permissions.allow.push('Mcp(codegraph:codegraph_explore)')
    writeJSON(cliConfigPath, cliConfig)
    ok('Cursor   CLI permission (allowed Codegraph explore)')
  } else {
    info('Cursor   CLI permission for Codegraph explore already present')
  }

  // ── 1d. Rules: context-mode.mdc routing rules ──
  if (ctxPkgDir) {
    const src = join(ctxPkgDir, 'configs', 'cursor', 'context-mode.mdc')
    const dst = join(HOME, '.cursor', 'rules', 'context-mode.mdc')
    if (safeSymlink(src, dst)) {
      ok('Cursor   context-mode.mdc rule → symlinked')
    } else {
      info('Cursor   context-mode.mdc rule already exists')
    }
  }
}

// ─── 2. AGY CLI (Antigravity) ───────────────────────────────────────────────

function syncAgy(ctxPkgDir) {
  if (!hasCmd('context-mode') || !ctxPkgDir) {
    info('AGY      context-mode package not available — skipping')
    return
  }

  // AGY loads hooks, MCP servers, rules, and skills from a plugin in its
  // customization directory. Copy instead of symlinking so AGY treats the
  // skill files as local plugin content and does not request access to npm's
  // global installation directory in headless sessions.
  const pluginSrc = join(ctxPkgDir, 'configs', 'antigravity-cli')
  const pluginDst = join(HOME, '.gemini', 'config', 'plugins', 'context-mode')
  if (!existsSync(join(pluginSrc, 'plugin.json'))) {
    warn(`AGY      context-mode plugin is incomplete: ${pluginSrc}`)
    return
  }

  cpSync(pluginSrc, pluginDst, { recursive: true, force: true })
  normalizeAgyContextRule(pluginDst)
  allowAgyManagedSkillReads()
  ok('AGY      context-mode plugin installed')
}

// ─── 3. Codex CLI ───────────────────────────────────────────────────────────

function syncCodex() {
  const hooksPath = join(HOME, '.codex', 'hooks.json')
  const config = readJSON(hooksPath) || { hooks: {} }
  if (!config.hooks) config.hooks = {}
  const hooks = config.hooks
  let changed = false

  // Herdr SessionStart (Codex format: nested hooks array with type+command)
  const herdrScript = join(HOME, '.codex', 'herdr-agent-state.sh')
  if (existsSync(herdrScript)) {
    changed |= ensureCodexHook(hooks, 'SessionStart', {
      hooks: [{
        command: `bash '${herdrScript}' session`,
        timeout: 10,
        type: 'command'
      }]
    }, 'herdr')
  }

  // Context-mode: handled by Codex marketplace plugin (auto-manages its own hooks).
  // DO NOT add context-mode hooks here — they are registered through
  // .codex-plugin/hooks.json inside the plugin cache, not the global hooks.json.
  // See: codex plugin marketplace add mksglu/context-mode

  // RTK: handled by rtk init -g --codex (creates RTK.md), no hooks needed.

  if (changed) writeJSON(hooksPath, config)

  // Status message
  const hasHerdr = existsSync(herdrScript)
  if (hasHerdr) {
    ok(`Codex    hooks.json ${changed ? '(updated)' : '(up to date)'} — herdr active`)
  } else {
    ok(`Codex    hooks.json ${changed ? '(updated)' : '(up to date)'}`)
    warn('Codex    herdr-agent-state.sh not found — run "herdr setup codex" to activate')
  }
}

// ─── 4. OpenCode CLI ────────────────────────────────────────────────────────

function syncOpenCode() {
  const configPath = join(HOME, '.config', 'opencode', 'opencode.json')
  if (!existsSync(configPath)) {
    info('OpenCode opencode.json not found — skipping')
    return
  }

  let config
  try {
    const raw = readFileSync(configPath, 'utf8')
    // Handle trailing commas and control characters (same as sync-mcp.mjs)
    const cleaned = raw
      .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/,(\s*[}\]])/g, '$1')
    config = JSON.parse(cleaned)
  } catch (e) {
    err(`OpenCode: could not parse opencode.json: ${e.message}`)
    return
  }

  let changed = false
  if (!config.plugin) config.plugin = []

  // Ensure "context-mode" is in the plugin array.
  // OpenCode manages context-mode hooks internally through its TypeScript plugin
  // system (tool.execute.before, tool.execute.after, etc.).
  // WARNING: Do NOT add context-mode to the "mcp" section — OpenCode will fail
  // to register ctx_* tools if context-mode exists in both plugin AND mcp.
  if (!config.plugin.includes('context-mode')) {
    config.plugin.push('context-mode')
    changed = true
  }

  if (changed) writeJSON(configPath, config)
  ok(`OpenCode plugin array ${changed ? '(added context-mode)' : '(up to date)'}`)
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log('\n🔗 Syncing hooks (context-mode + herdr)...\n')

const HAS_CTX = hasCmd('context-mode')
const ctxPkgDir = findContextModePkg()

if (!HAS_CTX) {
  warn('context-mode not installed — context-mode hooks will be skipped')
  info('Install: npm install -g context-mode')
} else if (ctxPkgDir) {
  info(`context-mode package: ${ctxPkgDir}`)
} else {
  warn('context-mode binary found but npm package dir not located')
  info('Rules/skills symlinks will be skipped; hooks will still be configured')
}

if (!process.env.SKIP_CURSOR) { try { syncCursor(ctxPkgDir) }  catch (e) { err(`Cursor: ${e.message}`) } } else { info('Cursor   hooks → skipped') }
if (!process.env.SKIP_AGY) { try { syncAgy(ctxPkgDir) }     catch (e) { err(`AGY: ${e.message}`) } } else { info('AGY      hooks → skipped') }
if (!process.env.SKIP_CODEX) { try { syncCodex() }            catch (e) { err(`Codex: ${e.message}`) } } else { info('Codex    hooks → skipped') }
if (!process.env.SKIP_OPENCODE) { try { syncOpenCode() }         catch (e) { err(`OpenCode: ${e.message}`) } } else { info('OpenCode hooks → skipped') }

console.log('\n✨ Hooks sync complete.\n')
