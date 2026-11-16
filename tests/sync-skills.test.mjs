import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { agentPaths } from '../scripts/agent-paths.mjs';

test('sync-skills discovers skills in an isolated home', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'skill-discovery-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const script = new URL('../scripts/sync-skills.mjs', import.meta.url).href;
  const code = `import { syncSkills } from ${JSON.stringify(script)}; console.log(JSON.stringify(syncSkills()));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, HOME: home, CODEX_HOME: join(home, 'codex-profile') },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const synced = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.ok(synced.synced >= 15);
  assert.ok(synced.skills.includes('sureforge'));
  assert.ok(synced.skills.includes('brainstorming'));
});

test('package.json sync script includes sync-skills.mjs', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts.sync, /sync-skills\.mjs/);
});

test('Beads skill reaches every supported host and repeated sync preserves personal entries', t => {
  const home = mkdtempSync(join(tmpdir(), 'beads-skill-hosts-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const active = join(home, 'active-codex');
  const unsupported = join(home, '.unsupported', 'config.json');
  mkdirSync(join(home, '.unsupported'));
  writeFileSync(unsupported, 'preserve');
  const hosts = agentPaths(home, active);
  for (const { directory } of hosts) {
    mkdirSync(join(directory, 'skills', 'personal'), { recursive: true });
    writeFileSync(join(directory, 'skills', 'personal', 'SKILL.md'), 'personal');
  }
  for (let i = 0; i < 2; i++) {
    const env = { ...process.env, HOME: home, CODEX_HOME: active };
    for (const key of ['SKIP_CODEX', 'SKIP_AGY', 'SKIP_OPENCODE']) delete env[key];
    const r = spawnSync(process.execPath, [new URL('../scripts/sync-skills.mjs', import.meta.url).pathname], {
      cwd: new URL('..', import.meta.url).pathname, env, encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    for (const { directory } of hosts) {
      const skill = join(directory, 'skills', 'beads-execution');
      assert.ok(existsSync(join(skill, 'SKILL.md')), directory);
      assert.equal(realpathSync(skill), realpathSync(new URL('../skills/beads-execution', import.meta.url)));
      assert.equal(readFileSync(join(directory, 'skills', 'personal', 'SKILL.md'), 'utf8'), 'personal');
    }
  }
  assert.equal(readFileSync(unsupported, 'utf8'), 'preserve');
});

test('sync-skills also populates an active CODEX_HOME without replacing system skills', (t) => {
  const fixture = mkdtempSync(join(tmpdir(), 'active-codex-skills-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const testHome = join(fixture, 'home');
  const activeCodexHome = join(fixture, 'codex account');
  const systemSkill = join(activeCodexHome, 'skills', '.system', 'sentinel.md');
  mkdirSync(join(activeCodexHome, 'skills', '.system'), { recursive: true });
  writeFileSync(systemSkill, 'preserve system skills\n');

  const result = spawnSync(process.execPath, [
    new URL('../scripts/sync-skills.mjs', import.meta.url).pathname,
  ], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, HOME: testHome, CODEX_HOME: activeCodexHome },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const projectSkill = realpathSync(new URL('../skills/brainstorming', import.meta.url));
  const activeSkill = join(activeCodexHome, 'skills', 'brainstorming');
  assert.ok(existsSync(join(activeSkill, 'SKILL.md')), 'active Codex profile must receive the skill');
  assert.equal(realpathSync(activeSkill), projectSkill);
  assert.equal(realpathSync(join(testHome, '.codex', 'skills', 'brainstorming')), projectSkill);
  assert.equal(readFileSync(systemSkill, 'utf8'), 'preserve system skills\n');
});

