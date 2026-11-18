#!/usr/bin/env node

import { constants, lstatSync, openSync, fstatSync, readFileSync, closeSync, writeFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const usage = 'Usage: node scripts/beads-workflow.mjs <inspect|ready|enable|run> [--project <directory>] [--json] [--apply] [--allow-write] [-- <bd arguments>]';
const minimumVersion = '1.3.4';
const defaultManifest = { schemaVersion: 1, tracker: { provider: 'beads', coordination: 'serialized', minimumVersion } };
const issueId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}-[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;

function stat(path) {
  try { return lstatSync(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function environment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(BEADS_|BD_|DOLT_|GIT_)/.test(key)) delete env[key];
  }
  return env;
}

function projectRoot(path) {
  const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', resolve(path), 'rev-parse', '--show-toplevel'], {
    env: environment(), encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) throw new Error('Cannot inspect Git project; check --project and Git installation.');
  return realpathSync(result.stdout.trimEnd());
}

function validVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  return major > 1 || (major === 1 && (minor > 3 || (minor === 3 && patch >= 4)));
}

function readManifest(path) {
  const entry = stat(path);
  if (!entry) return null;
  if (!entry.isFile() || entry.size > 16_384) throw new Error('Unsafe or oversized workflow manifest.');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let value;
  try {
    const current = fstatSync(fd);
    if (!current.isFile() || current.size > 16_384) throw new Error('Unsafe workflow manifest.');
    value = JSON.parse(readFileSync(fd, 'utf8'));
  } catch {
    throw new Error('Invalid workflow manifest JSON or unsafe file.');
  } finally { closeSync(fd); }
  const keysAre = (object, keys) => object && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
  if (!keysAre(value, ['schemaVersion', 'tracker']) || value.schemaVersion !== 1
    || !keysAre(value.tracker, ['provider', 'coordination', 'minimumVersion'])
    || value.tracker.provider !== 'beads' || value.tracker.coordination !== 'serialized'
    || typeof value.tracker.minimumVersion !== 'string' || !validVersion(value.tracker.minimumVersion)) {
    throw new Error('Unsupported workflow manifest schema; expected Beads serialized tracking and minimumVersion >=1.3.4.');
  }
  return value;
}

function bd(project, args, readOnly = true) {
  const env = environment();
  env.BEADS_DIR = join(project, '.beads');
  env.BD_NO_HOOKS = '1';
  env.BD_BACKUP_ENABLED = 'false';
  env.BD_EVENTS_JOURNAL_AUTO_PRUNE = 'false';
  return spawnSync('bd', ['--sandbox', ...(readOnly ? ['--readonly'] : []), ...args], {
    cwd: project, env, encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024,
  });
}

function checked(result, command) {
  if (result.status !== 0) {
    throw new Error(`bd ${command} failed: ${result.error?.message || result.stderr.trim() || 'nonzero exit'}`);
  }
  return result.stdout;
}

function workspace(project, requiredVersion) {
  const directory = join(project, '.beads');
  const entry = stat(directory);
  if (!entry) return { status: 'FALLBACK', reason: 'No initialized project .beads workspace.' };
  if (!entry.isDirectory() || realpathSync(directory) !== directory || stat(join(directory, 'redirect'))) {
    throw new Error('Unsafe Beads workspace: symlinks and redirects are not supported.');
  }
  const result = bd(project, ['version']);
  if (result.error?.code === 'ENOENT') return { status: 'FALLBACK', reason: 'bd CLI is not installed.' };
  const text = checked(result, 'version').trim();
  const version = /\b(\d+\.\d+\.\d+)(?=\s|$)/.exec(text)?.[1];
  if (!version || !validVersion(version)) return { status: 'FALLBACK', reason: `Requires stable bd >=${requiredVersion}.` };
  const actual = version.split('.').map(Number);
  const required = requiredVersion.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (actual[i] < required[i]) return { status: 'FALLBACK', reason: `Requires bd >=${requiredVersion}.` };
    if (actual[i] > required[i]) break;
  }
  return { status: 'AVAILABLE', version };
}

function ready(project) {
  const text = checked(bd(project, ['ready', '--json', '--limit', '50']), 'ready');
  let tasks;
  try { tasks = JSON.parse(text); } catch { throw new Error('Invalid bd ready JSON.'); }
  if (!Array.isArray(tasks) || tasks.some(task => !task || typeof task.id !== 'string' || !issueId.test(task.id)
    || typeof task.title !== 'string')) throw new Error('Invalid bd ready task schema.');
  return {
    count: Math.min(tasks.length, 50),
    // A full page may have more tasks; never claim this is an exact total.
    truncated: tasks.length >= 50,
    tasks: tasks.slice(0, 50).map(task => ({
      id: task.id, title: task.title.slice(0, 500),
      ...(typeof task.status === 'string' ? { status: task.status.slice(0, 40) } : {}),
      ...(Number.isInteger(task.priority) ? { priority: task.priority } : {}),
      ...(typeof task.assignee === 'string' ? { assignee: task.assignee.slice(0, 100) } : {}),
    })),
  };
}

// Exact command/flag grammar prevents global flags or read commands carrying writes.
function nativeCommand(args, allowWrite) {
  const [command, ...tail] = args;
  const id = value => typeof value === 'string' && value.length <= 162 && issueId.test(value);
  const jsonTail = values => !values.length || (values.length === 1 && values[0] === '--json');
  if (command === 'prime' && tail.length === 0) return true;
  if (['show', 'ready'].includes(command)) {
    if (command === 'ready' && jsonTail(tail)) return true;
    if (command === 'show' && id(tail[0]) && jsonTail(tail.slice(1))) return true;
  }
  if (command === 'dep' && tail[0] === 'tree' && id(tail[1]) && jsonTail(tail.slice(2))) return true;
  let allowed = false;
  if (command === 'dep' && ['add', 'remove'].includes(tail[0]) && tail.length === 3 && tail.slice(1).every(id)) allowed = true;
  if (command === 'remember' && tail.length === 1 && tail[0] && !tail[0].startsWith('-')) allowed = true;
  if (['create', 'update', 'close'].includes(command)) {
    const first = tail[0];
    const validFirst = command === 'create' ? first && !first.startsWith('-') : id(first);
    const values = {
      create: ['--type', '--priority', '--parent', '--description', '--assignee'],
      update: ['--status', '--assignee', '--title', '--description', '--priority'],
      close: ['--reason'],
    }[command];
    allowed = !!validFirst;
    const seen = new Set();
    for (let i = 1; allowed && i < tail.length; i++) {
      const flag = tail[i];
      if (seen.has(flag)) { allowed = false; break; }
      seen.add(flag);
      if (flag === '--json' || (command === 'update' && flag === '--claim')) continue;
      if (!values.includes(flag) || !tail[i + 1] || tail[i + 1].startsWith('-')) { allowed = false; break; }
      if (flag === '--parent' && !id(tail[i + 1])) { allowed = false; break; }
      i++;
    }
  }
  if (!allowed) throw new Error('Unsupported bd command or flags; use a separately reviewed manual invocation.');
  if (!allowWrite) throw new Error('Beads mutation requires --allow-write and separate task authorization.');
  return false;
}

function main(args) {
  if (args.length === 1 && args[0] === '--help') { console.log(usage); return; }
  const [command, ...rest] = args;
  if (!['inspect', 'ready', 'enable', 'run'].includes(command)) throw new Error(usage);
  const options = new Map();
  let native = [];
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (key === '--' && command === 'run') { native = rest.slice(i + 1); break; }
    if (!['--project', '--json', '--apply', '--allow-write'].includes(key) || options.has(key)) throw new Error(usage);
    if (key === '--project') {
      const value = rest[++i];
      if (!value || value.startsWith('--')) throw new Error(usage);
      options.set(key, value);
    } else options.set(key, true);
  }
  if ((options.has('--apply') && command !== 'enable') || (options.has('--allow-write') && command !== 'run')
    || (options.has('--json') && command === 'run')) throw new Error(usage);
  const readOnly = command === 'run' ? nativeCommand(native, options.has('--allow-write')) : true;
  const project = projectRoot(options.get('--project') || process.cwd());
  const path = join(project, '.agent-workflow.json');
  const manifest = readManifest(path);
  let result;
  if (!manifest && command !== 'enable') {
    result = { status: 'DISABLED', project, reason: 'Project has no .agent-workflow.json opt-in.' };
  } else {
    result = { ...workspace(project, manifest?.tracker.minimumVersion || minimumVersion), project };
    if (result.status === 'AVAILABLE') {
      if (command === 'ready') Object.assign(result, ready(project));
      if (command === 'enable') {
        ready(project); // Strict read-only DB probe before any manifest creation.
        if (!manifest && options.has('--apply')) {
          writeFileSync(path, JSON.stringify(defaultManifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        }
        Object.assign(result, { applied: !manifest && options.has('--apply'), alreadyEnabled: !!manifest, manifest: manifest || defaultManifest });
      }
      if (command === 'run') {
        if (!readOnly) ready(project); // Fail closed before handing a mutation to bd.
        process.stdout.write(checked(bd(project, native, readOnly), native[0]));
        return;
      }
    } else if (command === 'enable' && options.has('--apply')) {
      throw new Error(result.reason);
    }
  }
  if (command === 'run' && result.status !== 'AVAILABLE') throw new Error(`${result.status}: ${result.reason}`);
  console.log(options.has('--json') ? JSON.stringify(result) : `${result.status}: ${JSON.stringify(result)}`);
}

try { main(process.argv.slice(2)); } catch (error) {
  console.error('beads-workflow: ' + error.message);
  process.exitCode = 1;
}
