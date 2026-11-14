import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = new URL('../scripts/doctor.mjs', import.meta.url);

test('doctor reports duplicate OpenCode plugins and never claims model execution', t => {
  const f = fixture(t);
  writeFileSync(join(f.mcp, 'servers.json'), JSON.stringify({ servers: {} }));
  const dir = join(f.home, '.config/opencode');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({
    model: 'opencode/test-free', plugin: ['/fixture/context-mode'], plugins: ['/fixture/context-mode'],
  }));
  const r = f.run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[ERROR\] OpenCode plugins: Duplicate/);
  assert.match(r.stdout, /\[UNVERIFIED\] OpenCode model:.*health.*--opencode/);
});

test('doctor identifies missing inputs, optional skips and native v2 hooks without execution', t => {
  const f=fixture(t);
  writeFileSync(join(f.mcp,'servers.json'),JSON.stringify({servers:{optional:{command:['true'],requiredSecrets:['DOCTOR_OPTIONAL_FIXTURE']},database:{command:['true'],env:{HOST:'${DOCTOR_MISSING_FIXTURE}'}}}}));
  writeFileSync(join(f.home,'.agents/secrets.env'),'DOCTOR_OPTIONAL_FIXTURE=""\n');
  writeFileSync(join(f.home,'.codex/hooks.json'),JSON.stringify({hooks:{Stop:[{hooks:[{command:'node /fixture/context-mode/hook.mjs --agent codex'}]}]}}));
  const r=f.run();assert.match(r.stdout,/\[SKIPPED\] MCP optional/);assert.match(r.stdout,/\[UNCONFIGURED\] MCP database/);assert.match(r.stdout,/Codex context-mode: Hook command is configured/);
});

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'agent-doctor-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));

  const source = join(home, '.agents', 'skills', 'example');
  const target = join(home, '.codex', 'skills');
  const mcp = join(home, '.agents', 'mcp');

  mkdirSync(source, { recursive: true });
  mkdirSync(target, { recursive: true });
  mkdirSync(mcp, { recursive: true });
  writeFileSync(join(source, 'SKILL.md'), '# Example\n');
  symlinkSync(source, join(target, 'example'), 'dir');

  return {
    home,
    target,
    mcp,
    run(env = {}) {
      return spawnSync(process.execPath, [script.pathname], {
        env: { ...process.env, HOME: home, CODEX_HOME: join(home, '.codex'), ...env },
        encoding: 'utf8',
        timeout: 10_000,
      });
    },
  };
}

test('reports configured MCP and hooks as unverified without exposing secrets', t => {
  const f = fixture(t);
  writeFileSync(join(f.mcp, 'servers.json'), JSON.stringify({
    servers: {
      remote: {
        url: 'https://example.invalid/mcp',
        headers: { Authorization: 'private-test-token' },
      },
    },
  }));
  const hookPath = join(f.home, '.codex', 'rtk_pre_tool_use.py');
  writeFileSync(hookPath, '# Fixture only; must never execute.\nraise RuntimeError("must not run")\n');
  writeFileSync(join(f.home, '.codex', 'hooks.json'), JSON.stringify({
    hooks: {
      PreToolUse: [{
        matcher: '^Bash$',
        hooks: [{ type: 'command', command: `python3 '${hookPath}'` }],
      }],
    },
  }));

  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[UNVERIFIED\] MCP remote: HTTP URL is valid; connection not tested/);
  assert.match(result.stdout, /\[OK\] Skill Codex default\/example/);
  assert.match(result.stdout, /\[UNVERIFIED\] Codex RTK: RTK event, matcher and script file checked; execution not tested/);
  assert.doesNotMatch(result.stdout, /private-test-token/);
});

test('reports invalid MCP URLs and broken skill links', t => {
  const f = fixture(t);
  writeFileSync(join(f.mcp, 'servers.json'), JSON.stringify({
    servers: { bad: { url: 'not-a-url' } },
  }));
  rmSync(join(f.target, 'example'));
  symlinkSync(join(f.home, 'missing'), join(f.target, 'example'), 'dir');

  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[ERROR\] MCP bad: Invalid HTTP URL/);
  assert.match(result.stdout, /\[ERROR\] Skill Codex default\/example: Broken symlink/);
});

test('reports malformed hook configuration without claiming runtime health', t => {
  const f = fixture(t);
  writeFileSync(join(f.mcp, 'servers.json'), JSON.stringify({ servers: {} }));
  writeFileSync(join(f.home, '.codex', 'hooks.json'), '{invalid');

  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[ERROR\] Codex hooks: Cannot read a valid JSON object/);
  assert.doesNotMatch(result.stdout, /healthy/i);
});

for (const [label, options, expected] of [
  ['wrong event', { event: 'Stop' }, /\[ERROR\] Codex RTK: RTK hook must use PreToolUse/],
  ['wrong matcher', { matcher: '^Read$' }, /\[ERROR\] Codex RTK: RTK matcher does not match Bash/],
  ['invalid matcher', { matcher: '[' }, /\[ERROR\] Codex RTK: RTK matcher is invalid/],
  ['wrong type', { type: 'prompt' }, /\[ERROR\] Codex RTK: RTK hook must have command type/],
  ['missing script', { missing: true }, /\[ERROR\] Codex RTK: RTK script does not exist/],
  ['directory script', { directory: true }, /\[ERROR\] Codex RTK: RTK script is not a regular file/],
  ['valid script', {}, /\[UNVERIFIED\] Codex RTK: RTK event, matcher and script file checked; execution not tested/],
  ['all-tools matcher', { matcher: null }, /\[UNVERIFIED\] Codex RTK: RTK event, matcher and script file checked; execution not tested/],
  ['relative path', { command: 'python3 rtk_pre_tool_use.py' }, /\[UNVERIFIED\] Codex RTK: RTK command path cannot be checked statically/],
  ['shell wrapper', { command: 'echo rtk_pre_tool_use.py' }, /\[UNVERIFIED\] Codex RTK: RTK command path cannot be checked statically/],
]) {
  test(`inspects Codex RTK ${label} without executing the hook`, t => {
    const f = fixture(t);
    writeFileSync(join(f.mcp, 'servers.json'), JSON.stringify({ servers: {} }));
    const directory = join(f.home, 'hooks with spaces');
    mkdirSync(directory);
    const hookPath = join(directory, 'rtk_pre_tool_use.py');
    if (options.directory) mkdirSync(hookPath);
    else if (!options.missing) {
      writeFileSync(hookPath, '# Fixture only; must never execute.\nraise RuntimeError("must not run")\n');
    }
    const group = {
      ...(options.matcher === null ? {} : { matcher: options.matcher ?? '^Bash$' }),
      hooks: [{ type: options.type ?? 'command', command: options.command ?? `python3 '${hookPath}'` }],
    };
    const file = join(f.home, '.codex', 'hooks.json');
    const original = JSON.stringify({ hooks: { [options.event ?? 'PreToolUse']: [group] } });
    writeFileSync(file, original);
    const result = f.run();
    assert.equal(result.status, expected.source.includes('ERROR') ? 1 : 0, result.stderr);
    assert.match(result.stdout, expected);
    assert.equal(readFileSync(file, 'utf8'), original);
  });
}

test('inspects RTK in the active CODEX_HOME instead of the default profile', t => {
  const f = fixture(t);
  writeFileSync(join(f.mcp, 'servers.json'), JSON.stringify({ servers: {} }));
  const profile = join(f.home, 'active profile');
  mkdirSync(profile);
  writeFileSync(join(profile, 'hooks.json'), JSON.stringify({
    hooks: { Stop: [{ hooks: [{ command: 'python3 /missing/rtk_pre_tool_use.py' }] }] },
  }));
  const result = f.run({ CODEX_HOME: profile });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /\[ERROR\] Codex RTK: RTK hook must use PreToolUse/);
});

test('doctor recognizes native Codex RTK without executing it', t => {
 const f=fixture(t);const binary=join(f.home,'rtk');writeFileSync(binary,'must not execute');
 writeFileSync(join(f.mcp,'servers.json'),JSON.stringify({servers:{}}));
 writeFileSync(join(f.home,'.codex/hooks.json'),JSON.stringify({hooks:{PreToolUse:[{matcher:'^Bash$',hooks:[{type:'command',command:`'${binary}' hook codex`}]}]}}));
 const r=f.run();assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Codex RTK: Native RTK event, matcher and binary checked; execution not tested/);
});


test('doctor detects policy drift without requiring a workflow document across the three clients without changing files', t => {
  const f = fixture(t);
  const source = join(f.home, '.agents/rules');
  const dirs = [join(f.home, '.codex'), join(f.home, '.gemini/config'), join(f.home, '.config/opencode')];
  mkdirSync(source, { recursive: true });
  for (const file of ['AGENTS.md']) {
    writeFileSync(join(source, file), 'canonical ' + file);
    for (const dir of dirs) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, file), 'canonical ' + file);
    }
  }
  let r = f.run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Instructions Codex active\/AGENTS.md: Matches canonical content/);
  assert.match(r.stdout, /model loading not tested/);
  const drift = join(dirs[2], 'AGENTS.md');
  writeFileSync(drift, 'different workflow');
  r = f.run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[ERROR\] Instructions OpenCode\/AGENTS.md: Differs/);
  assert.equal(readFileSync(drift, 'utf8'), 'different workflow');
});
