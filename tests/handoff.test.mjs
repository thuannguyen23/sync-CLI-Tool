import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../scripts/handoff.mjs', import.meta.url));

function fixture(t, commit = true) {
  const root = mkdtempSync(join(tmpdir(), 'handoff-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project with spaces');
  mkdirSync(project);
  const env = {
    PATH: process.env.PATH,
    HOME: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    LC_ALL: 'C',
  };
  function git(...args) {
    const result = spawnSync('git', [
      '-c', 'core.hooksPath=/dev/null',
      '-c', 'user.name=Handoff Test',
      '-c', 'user.email=handoff-test@example.invalid',
      '-c', 'commit.gpgsign=false',
      '-C', project, ...args,
    ], { env, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trimEnd();
  }
  git('init', '--quiet', '--initial-branch=main');
  writeFileSync(join(project, 'tracked.txt'), 'base\n');
  if (commit) {
    git('add', 'tracked.txt');
    git('commit', '--quiet', '-m', 'Fixture');
  }
  writeFileSync(join(project, 'notes.md'),
    '# Goal\nRepair doctor hooks.\n\n# Verification\nNot run.\n');
  function run(...args) {
    return spawnSync(process.execPath, [script, ...args], {
      cwd: root, env, encoding: 'utf8', timeout: 15_000,
    });
  }
  return { root, project, git, run };
}

test('creates handoff for the selected repository with notes and staged/unstaged changes', t => {
  const f = fixture(t);
  writeFileSync(join(f.project, 'tracked.txt'), 'staged\n');
  f.git('add', 'tracked.txt');
  writeFileSync(join(f.project, 'tracked.txt'), 'private-working-content\n');
  writeFileSync(join(f.project, '.env'), 'PRIVATE_VALUE=not-for-handoff\n');
  const before = f.git('status', '--porcelain=v1', '--untracked-files=all');
  const head = f.git('rev-parse', 'HEAD');
  const index = readFileSync(join(f.project, '.git', 'index'));

  const result = f.run('--project', f.project, '--task', 'notes.md');
  assert.equal(result.status, 0, result.stderr);
  const output = readFileSync(join(f.project, 'HANDOFF.md'), 'utf8');
  assert.ok(output.includes('Repository: ' + f.project));
  assert.ok(output.includes('Branch: main'));
  assert.ok(output.includes('HEAD: ' + head));
  assert.ok(output.includes(before));
  assert.match(output, /Repair doctor hooks/);
  assert.match(output, /# Verification\nNot run/);
  assert.match(output, /## Staged changes\n\n~~~text\n tracked\.txt/);
  assert.match(output, /## Unstaged changes\n\n~~~text\n tracked\.txt/);
  assert.doesNotMatch(output, /PRIVATE_VALUE|not-for-handoff|private-working-content/);
  assert.equal(f.git('rev-parse', 'HEAD'), head);
  assert.deepEqual(readFileSync(join(f.project, '.git', 'index')), index);
  assert.equal(readFileSync(join(f.project, 'tracked.txt'), 'utf8'), 'private-working-content\n');
});

test('refuses to overwrite a file or follow an existing output symlink', t => {
  const f = fixture(t);
  const output = join(f.project, 'existing.md');
  writeFileSync(output, 'keep existing content');
  let result = f.run('--project', f.project, '--task', 'notes.md', '--output', 'existing.md');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Output already exists/);
  assert.equal(readFileSync(output, 'utf8'), 'keep existing content');

  symlinkSync(output, join(f.project, 'linked.md'));
  result = f.run('--project', f.project, '--task', 'notes.md', '--output', 'linked.md');
  assert.equal(result.status, 1);
  assert.equal(readFileSync(output, 'utf8'), 'keep existing content');
});

test('supports detached HEAD, custom output paths and notes containing fences', t => {
  const f = fixture(t);
  f.git('checkout', '--detach', '--quiet');
  writeFileSync(join(f.project, 'notes.md'), 'Goal\n~~~\nKeep these notes intact.\n~~~\n');
  const result = f.run('--project', f.project, '--task', 'notes.md', '--output', 'next agent.md');
  assert.equal(result.status, 0, result.stderr);
  const output = readFileSync(join(f.project, 'next agent.md'), 'utf8');
  assert.match(output, /Branch: \(detached HEAD\)/);
  assert.match(output, /~~~~text\nGoal\n~~~\nKeep these notes intact\.\n~~~\n~~~~/);
});

test('supports repositories with no commits', t => {
  const f = fixture(t, false);
  const result = f.run('--project', f.project, '--task', 'notes.md');
  assert.equal(result.status, 0, result.stderr);
  const output = readFileSync(join(f.project, 'HANDOFF.md'), 'utf8');
  assert.match(output, /Branch: main/);
  assert.match(output, /HEAD: \(no commits yet\)/);
});

test('rejects invalid input without creating a handoff', t => {
  const f = fixture(t);
  for (const args of [
    [],
    ['--unknown', 'value'],
    ['--task'],
    ['--project', f.root, '--task', 'notes.md'],
    ['--project', f.project, '--task', 'missing.md'],
  ]) {
    const result = f.run(...args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.equal(existsSync(join(f.project, 'HANDOFF.md')), false);
  }
  writeFileSync(join(f.project, 'notes.md'), ' \n');
  const result = f.run('--project', f.project, '--task', 'notes.md');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Task notes must not be empty/);
});

test('help works without a repository or task notes', t => {
  const f = fixture(t);
  const result = f.run('--help');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:/);
  assert.equal(existsSync(join(f.project, 'HANDOFF.md')), false);
});
