#!/usr/bin/env node
/**
 * sync-mcp.mjs — Convert ~/.agents/mcp/servers.json to all 4 tool formats.
 *
 * Formats:
 *   AGY CLI  → ~/.gemini/config/mcp_config.json   (JSON, mcpServers + $typeName + absolute paths)
 *   Cursor   → ~/.cursor/mcp.json                  (JSON, mcpServers, simple)
 *   OpenCode → ~/.config/opencode/opencode.json    (JSON, mcp key, merged — preserves other keys)
 *   Codex    → ~/.codex/global-mcp.toml            (TOML, [mcp_servers.<name>])
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const HOME = homedir()
const AGENTS_DIR = join(HOME, '.agents')
const SECRETS_FILE = join(AGENTS_DIR, 'secrets.env')
const SERVERS_FILE = join(AGENTS_DIR, 'mcp/servers.json')

// ─── Colours ────────────────────────────────────────────────────────────────
const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED    = '\x1b[31m'
const DIM    = '\x1b[2m'
const RESET  = '\x1b[0m'
const ok   = msg => console.log(`${GREEN}✅ ${msg}${RESET}`)
const warn = msg => console.log(`${YELLOW}⚠️  ${msg}${RESET}`)
const err  = msg => console.log(`${RED}❌ ${msg}${RESET}`)
const info = msg => console.log(`${DIM}   ${msg}${RESET}`)

// ─── Load secrets ────────────────────────────────────────────────────────────
const secrets = {}
if (existsSync(SECRETS_FILE)) {
  readFileSync(SECRETS_FILE, 'utf8').split('\n').forEach(line => {
    line = line.trim()
    if (!line || line.startsWith('#')) return
    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) return
    const key = line.slice(0, eqIdx).trim()
    const val = line.slice(eqIdx + 1).trim()
    secrets[key] = val
  })
} else {
  warn('secrets.env not found — ${VAR} placeholders will NOT be replaced')
  info(`Run: cp ${AGENTS_DIR}/secrets.env.example ${SECRETS_FILE}`)
}

function interpolate(value) {
  if (typeof value !== 'string') return value
  return value.replace(/\$\{([^}]+)\}/g, (_, key) => {
    if (secrets[key] !== undefined) return secrets[key]
    if (process.env[key] !== undefined) return process.env[key]
    warn(`Secret not found: ${key}`)
    return `\${${key}}`
  })
}

// ─── Read master config ──────────────────────────────────────────────────────
if (!existsSync(SERVERS_FILE)) {
  err(`servers.json not found: ${SERVERS_FILE}`)
  process.exit(1)
}

let servers = {}
try {
  const parsed = JSON.parse(readFileSync(SERVERS_FILE, 'utf8'))
  if (!parsed || typeof parsed !== 'object' || !parsed.servers || typeof parsed.servers !== 'object') {
    err(`servers.json is invalid: Must contain a top-level "servers" object.`)
    process.exit(1)
  }
  servers = parsed.servers

  // Basic structural validation for each server
  for (const [name, config] of Object.entries(servers)) {
    if (!config.url && (!config.command || !Array.isArray(config.command))) {
      err(`servers.json is invalid: Server '${name}' must have either a 'url' string or a 'command' array.`)
      process.exit(1)
    }
  }
} catch (e) {
  err(`Failed to parse servers.json: ${e.message}`)
  process.exit(1)
}

// ─── Resolve binary absolute path ────────────────────────────────────────────
function resolveBin(cmd) {
  try {
    return execSync(`which ${cmd}`, { encoding: 'utf8', stdio: 'pipe' }).trim()
  } catch {
    return null // not found
  }
}

function checkRequires(serverName, requires = []) {
  const missing = requires.filter(bin => !resolveBin(bin))
  if (missing.length > 0) {
    warn(`MCP '${serverName}' requires: ${missing.join(', ')} — not found in PATH`)
    info(`Config will still be written; install the binary to activate this MCP.`)
  }
  return missing.length === 0
}

// ─── 1. AGY CLI format ───────────────────────────────────────────────────────
// Requires: $typeName field, absolute command path, PATH env variable
function buildAgy() {
  const mcpServers = {}
  for (const [name, server] of Object.entries(servers)) {
    if (server.url) {
      mcpServers[name] = {
        url: interpolate(server.url),
        ...(server.headers ? {
          headers: Object.fromEntries(
            Object.entries(server.headers).map(([k, v]) => [k, interpolate(v)])
          )
        } : {})
      }
      continue
    }
    checkRequires(name, server.requires)
    const [cmd, ...args] = server.command
    const resolvedCmd = resolveBin(cmd) ?? cmd
    const binDir = resolvedCmd.includes('/') ? dirname(resolvedCmd) : null

    const env = {}
    // Inject PATH so nvm-managed node/npx is resolvable inside the tool
    if (binDir) {
      env.PATH = `${binDir}:/usr/local/bin:/usr/bin:/bin`
    }
    if (server.env) {
      for (const [k, v] of Object.entries(server.env)) {
        env[k] = interpolate(v)
      }
    }

    mcpServers[name] = {
      '$typeName': 'exa.cascade_plugins_pb.CascadePluginCommandTemplate',
      command: resolvedCmd,
      args: args.map(a => interpolate(a)),
      ...(Object.keys(env).length > 0 ? { env } : {})
    }
  }
  return { mcpServers }
}

// ─── 2. Cursor format ────────────────────────────────────────────────────────
// Simple JSON: command (string) + args (array) + env (object)
function buildCursor() {
  const mcpServers = {}
  for (const [name, server] of Object.entries(servers)) {
    if (server.url) {
      mcpServers[name] = {
        url: interpolate(server.url),
        ...(server.headers ? {
          headers: Object.fromEntries(
            Object.entries(server.headers).map(([k, v]) => [k, interpolate(v)])
          )
        } : {})
      }
      continue
    }
    const [cmd, ...args] = server.command
    const entry = { command: cmd, args: args.map(a => interpolate(a)) }
    if (server.env && Object.keys(server.env).length > 0) {
      entry.env = Object.fromEntries(
        Object.entries(server.env).map(([k, v]) => [k, interpolate(v)])
      )
    }
    mcpServers[name] = entry
  }
  return { mcpServers }
}

// ─── 3. OpenCode format (MERGE) ──────────────────────────────────────────────
// Uses "mcp" key (not "mcpServers"), command is an array, env key is "environment"
// IMPORTANT: Only updates the "mcp" key; preserves everything else (provider, plugin, etc.)
function buildOpenCode() {
  const opencodeFile = join(HOME, '.config/opencode/opencode.json')
  let existing = {}
  if (existsSync(opencodeFile)) {
    try {
      const raw = readFileSync(opencodeFile, 'utf8')
      // Backup before any modification
      writeFileSync(opencodeFile + '.bak', raw, 'utf8')
      // Handle trailing commas + embedded control characters only
      // NOTE: Do NOT strip // "comments" — would corrupt https:// URLs in strings!
      const cleaned = raw
        .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '') // strip real ctrl chars (not \n \r)
        .replace(/,(\s*[}\]])/g, '$1')                  // remove trailing commas
      existing = JSON.parse(cleaned)
    } catch (e) {
      warn(`Could not parse existing opencode.json: ${e.message}`)
      warn('MCP section will be written but other settings may be lost — backup is at .bak')
    }
  }

  const mcp = {}
  for (const [name, server] of Object.entries(servers)) {
    if (server.url) {
      mcp[name] = {
        type: 'remote',
        url: interpolate(server.url),
        ...(server.headers ? {
          headers: Object.fromEntries(
            Object.entries(server.headers).map(([k, v]) => [k, interpolate(v)])
          )
        } : {}),
        enabled: true
      }
      continue
    }
    const entry = {
      type: 'local',
      command: server.command.map(p => interpolate(p)),
      enabled: true
    }
    if (server.env && Object.keys(server.env).length > 0) {
      entry.environment = Object.fromEntries(
        Object.entries(server.env).map(([k, v]) => [k, interpolate(v)])
      )
    }
    mcp[name] = entry
  }

  // Update plugin path for rtk.ts to use current HOME
  const pluginRtkPath = join(HOME, '.config/opencode/plugins/rtk.ts')
  let plugins = existing.plugin ?? []
  plugins = plugins.map(p =>
    typeof p === 'string' && p.includes('plugins/rtk.ts') ? pluginRtkPath : p
  )
  if (!plugins.some(p => typeof p === 'string' && p.includes('plugins/rtk.ts'))) {
    plugins = [pluginRtkPath, ...plugins]
  }

  // Add MCP permissions for any new servers
  const permission = { ...(existing.permission ?? {}) }
  for (const name of Object.keys(servers)) {
    if (name === 'codegraph') {
      permission[`mcp__codegraph__codegraph_explore`] = 'allow'
    } else if (name.startsWith('mysql')) {
      const sanitized = name.replace(/-/g, '_')
      permission[`mcp__${sanitized}__execute_sql`] = 'allow'
    }
  }

  return { ...existing, plugin: plugins, mcp, permission }
}

// ─── 4. Codex — use `codex mcp add` (writes correctly to config.toml) ────────
// global-mcp.toml is NOT read by Codex; config.toml is the correct file.
// The `codex mcp add` CLI handles all TOML merging safely.
async function syncCodex() {
  const { execFileSync } = await import('node:child_process')
  const run = (args, opts = {}) =>
    execFileSync('codex', args, {
      encoding: 'utf8',
      stdio: 'pipe',
      ...opts,
      env: { ...process.env, ...secrets, ...opts.env }
    })

  // Get existing MCP names from codex cli
  let existingNames = []
  try {
    const listOut = run(['mcp', 'list'])
    existingNames = listOut.split('\n')
      .slice(1) // skip header
      .map(l => l.split(/\s+/)[0])
      .filter(n => n && n !== 'context-mode') // never remove context-mode plugin
  } catch { /* ignore */ }

  // Remove all existing managed servers so we can fully sync from servers.json
  for (const name of existingNames) {
    try { run(['mcp', 'remove', name]); info(`Codex: removed old ${name}`) }
    catch { /* ignore */ }
  }

  // Add each server fresh
  for (const [name, server] of Object.entries(servers)) {
    if (server.url) {
      const cliArgs = ['mcp', 'add', name, '--url', interpolate(server.url)]
      if (server.headers && server.headers.Authorization) {
        const match = server.headers.Authorization.match(/\$\{([^}]+)\}/)
        if (match) {
          cliArgs.push('--bearer-token-env-var', match[1])
        }
      }
      try {
        run(cliArgs)
        ok(`Codex    (mcp add ${name} → ${server.url})`)
      } catch (e) {
        err(`Codex add ${name}: ${e.message.slice(0, 80)}`)
      }
      continue
    }
    const [cmd, ...args] = server.command
    // Resolve absolute path — Codex runs sandboxed and may not have ~/.local/bin in PATH
    const resolvedCmd = resolveBin(cmd) ?? cmd
    const cliArgs = ['mcp', 'add', name]
    if (server.env) {
      for (const [k, v] of Object.entries(server.env)) {
        cliArgs.push('--env', `${k}=${interpolate(v)}`)
      }
    }
    cliArgs.push('--')
    cliArgs.push(resolvedCmd, ...args.map(a => interpolate(a)))
    try {
      run(cliArgs)
      ok(`Codex    (mcp add ${name} → ${resolvedCmd})`)
    } catch (e) {
      err(`Codex add ${name}: ${e.message.slice(0, 80)}`)
    }
  }
}


// ─── Write helpers ────────────────────────────────────────────────────────────
function backupIfNeeded(file) {
  if (existsSync(file)) {
    try {
      const raw = readFileSync(file, 'utf8')
      writeFileSync(file + '.bak', raw, 'utf8')
    } catch (e) {
      warn(`Failed to backup ${file}: ${e.message}`)
    }
  }
}

function writeJson(file, data, label) {
  mkdirSync(dirname(file), { recursive: true })
  backupIfNeeded(file)
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
  ok(`${label} → ${file} (backed up to .bak)`)
}

function writeText(file, data, label) {
  mkdirSync(dirname(file), { recursive: true })
  backupIfNeeded(file)
  writeFileSync(file, data, 'utf8')
  ok(`${label} → ${file} (backed up to .bak)`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
;(async () => {
  console.log('\n🔌 Syncing MCP configs from servers.json...\n')

  const agyFile      = join(HOME, '.gemini/config/mcp_config.json')
  const cursorFile   = join(HOME, '.cursor/mcp.json')
  const opencodeFile = join(HOME, '.config/opencode/opencode.json')

  try { writeJson(agyFile,      buildAgy(),      'AGY CLI  ') } catch(e) { err(`AGY: ${e.message}`) }
  try { writeJson(cursorFile,   buildCursor(),   'Cursor   ') } catch(e) { err(`Cursor: ${e.message}`) }
  try { writeJson(opencodeFile, buildOpenCode(), 'OpenCode ') } catch(e) { err(`OpenCode: ${e.message}`) }
  try { await syncCodex() }                                    catch(e) { err(`Codex: ${e.message}`) }

  console.log('\n✨ MCP sync complete.\n')
})()

