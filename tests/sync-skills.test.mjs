import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { syncSkills } from '../scripts/sync-skills.mjs';

test('sync-skills discovers sureforge and all skills', () => {
  const result = syncSkills();
  assert.ok(result.synced >= 20, `Expected at least 20 skills, got ${result.synced}`);
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

test('sync-skills targets OpenCode directory', () => {
  const scriptContent = readFileSync(new URL('../scripts/sync-skills.mjs', import.meta.url), 'utf8');
  assert.match(scriptContent, /\.config.*opencode.*skills/);
});

