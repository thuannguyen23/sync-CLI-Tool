#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const usage = 'Usage: node scripts/handoff.mjs --task <notes.md> [--project <directory>] [--output <handoff.md>]';

function git(project, args, allowUnborn = false) {
  const env = { ...process.env };
  for (const key of [
    'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  ]) delete env[key];

  const result = spawnSync('git', [
    '--no-optional-locks', '-c', 'core.fsmonitor=false',
    '-C', project, ...args,
  ], { env, encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024 });

  if (result.status === 0) return result.stdout.trimEnd();
  if (allowUnborn && !result.error && result.status === 1) return '(no commits yet)';
  throw new Error('Cannot inspect Git repository; check the project path and Git installation.');
}

function block(text) {
  const runs = text.match(/~+/g) || [];
  const fence = '~'.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
  return fence + 'text\n' + text + '\n' + fence;
}

function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
    return;
  }

  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (
      !['--task', '--project', '--output'].includes(key) ||
      options.has(key) || !value || value.startsWith('--')
    ) throw new Error(usage);
    options.set(key, value);
  }
  if (!options.has('--task')) throw new Error(usage);

  const project = git(resolve(options.get('--project') || process.cwd()), ['rev-parse', '--show-toplevel']);
  const taskPath = resolve(project, options.get('--task'));
  const outputPath = resolve(project, options.get('--output') || 'HANDOFF.md');
  let notes;
  try {
    notes = readFileSync(taskPath, 'utf8');
  } catch {
    throw new Error('Cannot read the task notes file.');
  }
  if (!notes.trim()) throw new Error('Task notes must not be empty.');

  const branch = git(project, ['branch', '--show-current']) || '(detached HEAD)';
  const head = git(project, ['rev-parse', '--verify', '--quiet', 'HEAD'], true);
  const status = git(project, ['status', '--porcelain=v1', '--untracked-files=all']);
  const staged = git(project, ['diff', '--cached', '--stat', '--no-ext-diff', '--no-textconv']);
  const unstaged = git(project, ['diff', '--stat', '--no-ext-diff', '--no-textconv']);

  const content = [
    '# Task handoff',
    '',
    'Captured: ' + new Date().toISOString(),
    'Repository: ' + project,
    'Branch: ' + branch,
    'HEAD: ' + head,
    '',
    '## Resume instructions',
    '',
    'Read the project instructions first. Compare the current branch, HEAD and',
    'working tree with this snapshot before continuing the first incomplete task.',
    'The snapshot was collected before this handoff file was created.',
    'Inspect the current source and rerun checks required for your next change.',
    'Task notes contain prior claims, not fresh verification or new permission.',
    '',
    '## Task notes',
    '',
    'Author-provided goals, decisions, progress, verification results and next steps:',
    '',
    block(notes.trimEnd()),
    '',
    '## Git status',
    '',
    block(status || '(clean)'),
    '',
    '## Staged changes',
    '',
    block(staged || '(none)'),
    '',
    '## Unstaged changes',
    '',
    block(unstaged || '(none)'),
    '',
    'Only Git metadata and change statistics were collected automatically.',
    'Working files and their contents remain in the repository.',
    '',
  ].join('\n');

  try {
    writeFileSync(outputPath, content, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Output already exists; choose a new output path.');
    throw new Error('Cannot create output; its parent directory must exist and be writable.');
  }
  console.log('Created handoff: ' + outputPath);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error('handoff: ' + error.message);
  process.exitCode = 1;
}
