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
 *   3. Codex:    merge native hooks and register the installed context-mode MCP
 *   4. OpenCode: native context-mode MCP and V2 RTK plugin discovery
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
  symlinkSync, unlinkSync, lstatSync, realpathSync, cpSync, chmodSync, renameSync, mkdtempSync, rmSync
} from 'fs'
import { join, dirname } from 'path'
import { execSync, execFileSync } from 'child_process'
import { homedir } from 'os'
import { createHash } from 'node:crypto'

import { backupFile, codexHome, openCodeConfigPath, readConfig } from './config-utils.mjs'

const HOME = homedir()

// ─── Terminal colours ───────────────────────────────────────────────────────
const GREEN = '\x1b[32m', YELLOW = '\x1b[33m', RED = '\x1b[31m'
const DIM = '\x1b[2m', NC = '\x1b[0m'
const ok   = msg => console.log(`${GREEN}✅ ${msg}${NC}`)
const warn = msg => console.log(`${YELLOW}⚠️  ${msg}${NC}`)
const err  = msg => { process.exitCode = 1; console.error(`${RED}❌ ${msg}${NC}`) }
const info = msg => console.log(`${DIM}   ${msg}${NC}`)

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJSON(path) {
  return readConfig(path)
}

function backupIfNeeded(path) {
  backupFile(path)
}

function writeJSON(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  backupIfNeeded(path)
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
  chmodSync(path, 0o600)
}

function hasCmd(cmd) {
  try { execSync(`which ${cmd}`, { stdio: 'ignore' }); return true }
  catch { return false }
}

function shellQuote(value) {
  return "'" + value.replaceAll("'", "'\\''") + "'"
}

function resolveRtkBinary() {
  const preferred = join(HOME, '.local', 'bin', 'rtk')
  const binary = existsSync(preferred) ? preferred : execFileSync('which', ['rtk'], { encoding: 'utf8' }).trim()
  const version = execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim()
  if (!/^rtk \d+\.\d+\.\d+/.test(version)) throw new Error(`Not Rust Token Killer: ${binary}`)
  return binary
}

function repairRtkNodeCollision() {
  if (!hasCmd('rtk')) return
  const canonical = resolveRtkBinary()
  const entry = join(dirname(process.execPath), 'rtk')
  if (!entry.startsWith(HOME + '/') || !existsSync(entry) || entry === canonical) return
  const target = realpathSync(entry)
  if (target !== realpathSync(canonical)) {
    const version = execFileSync(entry, ['--version'], { encoding: 'utf8' }).trim()
    if (!/^rtk \d+\.\d+\.\d+/.test(version)) {
      const pkg = join(dirname(dirname(target)), 'package.json')
      if (!target.endsWith('/node_modules/rtk/bin/rtk.js') || !existsSync(pkg) ||
          !/release tool/i.test(readJSON(pkg).description || '')) return
      const backup = entry + '.release-tool-backup'
      if (existsSync(backup)) throw new Error(`RTK collision backup already exists: ${backup}`)
      renameSync(entry, backup)
    } else if (readFileSync(entry).equals(readFileSync(canonical))) return
  }
  // AGY's terminal sandbox cannot follow an external ~/.local/bin symlink.
  // Keep an actual, verified binary in its existing Node bin directory.
  const staged = entry + `.sync-${process.pid}`
  cpSync(canonical, staged); chmodSync(staged, 0o755); renameSync(staged, entry)
  ok('RTK      Node bin uses Rust Token Killer; release tool entry retained as backup')
}

function trustCodexRtk(codexDir) {
  const file = join(codexDir, 'hooks.json')
  const hooks = readJSON(file).hooks || {}
  const nativeCommand = `${shellQuote(resolveRtkBinary())} hook codex`
  const configFile = join(codexDir, 'config.toml')
  let text = existsSync(configFile) ? readFileSync(configFile, 'utf8') : ''
  const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])])) : value
  for (const [gi, group] of (hooks.PreToolUse || []).entries()) {
    for (const [hi, hook] of (group.hooks || []).entries()) {
      if (hook.command !== nativeCommand) continue
      const identity = { event_name: 'pre_tool_use', hooks: [{ ...hook, async: false }] }
      if (group.matcher !== undefined) identity.matcher = group.matcher
      const hash = 'sha256:' + createHash('sha256').update(JSON.stringify(sort(identity))).digest('hex')
      const header = `[hooks.state.${JSON.stringify(`${realpathSync(file)}:pre_tool_use:${gi}:${hi}`)}]`
      const start = text.indexOf(header)
      const next = start < 0 ? -1 : text.indexOf('\n[', start + header.length)
      const end = next < 0 ? text.length : next
      const section = start < 0 ? header : text.slice(start, end).split('\n')
        .filter(line => !/^\s*(trusted_hash|trusted_content_hash|enabled)\s*=/.test(line)).join('\n').trimEnd()
      const replacement = `${section}\nenabled = true\ntrusted_hash = ${JSON.stringify(hash)}\n`
      text = start < 0 ? text.trimEnd() + '\n\n' + replacement : text.slice(0, start) + replacement + text.slice(end)
    }
  }
  backupIfNeeded(configFile)
  writeFileSync(configFile, text, { mode: 0o600 }); chmodSync(configFile, 0o600)
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
    if (existsSync(join(pkg, 'configs')) || existsSync(join(pkg, 'package.json'))) return pkg
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
      '---\nname: context-mode\ndescription: Context-mode routing for Antigravity CLI.\ntrigger: always_on\n---\n\n' + rule,
      'utf8',
    )
  }

  // Repair earlier managed copies that already have frontmatter but no trigger.
  const currentRule = readFileSync(rulePath, 'utf8')
  const frontmatter = currentRule.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (frontmatter && !/^trigger\s*:/m.test(frontmatter[1])) {
    writeFileSync(rulePath, currentRule.replace(frontmatter[0],
      `---\n${frontmatter[1]}\ntrigger: always_on\n---`), 'utf8')
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

function normalizeAgyContextHooks(pluginDst) {
  const hookPath = join(pluginDst, 'hooks.json')
  const config = readJSON(hookPath)
  for (const definition of Object.values(config)) {
    for (const event of ['SessionStart', 'PreInvocation', 'PostInvocation', 'Stop']) {
      if (!Array.isArray(definition[event])) continue
      definition[event] = definition[event].flatMap(entry => entry.hooks ?? [entry])
    }
  }
  writeJSON(hookPath, config)
  // This compatibility duplicate is ignored by AGY and fails strict validation.
  const duplicate = join(pluginDst, 'hooks', 'hooks.json')
  if (existsSync(duplicate)) unlinkSync(duplicate)
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
function ensureCodexHook(hooks, event, entry, identifier, replaceExisting = false) {
  if (!hooks[event]) hooks[event] = []
  const exists = hooks[event].some(group =>
    (group.hooks || []).some(h => (h.command || '').includes(identifier))
  )
  if (!exists) { hooks[event].push(entry); return true }
  if (!replaceExisting) return false

  // Refresh only the managed hook; retain other commands even in a shared group.
  const updated = hooks[event].flatMap(group => {
    const remaining = (group.hooks || []).filter(h =>
      !(h.command || '').includes(identifier))
    if (remaining.length === (group.hooks || []).length) return [group]
    return remaining.length ? [{ ...group, hooks: remaining }] : []
  })
  updated.push(entry)
  if (JSON.stringify(updated) === JSON.stringify(hooks[event])) return false
  hooks[event] = updated
  return true
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

  // RTK hook (preToolUse)
  if (hasCmd('rtk')) {
    hooksChanged |= ensureCursorHook(hooks, 'preToolUse', {
      command: 'rtk hook cursor',
      matcher: 'Shell'
    }, 'rtk hook cursor')
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
  // ── 2a. RTK Plugin for AGY ──
  if (hasCmd('rtk')) {
    const rtkPluginSrc = join(dirname(new URL(import.meta.url).pathname), '..', 'plugins', 'antigravity', 'rtk')
    if (existsSync(join(rtkPluginSrc, 'plugin.json'))) {
      const rtkDstGlobal = join(HOME, '.gemini', 'config', 'plugins', 'rtk')
      const rtkDstCli    = join(HOME, '.gemini', 'antigravity-cli', 'plugins', 'rtk')
      const rtkDstIde    = join(HOME, '.gemini', 'antigravity-ide', 'plugins', 'rtk')

      cpSync(rtkPluginSrc, rtkDstGlobal, { recursive: true, force: true })
      cpSync(rtkPluginSrc, rtkDstCli,    { recursive: true, force: true })
      cpSync(rtkPluginSrc, rtkDstIde,    { recursive: true, force: true })
      for (const dst of [rtkDstGlobal, rtkDstCli, rtkDstIde]) {
        const file = join(dst, 'hooks.json')
        const hooks = readJSON(file)
        for (const group of hooks['rtk-rewrite']?.PreToolUse || []) {
          for (const hook of group.hooks || []) hook.command = `${shellQuote(resolveRtkBinary())} hook antigravity`
        }
        writeJSON(file, hooks)
      }
      ok('AGY      RTK plugin installed (Global, CLI, IDE)')
    }
  }

  if (!hasCmd('context-mode') || !ctxPkgDir) {
    info('AGY      context-mode package not available — skipping')
    return
  }

  // AGY's legacy adapter is pinned separately from the global v2 installation.
  const agyRoot = join(HOME, '.local/share/sync-cli-tool/context-mode-agy/node_modules')
  const agyPkg = join(agyRoot, 'context-mode')
  const agyBin = join(agyRoot, '.bin/context-mode')
  const agySrc = join(agyPkg, 'configs/antigravity-cli')
  if (existsSync(agyBin) && existsSync(join(agySrc, 'plugin.json')) &&
      readJSON(join(agyPkg, 'package.json')).version === '1.0.169') {
    for (const base of ['config', 'antigravity-cli']) {
    const dst = join(HOME, '.gemini', base, 'plugins/context-mode')
    cpSync(agySrc, dst, { recursive: true, force: true })
    normalizeAgyContextRule(dst)
    normalizeAgyContextHooks(dst)
    const hookFile = join(dst, 'hooks.json')
    const hooks = readJSON(hookFile)
    for (const groups of Object.values(hooks.hooks || {})) {
      for (const group of groups) for (const hook of (group.hooks || [group])) {
        if (hook.command?.startsWith('context-mode ')) hook.command = `CONTEXT_MODE_DIR=${shellQuote(join(HOME, '.local/state/sync-cli-tool/context-mode-agy-data'))} ` + shellQuote(agyBin) + hook.command.slice('context-mode'.length)
      }
    }
    writeJSON(hookFile, hooks)
    const entry = { command: agyBin, args: [], env: { CONTEXT_MODE_PLATFORM: 'antigravity-cli', CONTEXT_MODE_DIR: join(HOME, '.local/state/sync-cli-tool/context-mode-agy-data') } }
    writeJSON(join(dst, 'mcp_config.json'), { mcpServers: { 'context-mode': entry } })
    }
    const entry = { command: agyBin, args: [], env: { CONTEXT_MODE_PLATFORM: 'antigravity-cli', CONTEXT_MODE_DIR: join(HOME, '.local/state/sync-cli-tool/context-mode-agy-data') } }
    for (const base of ['config', 'antigravity-cli']) {
      const file = join(HOME, '.gemini', base, 'mcp_config.json')
      const config = readJSON(file) || {}
      config.mcpServers ||= {}
      config.mcpServers['context-mode'] = entry
      writeJSON(file, config)
    }
    if (hasCmd('agy')) execFileSync('agy', ['plugin', 'enable', 'context-mode'], { stdio: 'pipe' })
    ok('AGY      context-mode v1 isolated plugin and MCP configured')
    return
  }

  const ctxVersion = existsSync(join(ctxPkgDir, 'package.json')) ? readJSON(join(ctxPkgDir, 'package.json')).version : ''
  if (Number.parseInt(ctxVersion, 10) >= 2) {
    const legacy = ['config', 'antigravity-cli', 'antigravity-ide'].some(base => {
      const manifest=join(HOME,'.gemini',base,'plugins/context-mode/plugin.json')
      return existsSync(manifest) && Number.parseInt(readJSON(manifest).version,10) < 2
    })
    if (legacy) {
      if (!hasCmd('agy')) throw new Error('Disable the legacy context-mode plugin with agy before syncing v2')
      execFileSync('agy',['plugin','disable','context-mode'],{stdio:'pipe'})
      for (const base of ['config', 'antigravity-cli', 'antigravity-ide', 'antigravity']) {
        const plugin = join(HOME, '.gemini', base, 'plugins', 'context-mode')
        const manifest = join(plugin, 'plugin.json')
        if (!existsSync(manifest) || Number.parseInt(readJSON(manifest).version, 10) >= 2) continue
        const archive = join(HOME, '.local', 'state', 'sync-cli-tool', 'context-mode-v1', base)
        if (existsSync(archive)) throw new Error(`Legacy plugin archive already exists: ${archive}`)
        mkdirSync(dirname(archive), { recursive: true, mode: 0o700 })
        renameSync(plugin, archive)
      }
    }
    for (const base of ['config', 'antigravity-cli', 'antigravity-ide', 'antigravity']) {
      const file = join(HOME, '.gemini', base, 'mcp_config.json')
      const config = readJSON(file) || {}
      config.mcpServers ||= {}
      config.mcpServers['context-mode'] = { command: process.execPath, args: [join(ctxPkgDir, 'server.mjs'), '--agent', 'gemini'] }
      writeJSON(file, config)
    }
    warn('AGY      context-mode v2 uses Gemini MCP compatibility only; legacy plugin archived, no upstream AGY hooks')
    return
  }

  // AGY loads hooks, MCP servers, rules, and skills from a plugin in its
  // customization directory. Copy instead of symlinking so AGY treats the
  // skill files as local plugin content and does not request access to npm's
  // global installation directory in headless sessions.
  const pluginSrc = join(ctxPkgDir, 'configs', 'antigravity-cli')
  const pluginDstGlobal = join(HOME, '.gemini', 'config', 'plugins', 'context-mode')
  const pluginDstCli    = join(HOME, '.gemini', 'antigravity-cli', 'plugins', 'context-mode')
  const pluginDstIde    = join(HOME, '.gemini', 'antigravity-ide', 'plugins', 'context-mode')

  if (!existsSync(join(pluginSrc, 'plugin.json'))) {
    throw new Error(`AGY context-mode plugin is incomplete: ${pluginSrc}`)
  }

  // Deploy to all three possible locations for Antigravity v1 and v2.0+ decoupled paths
  cpSync(pluginSrc, pluginDstGlobal, { recursive: true, force: true })
  cpSync(pluginSrc, pluginDstCli,    { recursive: true, force: true })
  cpSync(pluginSrc, pluginDstIde,    { recursive: true, force: true })

  for (const dst of [pluginDstGlobal, pluginDstCli, pluginDstIde]) {
    normalizeAgyContextRule(dst)
    normalizeAgyContextHooks(dst)
  }

  allowAgyManagedSkillReads()

  // Copy GEMINI.md routing instructions for Antigravity IDE (no hooks support)
  const geminiMdSrc = join(ctxPkgDir, 'configs', 'antigravity', 'GEMINI.md')
  if (existsSync(geminiMdSrc)) {
    const geminiMdGlobal = join(HOME, '.gemini', 'GEMINI.md')
    const geminiMdApp    = join(HOME, '.gemini', 'antigravity', 'GEMINI.md')
    cpSync(geminiMdSrc, geminiMdGlobal, { force: true })
    cpSync(geminiMdSrc, geminiMdApp, { force: true })
    ok('AGY IDE  GEMINI.md context-mode routing instructions installed')
  }

  // Ensure context-mode MCP server is registered for Antigravity IDE (MCP-only, no hooks)
  const ideMcpTargets = [
    join(HOME, '.gemini', 'antigravity', 'mcp_config.json'),
    join(HOME, '.gemini', 'antigravity-ide', 'mcp_config.json'),
  ]
  for (const mcpFile of ideMcpTargets) {
    const mcpConfig = readJSON(mcpFile) || { mcpServers: {} }
    if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {}
    if (!mcpConfig.mcpServers['context-mode']) {
      mcpConfig.mcpServers['context-mode'] = {
        $typeName: 'exa.cascade_plugins_pb.CascadePluginCommandTemplate',
        command: 'context-mode',
        args: [],
      }
      writeJSON(mcpFile, mcpConfig)
      ok(`AGY IDE  ${mcpFile} (added context-mode MCP)`)
    }
  }

  ok('AGY      context-mode plugin installed (Global, CLI, IDE)')
}

// ─── 3. Codex CLI ───────────────────────────────────────────────────────────

// Upstream setup renders host-specific tool names into these command skills.
// Detach directory symlinks first so its writes cannot reach canonical sources.
function detachContextCommandSkills(skillsDir) {
  for (const name of ['ctx-doctor', 'ctx-stats', 'ctx-upgrade']) {
    const target = join(skillsDir, name)
    let stat
    try { stat = lstatSync(target) } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    if (!stat.isSymbolicLink()) continue
    const source = realpathSync(target)
    const staged = mkdtempSync(join(skillsDir, `.${name}-sync-`))
    try {
      cpSync(source, staged, { recursive: true, dereference: true })
      unlinkSync(target)
      renameSync(staged, target)
    } catch (error) {
      // Restore the link if replacement failed after unlinking it.
      try { lstatSync(target) } catch (missing) {
        if (missing.code === 'ENOENT') symlinkSync(source, target, 'dir')
      }
      throw error
    } finally {
      rmSync(staged, { recursive: true, force: true })
    }
  }
}

function syncCodex(ctxPkgDir) {
  const codexDir = codexHome()
  const hooksPath = join(codexDir, 'hooks.json')
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

  // Marketplace metadata alone does not install a plugin. Use the installed
  // package's native adapter, without fetching or installing any dependency.
  if (hasCmd('context-mode') && ctxPkgDir) {
    const version = readJSON(join(ctxPkgDir, 'package.json')).version || ''
    const v2 = Number.parseInt(version, 10) >= 2
    const templatePath = v2 ? join(ctxPkgDir, 'hooks', 'codex.json') : join(ctxPkgDir, 'configs', 'codex', 'hooks.json')
    if (v2 && !existsSync(templatePath)) throw new Error('context-mode v2 Codex hook template is missing')
    if (v2) {
      for (const [event, groups] of Object.entries(hooks)) {
        const remaining = groups.flatMap(group => {
          const handlers = (group.hooks || []).filter(h => !/context-mode/.test(h.command || ''))
          return handlers.length ? [{ ...group, hooks: handlers }] : []
        })
        if (JSON.stringify(remaining) !== JSON.stringify(groups)) { hooks[event] = remaining; changed = true }
      }
    }
    if (existsSync(templatePath)) {
      const template = readJSON(templatePath)
      for (const [event, entries] of Object.entries(template.hooks || {})) {
        for (const entry of entries) {
          const resolved = v2 ? { ...entry, hooks: entry.hooks.map(h => ({ ...h,
            command: `${JSON.stringify(process.execPath)} ${JSON.stringify(join(ctxPkgDir, 'hook.mjs'))} --agent codex`
          })) } : entry
          changed |= ensureCodexHook(hooks, event, resolved, v2 ? join(ctxPkgDir, 'hook.mjs') : 'context-mode hook codex', true)
        }
      }
    }
    backupIfNeeded(join(codexDir, 'config.toml'))
    const binary = execSync('which context-mode', { encoding: 'utf8' }).trim()
    const serverArgs = Number.parseInt(version, 10) >= 2 ? ['server', '--agent', 'codex'] : []
    execFileSync('codex', ['mcp', 'add', 'context-mode', '--', binary, ...serverArgs], {
      env: { ...process.env, CODEX_HOME: codexDir }, stdio: 'pipe',
    })
    ok('Codex    context-mode native MCP and hooks registered')
  }

  // Use RTK's native processor; remove only legacy managed handlers.
  if (hasCmd('rtk')) {
    const rtkBinary = resolveRtkBinary()
    for (const [event, groups] of Object.entries(hooks)) {
      const next = groups.flatMap(group => {
        const handlers = (group.hooks || []).filter(h => !/rtk_pre_tool_use\.py|\brtk["']?\s+hook\s+codex/.test(h.command || ''))
        return handlers.length ? [{ ...group, hooks: handlers }] : []
      })
      if (JSON.stringify(next) !== JSON.stringify(groups)) { hooks[event] = next; changed = true }
    }
    changed |= ensureCodexHook(hooks, 'PreToolUse', {
      matcher: '^Bash$', hooks: [{ type: 'command', command: `${shellQuote(rtkBinary)} hook codex`, timeout: 10 }],
    }, 'hook codex', true)
    const legacy = join(codexDir, 'hooks', 'rtk_pre_tool_use.py')
    if (existsSync(legacy)) {
      backupIfNeeded(legacy)
      cpSync(join(dirname(new URL(import.meta.url).pathname), '..', 'hooks', 'codex', 'rtk_pre_tool_use.py'), legacy)
    }
  }

  if (changed) writeJSON(hooksPath, config)

  // Upstream setup also migrates v1 state, trusts current hook hashes and
  // verifies MCP + hooks. Run after our merge so later syncs stay canonical.
  if (ctxPkgDir && Number.parseInt(readJSON(join(ctxPkgDir, 'package.json')).version, 10) >= 2) {
    detachContextCommandSkills(join(codexDir, 'skills'))
    execFileSync('context-mode', ['setup', '--yes', '--agents', 'codex'], {
      env: { ...process.env, CODEX_HOME: codexDir }, stdio: 'pipe', timeout: 120_000,
    })
  }

  if (hasCmd('rtk')) trustCodexRtk(codexDir)

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
  const configPath = openCodeConfigPath()
  const config = readJSON(configPath) // Refuse malformed user config before writing anything.
  if (hasCmd('context-mode')) {
    const binary = execSync('which context-mode', { encoding: 'utf8' }).trim()
    config.mcp ||= {}
    config.mcp.servers ||= {}
    const version = ctxPkgDir && existsSync(join(ctxPkgDir, 'package.json'))
      ? readJSON(join(ctxPkgDir, 'package.json')).version : ''
    if (Number.parseInt(version, 10) >= 2 && existsSync(join(ctxPkgDir, 'server.mjs'))) {
      config.mcp.servers['context-mode'] = { type: 'local', command: [process.execPath, join(ctxPkgDir, 'server.mjs'), '--agent', 'opencode'], disabled: false }
      delete config.mcp['context-mode']
      const plugins = [...new Set([...(config.plugins || []), ...(config.plugin || [])])]
        .filter(p => typeof p !== 'string' || !/(^context-mode(?:@.*)?$|(?:^|\/)context-mode(?:\/)?$)/.test(p))
      config.plugins = [...plugins, ctxPkgDir]
      delete config.plugin
    } else {
      config.mcp.servers['context-mode'] = { type: 'local', command: [binary], enabled: true }
    }
    // Legacy context-mode plugins used a different API. Version 2 supports
    // OpenCode's plugin hooks; preserve an existing upstream installation.
    if (Number.parseInt(version, 10) < 2 || !version) for (const key of ['plugin', 'plugins']) {
      if (Array.isArray(config[key])) config[key] = config[key].filter(p => p !== 'context-mode')
    }
    writeJSON(configPath, config)
    if (Number.parseInt(version, 10) >= 2) {
      detachContextCommandSkills(join(dirname(configPath), 'skills'))
      execFileSync('context-mode', ['setup', '--yes', '--agents', 'opencode'], {
        stdio: 'pipe', timeout: 120_000,
      })
      // Upstream setup may write the v1 aliases. Normalize its final output,
      // retaining any unrelated settings it added during setup.
      const installed = readJSON(configPath)
      installed.plugins = [...new Set([...(installed.plugins || []), ...(installed.plugin || [])])]
        .filter(p => typeof p !== 'string' || !/(^context-mode(?:@.*)?$|(?:^|\/)context-mode(?:\/)?$)/.test(p))
      installed.plugins.push(ctxPkgDir)
      delete installed.plugin
      installed.mcp ||= {}
      installed.mcp.servers ||= {}
      installed.mcp.servers['context-mode'] = config.mcp.servers['context-mode']
      delete installed.mcp['context-mode']
      writeJSON(configPath, installed)
    }
    ok('OpenCode context-mode native MCP registered')
  }
  if (!hasCmd('rtk')) {
    info('OpenCode RTK skipped: rtk not found')
    return
  }
  const src = join(dirname(new URL(import.meta.url).pathname), '..', 'plugins', 'opencode', 'rtk.ts')
  const dst = join(dirname(configPath), 'plugins', 'rtk.ts')
  let stat
  try { stat = lstatSync(dst) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (stat && !stat.isSymbolicLink()) {
    if (stat.isFile() && readFileSync(dst, 'utf8') === readFileSync(src, 'utf8')) {
      ok('OpenCode RTK plugin up to date')
      return
    }
    throw new Error(`Refusing to replace an unmanaged OpenCode plugin: ${dst}`)
  }
  if (stat?.isSymbolicLink() && existsSync(dst) && realpathSync(dst) === realpathSync(src)) {
    ok('OpenCode RTK plugin up to date')
    return
  }
  if (!safeSymlink(src, dst)) throw new Error(`Could not install OpenCode RTK plugin: ${dst}`)
  ok('OpenCode RTK plugin installed through native discovery')
}

// ─── 5. Kilo CLI ────────────────────────────────────────────────────────────

function syncKilo() {
  // Similar to OpenCode, Kilo manages context-mode through other means (like skills or native plugins).
  // We just ensure we don't break its kilo.json
  ok(`Kilo     hooks up to date (managed natively)`)
}

// ─── 6. Claude Code CLI ─────────────────────────────────────────────────────

function syncClaude() {
  const claudeDir = join(HOME, '.claude')
  const settingsPath = join(claudeDir, 'settings.json')
  let settings = readJSON(settingsPath) || {}
  let changed = false

  if (!settings.hooks) settings.hooks = {}

  // 1. Ensure RTK hook in PreToolUse for Bash
  if (hasCmd('rtk')) {
    if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = []
    const hasRtk = settings.hooks.PreToolUse.some(entry =>
      entry.hooks?.some(h => typeof h.command === 'string' && h.command.includes('rtk hook claude'))
    )
    if (!hasRtk) {
      settings.hooks.PreToolUse.push({
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command: 'rtk hook claude',
          },
        ],
      })
      changed = true
    }
  }

  // 2. Ensure herdr hook in SessionStart if herdr script exists
  const claudeHerdrScript = join(HOME, '.claude', 'hooks', 'herdr-agent-state.sh')
  const localHerdrScript  = join(HOME, '.local', 'bin', 'herdr-agent-state.sh')
  const herdrScript = existsSync(claudeHerdrScript) ? claudeHerdrScript : localHerdrScript

  if (existsSync(herdrScript)) {
    if (!Array.isArray(settings.hooks.SessionStart)) settings.hooks.SessionStart = []
    const hasHerdr = settings.hooks.SessionStart.some(entry =>
      entry.hooks?.some(h => typeof h.command === 'string' && h.command.includes('herdr-agent-state.sh'))
    )
    if (!hasHerdr) {
      settings.hooks.SessionStart.push({
        matcher: '*',
        hooks: [
          {
            type: 'command',
            command: `bash '${herdrScript}' session`,
            timeout: 10,
          },
        ],
      })
      changed = true
    }
  }

  if (changed || !existsSync(settingsPath)) {
    try {
      if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true })
      writeJSON(settingsPath, settings)
    } catch (e) {
      warn(`Claude Code settings.json write failed: ${e.message}`)
    }
  }
  ok(`Claude Code settings.json ${changed ? '(updated hooks)' : '(up to date)'}`)
}

// ─── 7. Cline ───────────────────────────────────────────────────────────────

function syncCline() {
  // Cline relies on prompt instructions in AGENTS.md rather than a lifecycle hook API
  ok(`Cline    hooks up to date (managed via AGENTS.md rules)`)
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log('\n🔗 Syncing hooks (context-mode + herdr)...\n')

const HAS_CTX = hasCmd('context-mode')
const ctxPkgDir = findContextModePkg()
repairRtkNodeCollision()

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
if (!process.env.SKIP_CODEX) { try { syncCodex(ctxPkgDir) }            catch (e) { err(`Codex: ${e.message}`) } } else { info('Codex    hooks → skipped') }
if (!process.env.SKIP_OPENCODE) { try { syncOpenCode() }         catch (e) { err(`OpenCode: ${e.message}`) } } else { info('OpenCode hooks → skipped') }
if (!process.env.SKIP_KILO) { try { syncKilo() }             catch (e) { err(`Kilo: ${e.message}`) } } else { info('Kilo     hooks → skipped') }
if (!process.env.SKIP_CLAUDE) { try { syncClaude() }           catch (e) { err(`Claude Code: ${e.message}`) } } else { info('Claude Code hooks → skipped') }
if (!process.env.SKIP_CLINE) { try { syncCline() }            catch (e) { err(`Cline: ${e.message}`) } } else { info('Cline    hooks → skipped') }

if (!process.exitCode && !process.env.SKIP_OPENCODE && process.argv.includes('--reload-opencode')) {
  try {
    execFileSync('opencode', ['reload'], { stdio: 'pipe', timeout: 30_000 })
    ok('OpenCode running service configuration reloaded')
  } catch (e) { err(`OpenCode reload: ${e.message}`) }
}

console.log(process.exitCode ? '\nHooks sync failed; inspect the errors above.\n' : '\n✨ Hooks sync complete.\n')
