import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../scripts/beads-workflow.mjs', import.meta.url));
const manifest = { schemaVersion: 1, tracker: { provider: 'beads', coordination: 'serialized', minimumVersion: '1.3.4' } };

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'beads-bridge-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project with spaces');
  const bin = join(root, 'bin');
  mkdirSync(project); mkdirSync(bin);
  const log = join(root, 'calls.jsonl');
  const env = {
    PATH: bin + ':' + process.env.PATH, HOME: root,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    BEADS_DIR: '/wrong-project', BEADS_DOLT_SERVER_DATABASE: 'wrong', BD_DOLT_SERVER_DATABASE: 'wrong',
    BEADS_DB: '/wrong-db', BD_TEST_LOG: log,
  };
  const git = (...args) => spawnSync('git', ['-C', project, ...args], { env, encoding: 'utf8' });
  assert.equal(git('init', '--quiet').status, 0);
  const fake = join(bin, 'bd');
  writeFileSync(fake, '#!' + process.execPath + '\n' + `
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_BD_LOG, JSON.stringify({args, cwd:process.cwd(), env:process.env})+'\\n');
if(args.includes('version')) console.log(process.env.TEST_VERSION || 'bd version 1.3.4');
else if(process.env.TEST_FAIL) { console.error('fixture failure'); process.exit(2); }
else if(args.includes('ready')) console.log(process.env.TEST_READY || '[{"id":"demo-a.1","title":"Task","status":"open","priority":1,"assignee":"owner","description":"SECRET-DESCRIPTION"}]');
else console.log(JSON.stringify(args));
`, { mode: 0o700 });
  env.TEST_BD_LOG = log;
  function run(args, extra = {}) {
    return spawnSync(process.execPath, [script, args[0], '--project', project, ...args.slice(1)], {
      cwd: root, env: { ...env, ...extra }, encoding: 'utf8', timeout: 15_000,
    });
  }
  function enable() {
    mkdirSync(join(project, '.beads'), { recursive: true });
    writeFileSync(join(project, '.agent-workflow.json'), JSON.stringify(manifest));
  }
  const calls = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [];
  return { root, project, bin, env, fake, log, git, run, enable, calls };
}

test('disabled project does not call bd or create project files', t => {
  const f = fixture(t);
  const result = f.run(['inspect', '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'DISABLED');
  assert.deepEqual(f.calls(), []);
  assert.equal(existsSync(join(f.project, '.agent-workflow.json')), false);
  assert.equal(existsSync(join(f.project, '.beads')), false);
});

test('available bridge pins cwd/env and ready strips descriptions', t => {
  const f = fixture(t); f.enable();
  const result = f.run(['ready', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'AVAILABLE');
  assert.deepEqual(output.tasks, [{ id: 'demo-a.1', title: 'Task', status: 'open', priority: 1, assignee: 'owner' }]);
  assert.doesNotMatch(result.stdout, /SECRET-DESCRIPTION/);
  for (const call of f.calls()) {
    assert.equal(call.cwd, f.project);
    assert.equal(call.env.BEADS_DIR, join(f.project, '.beads'));
    assert.equal(call.env.BEADS_DOLT_SERVER_DATABASE, undefined);
    assert.equal(call.env.BD_DOLT_SERVER_DATABASE, undefined);
    assert.equal(call.env.BEADS_DB, undefined);
    assert.equal(call.env.BD_NO_HOOKS, '1');
    assert.equal(call.env.BD_BACKUP_ENABLED, 'false');
    assert.equal(call.env.BD_EVENTS_JOURNAL_AUTO_PRUNE, 'false');
    assert.ok(call.args.includes('--readonly'));
    assert.ok(call.args.includes('--sandbox'));
  }
});

test('missing workspace, missing CLI, old/prerelease CLI return fallback without enable', t => {
  const f = fixture(t); f.enable();
  rmSync(join(f.project, '.beads'), { recursive: true });
  assert.equal(JSON.parse(f.run(['inspect', '--json']).stdout).status, 'FALLBACK');
  mkdirSync(join(f.project, '.beads'));
  for (const version of ['bd version 1.3.3', 'bd version 1.3.4-rc.1', 'unparseable']) {
    const r = f.run(['inspect', '--json'], { TEST_VERSION: version });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).status, 'FALLBACK');
  }
  rmSync(f.fake);
  // Keep only Git available; do not discover a user's real bd later on PATH.
  const gitPath = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  symlinkSync(gitPath, join(f.bin, 'git'));
  const r = f.run(['inspect', '--json'], { PATH: f.bin });
  assert.equal(JSON.parse(r.stdout).status, 'FALLBACK');
});

test('enable preview writes nothing; apply creates private manifest once', t => {
  const f = fixture(t); mkdirSync(join(f.project, '.beads'));
  let r = f.run(['enable', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).applied, false);
  const path = join(f.project, '.agent-workflow.json');
  assert.equal(existsSync(path), false);
  r = f.run(['enable', '--apply', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(path)), manifest);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const before = readFileSync(path);
  r = f.run(['enable', '--apply', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readFileSync(path), before);
  assert.equal(f.git('status', '--porcelain').stdout.trim(), '?? .agent-workflow.json');
});

test('enable cannot create manifest for unavailable or failing database', t => {
  const f = fixture(t); mkdirSync(join(f.project, '.beads'));
  for (const extra of [{ TEST_VERSION: 'bd version 0.9.0' }, { TEST_FAIL: '1' }, { TEST_READY: 'not-json' }]) {
    const r = f.run(['enable', '--apply', '--json'], extra);
    assert.equal(r.status, 1);
    assert.equal(existsSync(join(f.project, '.agent-workflow.json')), false);
  }
});

test('manifest schema errors, large input and symlinks fail before bd', t => {
  const f = fixture(t); f.enable();
  const path = join(f.project, '.agent-workflow.json');
  for (const value of ['{', 'null', '[]', JSON.stringify({ ...manifest, shell: 'bad' }),
    JSON.stringify({ ...manifest, tracker: { ...manifest.tracker, minimumVersion: '0.1.0' } }), ' '.repeat(17000)]) {
    writeFileSync(path, value);
    assert.equal(f.run(['inspect', '--json']).status, 1);
    assert.equal(readFileSync(path, 'utf8'), value);
  }
  rmSync(path); symlinkSync(join(f.root, 'missing'), path);
  assert.equal(f.run(['enable', '--apply']).status, 1);
  assert.deepEqual(f.calls(), []);
});

test('workspace symlink or redirect refuses cross-project access', t => {
  const f = fixture(t); f.enable();
  rmSync(join(f.project, '.beads'), { recursive: true });
  const outside = join(f.root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(f.project, '.beads'));
  assert.equal(f.run(['inspect']).status, 1);
  rmSync(join(f.project, '.beads')); mkdirSync(join(f.project, '.beads'));
  writeFileSync(join(f.project, '.beads', 'redirect'), outside);
  assert.equal(f.run(['inspect']).status, 1);
  assert.deepEqual(f.calls(), []);
});

test('malformed ready results or failed bd are errors, never an empty queue', t => {
  const f = fixture(t); f.enable();
  for (const data of ['bad-json', '{}', '[{}]', '[{"id":"--global","title":"bad"}]',
    '[{"id":["demo-1"],"title":"bad"}]']) {
    const r = f.run(['ready', '--json'], { TEST_READY: data });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ready/i);
  }
  const r = f.run(['ready', '--json'], { TEST_FAIL: '1' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /fixture failure/);
});

test('write preflight rejects failed database probe without sending mutation', t => {
  const f = fixture(t); f.enable();
  const r = spawnSync(process.execPath, [script, 'run', '--project', f.project, '--allow-write', '--', 'close', 'demo-1'], {
    env: { ...f.env, TEST_READY: 'malformed' }, encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.equal(f.calls().some(call => call.args.includes('close')), false);
});

test('subdirectory selection resolves Git root despite inherited Git selectors', t => {
  const f = fixture(t); f.enable();
  const child = join(f.project, 'child $(touch PWNED)'); mkdirSync(child);
  const r = spawnSync(process.execPath, [script, 'ready', '--project', child, '--json'], {
    env: { ...f.env, GIT_DIR: '/missing', GIT_WORK_TREE: '/wrong' }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).project, f.project);
  assert.ok(f.calls().every(call => call.cwd === f.project));
  assert.equal(existsSync(join(f.project, 'PWNED')), false);
});

test('ready bounds queue and title output', t => {
  const f = fixture(t); f.enable();
  const tasks = Array.from({ length: 55 }, (_, i) => ({ id: `demo-${i}`, title: 'T'.repeat(1000) }));
  const r = f.run(['ready', '--json'], { TEST_READY: JSON.stringify(tasks) });
  assert.equal(r.status, 0, r.stderr);
  const output = JSON.parse(r.stdout);
  assert.equal(output.tasks.length, 50);
  assert.equal(output.truncated, true);
  assert.equal(output.tasks[0].title.length, 500);
});

test('read command grammar rejects mutation flags and workspace overrides before bd', t => {
  const f = fixture(t); f.enable();
  for (const native of [
    ['ready', '--claim'], ['show', 'demo-1', '--db', '/other'], ['--global', 'show', 'demo-1'],
    ['init'], ['sync'], ['delete', 'demo-1'], ['setup'], ['dolt', 'push'],
    ['dep', 'add', 'demo-1', 'demo-2'], ['update', 'demo-1', '--claim'],
    ['prime', '--exec', 'bad'], ['show', '--global'],
  ]) {
    const r = f.run(['run', '--', ...native]);
    assert.equal(r.status, 1, JSON.stringify(native));
  }
  assert.deepEqual(f.calls(), []);
});

test('allowed reads execute readonly; explicit writes pass literal arguments without shell', t => {
  const f = fixture(t); f.enable();
  // run native arguments must be last; project options belong before --.
  const run = (...native) => spawnSync(process.execPath,
    [script, 'run', '--project', f.project, ...native],
    { env: f.env, cwd: f.root, encoding: 'utf8' });
  for (const native of [['prime'], ['show', 'demo-1', '--json'], ['dep', 'tree', 'demo-1']]) {
    const r = run('--', ...native); assert.equal(r.status, 0, r.stderr);
    assert.ok(f.calls().at(-1).args.includes('--readonly'));
  }
  const text = 'literal $(touch PWNED); `touch PWNED`';
  for (const native of [['update', 'demo-1', '--claim'], ['create', text], ['remember', text],
    ['dep', 'add', 'demo-1', 'demo-2'], ['dep', 'remove', 'demo-1', 'demo-2'], ['close', 'demo-1']]) {
    const r = run('--allow-write', '--', ...native); assert.equal(r.status, 0, r.stderr);
    const call = f.calls().at(-1);
    assert.equal(call.args.includes('--readonly'), false);
    assert.deepEqual(call.args, ['--sandbox', ...native]);
  }
  const r = run('--allow-write', '--', 'sync'); assert.equal(r.status, 1);
  assert.equal(existsSync(join(f.project, 'PWNED')), false);
});

test('rejects invalid CLI input and non-Git project without writes', t => {
  const f = fixture(t);
  for (const args of [[], ['unknown'], ['inspect', '--apply'], ['inspect', '--json', '--json'], ['run']]) {
    assert.equal(f.run(args).status, 1);
  }
  const r = spawnSync(process.execPath, [script, 'inspect', '--project', f.root], { env: f.env, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.deepEqual(f.calls(), []);
});
