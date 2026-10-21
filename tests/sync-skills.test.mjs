import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { syncSkills } from '../scripts/sync-skills.mjs';

test('sync-skills discovers sureforge and all skills', () => {
  const result = syncSkills();
  assert.ok(result.synced >= 15, `Expected at least 15 skills, got ${result.synced}`);
  assert.ok(result.skills.includes('sureforge'), 'sureforge skill should be discovered and synced');
  assert.ok(result.skills.includes('brainstorming'), 'brainstorming skill should be discovered');
});

test('package.json sync script includes sync-skills.mjs', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts.sync, /sync-skills\.mjs/);
});

test('sync-skills targets Claude Code and Cline directories', () => {
  const scriptContent = readFileSync(new URL('../scripts/sync-skills.mjs', import.meta.url), 'utf8');
  assert.match(scriptContent, /\.claude.*skills/);
  assert.match(scriptContent, /\.cline.*skills/);
});

test('sync-skills targets OpenCode and Cursor directories', () => {
  const scriptContent = readFileSync(new URL('../scripts/sync-skills.mjs', import.meta.url), 'utf8');
  assert.match(scriptContent, /\.config.*opencode.*skills/);
  assert.match(scriptContent, /\.cursor.*skills/);
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

