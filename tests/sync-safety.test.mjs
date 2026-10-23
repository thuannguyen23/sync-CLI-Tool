import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const repo = new URL('..', import.meta.url).pathname;
const agents = ['AGY', 'CODEX', 'OPENCODE', 'CURSOR', 'KILO', 'CLAUDE', 'CLINE'];
function fixture(t, selected = []) {
  const home = mkdtempSync(join(tmpdir(), 'sync-safety-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const profile = join(home, 'codex account');
  const bin = join(home, 'bin');
  mkdirSync(profile, { recursive: true });
  mkdirSync(bin);
  const env = { ...process.env, HOME: home, CODEX_HOME: profile,
    XDG_CONFIG_HOME: join(home, '.config'), XDG_CACHE_HOME: join(home, 'cache'),
    XDG_DATA_HOME: join(home, 'data'), XDG_STATE_HOME: join(home, 'state'),
    PATH: `${bin}:${process.env.PATH}` };
  for (const agent of agents) {
    if (selected.includes(agent)) delete env[`SKIP_${agent}`];
    else env[`SKIP_${agent}`] = '1';
  }
  function write(path, contents) {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents));
  }
  function run(name) {
    return spawnSync(process.execPath, [join(repo, 'scripts', name)], {
      cwd: repo, env, encoding: 'utf8', timeout: 15_000,
    });
  }
  write(join(home, '.agents/mcp/servers.json'), { servers: { audit: { command: ['/bin/true'] } } });
  return { home, profile, bin, env, write, run };
}

// A fake CLI is needed only at the external Codex boundary. Assertions inspect
// the produced config and preservation of user content, not a mock call count.
function codexBinary(f) {
  const path = join(f.bin, 'codex');
  writeFileSync(path, `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const file = path.join(process.env.CODEX_HOME, 'config.toml');
const args = process.argv.slice(2);
let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
if (args[1] === 'list') { console.log('Name Command\\npersonal /bin/true'); process.exit(0); }
if (args[1] === 'remove') { text = ''; }
if (args[1] === 'add') {
  text += '\\n[mcp_servers.' + args[2] + ']\\nurl = "https://example.invalid/mcp"\\n';
}
fs.writeFileSync(file, text);
`, { mode: 0o755 });
}

test('Codex preserves personal MCP servers and writes headers into CODEX_HOME', t => {
  const f = fixture(t, ['CODEX']);
  codexBinary(f);
  const config = join(f.profile, 'config.toml');
  const personal = '[mcp_servers.personal]\ncommand = "/bin/true"\n';
  f.write(config, personal);
  const fallback = join(f.home, '.codex/config.toml');
  f.write(fallback, '# do not change this profile\n');
  f.write(join(f.home, '.agents/mcp/servers.json'), { servers: {
    audit: { url: 'https://example.invalid/mcp', headers: { 'X-Audit': 'fixture-$&' } },
  } });
  const result = f.run('sync-mcp.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(readFileSync(config, 'utf8').includes(personal));
  assert.match(readFileSync(config, 'utf8'), /"X-Audit" = "fixture-\$&"/);
  assert.equal(readFileSync(fallback, 'utf8'), '# do not change this profile\n');
  assert.equal(readFileSync(config + '.bak', 'utf8'), personal);
});

test('AGY merges personal MCP servers and preserves unrelated settings', t => {
  const f = fixture(t, ['AGY']);
  const config = join(f.home, '.gemini/config/mcp_config.json');
  f.write(config, { custom: 'keep', mcpServers: { personal: { command: '/bin/true' } } });
  const result = f.run('sync-mcp.mjs');
  assert.equal(result.status, 0, result.stderr);
  const after = JSON.parse(readFileSync(config, 'utf8'));
  assert.equal(after.custom, 'keep');
  assert.equal(after.mcpServers.personal.command, '/bin/true');
  assert.equal(after.mcpServers.audit.command, '/bin/true');
});

test('OpenCode refuses malformed config without changing it or its backup', t => {
  const f = fixture(t, ['OPENCODE']);
  const config = join(f.home, '.config/opencode/opencode.json');
  const original = '{"provider":{"keep":{}},"broken":}';
  f.write(config, original);
  f.write(config + '.bak', 'original backup');
  const result = f.run('sync-mcp.mjs');
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(config, 'utf8'), original);
  assert.equal(readFileSync(config + '.bak', 'utf8'), 'original backup');
  assert.doesNotMatch(result.stdout, /MCP sync complete/);
});

test('OpenCode preserves JSONC strings, settings, personal servers, and the first backup', t => {
  const f = fixture(t, ['OPENCODE']);
  const config = join(f.home, '.config/opencode/opencode.jsonc');
  const original = '{\n// user settings\n"model":"keep", "note":"https://example.invalid/*literal*/", "mcp":{"servers":{"personal":{"type":"local","command":["true"]}}},\n}';
  f.write(config, original);
  for (let i = 0; i < 2; i++) {
    const result = f.run('sync-mcp.mjs');
    assert.equal(result.status, 0, result.stderr);
  }
  const after = JSON.parse(readFileSync(config, 'utf8'));
  assert.equal(after.model, 'keep');
  assert.equal(after.note, 'https://example.invalid/*literal*/');
  assert.ok(after.mcp.servers.personal);
  assert.ok(after.mcp.servers.audit);
  assert.equal(readFileSync(config + '.bak', 'utf8'), original);
  assert.equal(existsSync(join(f.home, '.config/opencode/opencode.json')), false);
});

test('rules respect opt-out without creating agent configuration', t => {
  const f = fixture(t);
  const result = f.run('sync-rules.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(f.home, '.codex')), false);
  assert.equal(existsSync(join(f.profile, 'AGENTS.md')), false);
  assert.equal(existsSync(join(f.home, '.gemini')), false);
  assert.equal(existsSync(join(f.home, '.config/opencode')), false);
});

test('rules preserve a personal backup and populate the active Codex profile', t => {
  const f = fixture(t, ['CODEX']);
  const config = join(f.profile, 'AGENTS.md');
  f.write(config, 'personal rules\n');
  for (let i = 0; i < 2; i++) assert.equal(f.run('sync-rules.mjs').status, 0);
  assert.equal(readFileSync(config + '.bak', 'utf8'), 'personal rules\n');
  assert.equal(realpathSync(config), realpathSync(join(repo, 'rules/AGENTS.md')));
});

test('skills respect opt-out without creating agent directories', t => {
  const f = fixture(t);
  const result = f.run('sync-skills.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(f.profile, 'skills')), false);
  assert.equal(existsSync(join(f.home, '.codex')), false);
  assert.equal(existsSync(join(f.home, '.gemini')), false);
});

test('a failed Codex hook install exits nonzero and does not report completion', t => {
  const f = fixture(t, ['CODEX']);
  f.env.CODEX_HOME = join(f.home, 'profile-is-a-file');
  f.write(f.env.CODEX_HOME, 'keep');
  writeFileSync(join(f.bin, 'rtk'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(f.bin, 'npm'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const result = f.run('sync-hooks.mjs');
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /Hooks sync complete/);
  assert.equal(readFileSync(f.env.CODEX_HOME, 'utf8'), 'keep');
});

test('OpenCode V2 RTK callback rewrites event.input and ignores other tools',
  { skip: Number(process.versions.node.split('.')[0]) < 22 }, t => {
  const f = fixture(t);
  const entry = join(f.home, 'rtk.ts');
  copyFileSync(join(repo, 'plugins/opencode/rtk.ts'), entry);
  writeFileSync(join(f.bin, 'rtk'), '#!/bin/sh\nprintf "rtk git status --short\\n"\n', { mode: 0o755 });
  const script = `import plugin from ${JSON.stringify(pathToFileURL(entry).href)};
    let before;
    await plugin.setup({tool:{hook:async (_name, fn) => {before = fn}}});
    const shell = {tool:'shell',input:{command:'git status --short'}};
    const read = {tool:'read',input:{command:'git status --short'}};
    await before(shell); await before(read);
    console.log(JSON.stringify({shell:shell.input.command,read:read.input.command}));`;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], {
    env: f.env, cwd: f.home, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    shell: 'rtk git status --short', read: 'git status --short',
  });
});

test('AGY normalizes deployed context-mode hooks and supplies an active rule', t => {
  const f = fixture(t, ['AGY']);
  const npmRoot = join(f.home, 'npm');
  const plugin = join(npmRoot, 'context-mode/configs/antigravity-cli');
  const hooks = { hooks: {
    PreToolUse: [{ matcher: 'run_command', hooks: [{ type: 'command', command: 'context-mode hook antigravity-cli pretooluse' }] }],
    Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'context-mode hook antigravity-cli stop' }] }],
  } };
  f.write(join(plugin, 'plugin.json'), { name: 'context-mode', version: '1.0.169' });
  f.write(join(plugin, 'hooks.json'), hooks);
  f.write(join(plugin, 'hooks/hooks.json'), hooks);
  f.write(join(plugin, 'rules/context-mode.md'), '# Context routing\n');
  mkdirSync(join(f.home, '.agents/skills'), { recursive: true });
  for (const binary of ['rtk', 'context-mode']) {
    writeFileSync(join(f.bin, binary), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }
  writeFileSync(join(f.bin, 'npm'), `#!/bin/sh\nprintf '%s\\n' '${npmRoot}'\n`, { mode: 0o755 });
  for (let i = 0; i < 2; i++) {
    const result = f.run('sync-hooks.mjs');
    assert.equal(result.status, 0, result.stderr);
  }
  const installed = join(f.home, '.gemini/config/plugins/context-mode');
  const after = JSON.parse(readFileSync(join(installed, 'hooks.json'), 'utf8'));
  assert.equal(after.hooks.Stop[0].command, 'context-mode hook antigravity-cli stop');
  assert.equal(after.hooks.PreToolUse[0].matcher, 'run_command');
  assert.match(readFileSync(join(installed, 'rules/context-mode.md'), 'utf8'), /trigger: always_on/);
  assert.equal(existsSync(join(installed, 'hooks/hooks.json')), false);
  assert.deepEqual(JSON.parse(readFileSync(join(plugin, 'hooks.json'), 'utf8')), hooks);
});


test('Codex installs native context-mode hooks and MCP without a marketplace plugin', t => {
  const f = fixture(t, ['CODEX']);
  codexBinary(f);
  const pkg = join(f.home, 'npm/context-mode');
  f.write(join(pkg, 'configs/codex/hooks.json'), { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'context-mode hook codex sessionstart' }] }] } });
  f.write(join(f.bin, 'npm'), '#!/bin/sh\necho "' + join(f.home, 'npm') + '"\n');
  f.write(join(f.bin, 'context-mode'), '#!/bin/sh\nexit 0\n');
  spawnSync('chmod', ['+x', join(f.bin, 'npm'), join(f.bin, 'context-mode')]);
  const hooks = join(f.profile, 'hooks.json');
  f.write(hooks, { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'personal-hook' }] }] } });
  const config = join(f.profile, 'config.toml');
  f.write(config, '[marketplaces.context-mode]\nsource = "keep"\n');
  const result = f.run('sync-hooks.mjs');
  assert.equal(result.status, 0, result.stderr);
  const actual = JSON.parse(readFileSync(hooks));
  assert.ok(actual.hooks.SessionStart.some(g => g.hooks.some(h => h.command === 'personal-hook')));
  assert.ok(actual.hooks.SessionStart.some(g => g.hooks.some(h => h.command.includes('context-mode hook codex sessionstart'))));
  assert.match(readFileSync(config, 'utf8'), /mcp_servers.context-mode/);
});

test('OpenCode registers native context-mode MCP while preserving personal configuration', t => {
  const f = fixture(t, ['OPENCODE']);
  f.write(join(f.bin, 'context-mode'), '#!/bin/sh\nexit 0\n');
  spawnSync('chmod', ['+x', join(f.bin, 'context-mode')]);
  const config = join(f.home, '.config/opencode/opencode.json');
  f.write(config, { model: 'keep', mcp: { servers: { personal: { type: 'local', command: ['true'] } } } });
  const result = f.run('sync-hooks.mjs');
  assert.equal(result.status, 0, result.stderr);
  const actual = JSON.parse(readFileSync(config));
  assert.equal(actual.model, 'keep');
  assert.deepEqual(actual.mcp.servers.personal.command, ['true']);
  assert.deepEqual(actual.mcp.servers['context-mode'].command, [join(f.bin, 'context-mode')]);
});
