#!/usr/bin/env node
/**
 * ~/.agents/scripts/health-check.mjs
 * Test all MCP servers in servers.json by sending real JSON-RPC calls.
 * Usage: node ~/.agents/scripts/health-check.mjs
 */

import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = homedir()
const GREEN  = '\x1b[32m'; const YELLOW = '\x1b[33m'
const RED    = '\x1b[31m'; const DIM    = '\x1b[2m'; const RESET = '\x1b[0m'
const ok   = (m, d='') => console.log(`  ${GREEN}✅ ${m}${RESET}${d ? DIM+' '+d+RESET : ''}`)
const warn = (m, d='') => console.log(`  ${YELLOW}⚠️  ${m}${RESET}${d ? DIM+' '+d+RESET : ''}`)
const fail = (m, d='') => console.log(`  ${RED}❌ ${m}${RESET}${d ? DIM+' '+d+RESET : ''}`)

// ─── Load secrets ─────────────────────────────────────────────────────────────
const secrets = {}
const secretsFile = join(HOME, '.agents/secrets.env')
if (existsSync(secretsFile)) {
  readFileSync(secretsFile, 'utf8').split('\n').forEach(l => {
    l = l.trim(); if (!l || l.startsWith('#')) return
    const eq = l.indexOf('='); if (eq < 0) return
    secrets[l.slice(0, eq).trim()] = l.slice(eq + 1).trim()
  })
}
const interp = v => v.replace(/\$\{([^}]+)\}/g, (_, k) => secrets[k] ?? process.env[k] ?? '')

// ─── Load servers ─────────────────────────────────────────────────────────────
const { servers } = JSON.parse(readFileSync(join(HOME, '.agents/mcp/servers.json'), 'utf8'))

// ─── MCP test helper ──────────────────────────────────────────────────────────
function resolveBin(cmd) {
  try { return execFileSync('which', [cmd], { encoding: 'utf8', stdio: 'pipe' }).trim() }
  catch { return null }
}

function testMCP(name, server) {
  return new Promise(resolve => {
    const [cmd, ...rawArgs] = server.command
    const bin = resolveBin(cmd) ?? cmd
    const args = rawArgs.map(a => interp(a))
    const env  = { ...process.env }
    if (server.env) Object.entries(server.env).forEach(([k, v]) => { env[k] = interp(v) })

    const proc = spawn(bin, args, { env, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = '', done = false

    const finish = result => {
      if (done) return; done = true
      proc.kill('SIGTERM')
      resolve(result)
    }

    const timeout = setTimeout(() => finish({ ok: false, error: 'timeout — server did not respond in 8s' }), 8000)

    proc.stdout.on('data', d => {
      out += d.toString()
      const lines = out.split('\n')
      out = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          // initialize response
          if (msg.result?.serverInfo) {
            clearTimeout(timeout)
            finish({
              ok: true,
              serverName: msg.result.serverInfo.name,
              version: msg.result.serverInfo.version,
              tools: null,
            })
            return
          }
          // tools/list response
          if (msg.result?.tools) {
            clearTimeout(timeout)
            finish({
              ok: true,
              serverName: name,
              version: '?',
              tools: msg.result.tools.map(t => t.name),
            })
            return
          }
          // error response
          if (msg.error) {
            clearTimeout(timeout)
            finish({ ok: false, error: msg.error.message })
            return
          }
        } catch { /* not complete JSON yet */ }
      }
    })

    proc.stderr.on('data', () => {})
    proc.on('error', e => { clearTimeout(timeout); finish({ ok: false, error: e.message }) })

    // Send initialize then tools/list
    const init = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'health-check', version: '1.0' } }
    })
    proc.stdin.write(init + '\n')
  })
}

// ─── Also test tool call for mysql ───────────────────────────────────────────
function testMCPCall(name, server, toolName, toolArgs = {}) {
  return new Promise(resolve => {
    const [cmd, ...rawArgs] = server.command
    const bin = resolveBin(cmd) ?? cmd
    const args = rawArgs.map(a => interp(a))
    const env  = { ...process.env }
    if (server.env) Object.entries(server.env).forEach(([k, v]) => { env[k] = interp(v) })

    const proc = spawn(bin, args, { env, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = '', done = false, initDone = false

    const finish = result => { if (done) return; done = true; proc.kill('SIGTERM'); resolve(result) }
    const timeout = setTimeout(() => finish({ ok: false, error: 'timeout' }), 10000)

    proc.stdout.on('data', d => {
      out += d.toString()
      const lines = out.split('\n'); out = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (!initDone && msg.result?.serverInfo) {
            initDone = true
            // Send tool call
            proc.stdin.write(JSON.stringify({
              jsonrpc: '2.0', id: 2, method: 'tools/call',
              params: { name: toolName, arguments: toolArgs }
            }) + '\n')
            return
          }
          if (initDone && msg.id === 2) {
            clearTimeout(timeout)
            if (msg.error) { finish({ ok: false, error: msg.error.message }); return }
            const text = (msg.result?.content ?? []).map(c => c.text ?? '').join('')
            const isError = text.toLowerCase().includes('error') || text.toLowerCase().includes('can\'t connect')
            finish({ ok: !isError, data: text.slice(0, 120), error: isError ? text.slice(0,100) : null })
            return
          }
        } catch {}
      }
    })

    proc.stderr.on('data', () => {})
    proc.on('error', e => { clearTimeout(timeout); finish({ ok: false, error: e.message }) })

    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'health-check', version: '1' } }
    }) + '\n')
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────
;(async () => {
  console.log('\n🧪 MCP Health Check — ~/.agents/mcp/servers.json\n')

  // Phase 1: initialize all
  console.log(`${DIM}Phase 1: Server startup${RESET}`)
  const startResults = await Promise.all(
    Object.entries(servers).map(([name, server]) => testMCP(name, server).then(r => ({ name, ...r })))
  )
  for (const r of startResults) {
    if (r.ok) ok(r.name.padEnd(22), `${r.serverName} v${r.version}`)
    else      fail(r.name.padEnd(22), r.error)
  }

  // Phase 2: tool calls for mysql/mysql-local
  console.log(`\n${DIM}Phase 2: Tool calls (get_schema_info)${RESET}`)
  for (const name of ['mysql', 'mysql-local']) {
    if (!servers[name]) continue
    const r = await testMCPCall(name, servers[name], 'get_schema_info', {})
    if (r.ok) {
      const tables = r.data.split('\n').filter(l => l.trim() && !l.startsWith('TABLE')).slice(0, 3).map(l => l.split(',')[0]).filter(Boolean)
      ok(name.padEnd(22), `tables: ${tables.join(', ')}...`)
    } else {
      const isOffline = r.error?.includes('111') || r.error?.includes('connect')
      if (isOffline) warn(name.padEnd(22), 'MySQL not running (start with: sudo systemctl start mysql)')
      else           fail(name.padEnd(22), r.error ?? 'unknown error')
    }
  }

  // Summary
  const allOk = startResults.every(r => r.ok)
  console.log('')
  if (allOk) console.log(`${GREEN}✅ All MCP servers are healthy!${RESET}\n`)
  else        console.log(`${YELLOW}⚠️  Some servers have issues — check above${RESET}\n`)
})()
