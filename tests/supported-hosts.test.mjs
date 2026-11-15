import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const repo = new URL('..', import.meta.url).pathname;
const retired = ['.cursor', '.claude', '.cline', '.config/kilo', '.config/Cursor', '.config/Code'];

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'supported-hosts-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const bin = join(home, 'bin');
  mkdirSync(bin);
  const env = { ...process.env, HOME: home, CODEX_HOME: join(home, 'codex profile'),
    XDG_CONFIG_HOME: join(home, '.config'), PATH: `${bin}:${process.env.PATH}` };
  // Retired SKIP flags must not be needed to keep other clients untouched.
  for (const key of Object.keys(env)) if (key.startsWith('SKIP_')) delete env[key];
  function write(path, contents) {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, contents);
  }
  for (const name of ['npm', 'context-mode', 'codex']) {
    write(join(bin, name), '#!/bin/sh\n' + (name === 'npm' ? 'exit 1\n' : 'exit 0\n'));
  }
  write(join(bin, 'rtk'), '#!/bin/sh\n[ "$1" = --version ] && echo "rtk 1.2.0"\nexit 0\n');
  for (const name of readdirSync(bin)) {
    const result = spawnSync('chmod', ['+x', join(bin, name)]);
    assert.equal(result.status, 0);
  }
  const run = (file, args = [], extra = {}) => spawnSync(
    file.endsWith('.sh') ? 'bash' : process.execPath,
    [join(repo, file), ...args],
    { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8', timeout: 15_000 },
  );
  return { home, env, write, run };
}

function assertRetiredAbsent(home) {
  for (const path of [...retired, '.claude.json']) assert.equal(existsSync(join(home, path)), false, path);
}

test('rules and skills configure only supported hosts without retired SKIP flags', t => {
  const f = fixture(t);
  for (const script of ['sync-rules.mjs', 'sync-skills.mjs']) {
    const result = f.run(`scripts/${script}`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  for (const base of ['.codex', 'codex profile', '.config/opencode', '.gemini/config',
    '.gemini/antigravity-cli', '.gemini/antigravity-ide', '.gemini/antigravity']) {
    assert.ok(existsSync(join(f.home, base, 'AGENTS.md')), base);
    assert.ok(existsSync(join(f.home, base, 'skills/brainstorming/SKILL.md')), base);
  }
  assertRetiredAbsent(f.home);
});

test('MCP sync writes supported clients and preserves unsupported clients byte for byte', t => {
  const f = fixture(t);
  f.write(join(f.home, '.agents/mcp/servers.json'), JSON.stringify({ servers: { audit: { command: ['/bin/true'] } } }));
  const personal = '{"mcpServers":{"personal":{"command":"mine"}},"custom":true}\n';
  const sentinels = ['.cursor/mcp.json', '.claude.json', '.cline/data/settings/cline_mcp_settings.json',
    '.config/Code/User/mcp.json', '.config/kilo/kilo.json'];
  for (const file of sentinels) f.write(join(f.home, file), personal);
  for (let round = 0; round < 2; round++) {
    const result = f.run('scripts/sync-mcp.mjs');
    assert.equal(result.status, 0, result.stderr || result.stdout);
    for (const file of sentinels) assert.equal(readFileSync(join(f.home, file), 'utf8'), personal, file);
  }
  assert.ok(JSON.parse(readFileSync(join(f.home, '.config/opencode/opencode.json'))).mcp.servers.audit);
  assert.ok(JSON.parse(readFileSync(join(f.home, '.gemini/config/mcp_config.json'))).mcpServers.audit);
});

test('hook sync does not create unsupported host directories', t => {
  const f = fixture(t);
  const result = f.run('scripts/sync-hooks.mjs');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(existsSync(join(f.env.CODEX_HOME, 'hooks.json')));
  assert.ok(existsSync(join(f.home, '.config/opencode/plugins/rtk.ts')));
  assertRetiredAbsent(f.home);
});

test('teardown no longer restores configs or removes owned links of unsupported hosts', t => {
  const f = fixture(t);
  const personal = '{"current":"keep"}\n';
  const files = ['.cursor/mcp.json', '.claude/settings.json', '.config/kilo/kilo.json'];
  for (const file of files) {
    f.write(join(f.home, file), personal);
    f.write(join(f.home, file + '.bak'), '{"old":"backup"}\n');
  }
  const link = join(f.home, '.claude/CLAUDE.md');
  symlinkSync(join(repo, 'rules/AGENTS.md'), link);
  const result = f.run('teardown.sh', ['--force', '--restore-backups']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  for (const file of files) assert.equal(readFileSync(join(f.home, file), 'utf8'), personal, file);
  assert.ok(existsSync(link));
});

test('doctor detects policy drift in every distributed host and ignores retired configs', t => {
  const f = fixture(t);
  const policy = '# canonical fixture policy\n';
  f.write(join(f.home, '.agents/rules/AGENTS.md'), policy);
  f.write(join(f.home, '.agents/mcp/servers.json'), '{"servers":{}}');
  const directories = ['.codex', 'codex profile', '.config/opencode', '.gemini/config',
    '.gemini/antigravity-cli', '.gemini/antigravity-ide', '.gemini/antigravity'];
  for (const dir of directories) f.write(join(f.home, dir, 'AGENTS.md'), policy);
  f.write(join(f.home, '.cursor/hooks.json'), 'invalid personal JSON');
  f.write(join(f.home, '.claude/settings.json'), 'invalid personal JSON');
  const drift = join(f.home, '.gemini/antigravity-cli/AGENTS.md');
  f.write(drift, '# wrong policy\n');
  const first = f.run('scripts/doctor.mjs');
  assert.equal(first.status, 1, first.stdout + first.stderr);
  assert.match(first.stdout, /\[ERROR\] Instructions AGY CLI\/AGENTS.md: Differs/);
  f.write(drift, policy);
  const second = f.run('scripts/doctor.mjs');
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.doesNotMatch(second.stdout, /Cursor|Claude Code/);
});

test('setup selects only supported hosts and delegates to the shared distributors', t => {
  const f = fixture(t);
  const checkout = join(f.home, 'setup checkout');
  f.write(join(checkout, 'setup.sh'), readFileSync(join(repo, 'setup.sh')));
  f.write(join(checkout, 'scripts/prerequisites.sh'), '#!/bin/bash\nreturn 0\n');
  f.write(join(checkout, 'secrets.env.example'), '# disposable fixture\n');
  // Run the actual shell entry point but stub dependency installation and the
  // separately tested distributors, so setup cannot configure the real machine.
  for (const name of ['skills', 'rules', 'mcp', 'hooks']) {
    f.write(join(checkout, `scripts/sync-${name}.mjs`),
      `import { appendFileSync } from 'node:fs'; appendFileSync(process.env.HOME + '/setup-calls', '${name}\\n');\n`);
  }
  const result = spawnSync('bash', [join(checkout, 'setup.sh'), '--silent'], {
    cwd: checkout, env: f.env, encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(readFileSync(join(f.home, 'setup-calls'), 'utf8'), 'skills\nrules\nmcp\nhooks\n');
  assert.doesNotMatch(result.stdout, /Cursor|Claude Code|Cline|Kilo/);
  assertRetiredAbsent(f.home);
});

test('Antigravity IDE user MCP follows AGY selection and participates in preflight', t => {
  const f = fixture(t);
  f.env.SKIP_CODEX = '1';
  f.env.SKIP_OPENCODE = '1';
  f.env.SKIP_CURSOR = '1'; // The retired setting must not suppress AGY IDE.
  f.write(join(f.home, '.agents/mcp/servers.json'), JSON.stringify({ servers: { audit: { command: ['/bin/true'] } } }));
  const file = join(f.home, '.config/Antigravity IDE/User/mcp.json');
  const personal = '{"mcpServers":{"personal":{"command":"mine"}}}\n';
  f.write(file, personal);
  const first = f.run('scripts/sync-mcp.mjs');
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const data = JSON.parse(readFileSync(file));
  assert.ok(data.mcpServers.audit);
  assert.deepEqual(data.mcpServers.personal, { command: 'mine' });
  const global = join(f.home, '.gemini/config/mcp_config.json');
  const before = readFileSync(global, 'utf8');
  f.write(file, '{ malformed personal config');
  const second = f.run('scripts/sync-mcp.mjs');
  assert.notEqual(second.status, 0);
  assert.equal(readFileSync(global, 'utf8'), before);
  assert.equal(readFileSync(file, 'utf8'), '{ malformed personal config');
});
