import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = new URL('../scripts/doctor.mjs', import.meta.url);

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
    run() {
      return spawnSync(process.execPath, [script.pathname], {
        env: { ...process.env, HOME: home, CODEX_HOME: join(home, '.codex') },
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
  writeFileSync(join(f.home, '.codex', 'hooks.json'), JSON.stringify({
    hooks: {
      PreToolUse: [{ hooks: [{ command: 'python3 rtk_pre_tool_use.py' }] }],
    },
  }));

  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[UNVERIFIED\] MCP remote: HTTP URL is valid; connection not tested/);
  assert.match(result.stdout, /\[OK\] Skill Codex default\/example/);
  assert.match(result.stdout, /\[UNVERIFIED\] Codex RTK: Hook command is configured; execution not tested/);
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
