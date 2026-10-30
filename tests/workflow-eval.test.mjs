import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { prepare, score, compare } from '../scripts/workflow-eval.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'workflow-eval-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const guidance = join(root, 'guidance.md');
  writeFileSync(guidance, 'Use evidence and preserve scope.\n');
  const run = prepare(join(root, 'run with spaces'), 'baseline', guidance);
  return { root, guidance, run };
}

function repair(run) {
  for (const [id, file] of [['fix-bug', 'doctor.mjs'], ['safe-sync', 'sync-mcp.mjs']]) {
    copyFileSync(new URL(`../scripts/${file}`, import.meta.url), join(run, id, 'scripts', file));
  }
  const current = readFileSync(join(run, 'resume-handoff/scripts/doctor.mjs'));
  writeFileSync(join(run, 'resume-handoff/handoff-review.json'), JSON.stringify({
    stale: true, currentSourceHash: createHash('sha256').update(current).digest('hex'),
    nextTask: 'verify-doctor', checksToRerun: ['node --test tests/doctor.test.mjs'], runtimeVerified: false,
  }));
}

test('seeds actual regressions and refuses an existing output without changing it', t => {
  const f = fixture(t);
  const before = readFileSync(join(f.run, 'run.json'), 'utf8');
  assert.throws(() => prepare(f.run, 'other', f.guidance), /EEXIST/);
  assert.equal(readFileSync(join(f.run, 'run.json'), 'utf8'), before);
  const report = score(f.run);
  assert.equal(report.passed, false);
  assert.deepEqual(report.results.map(result => result.passed), [false, false, false]);
  assert.equal(report.metrics.elapsedSeconds, null);
  assert.equal(report.metrics.costUsd, null);
});

test('external checks accept repaired candidates and preserve their files', t => {
  const f = fixture(t);
  repair(f.run);
  const candidate = join(f.run, 'fix-bug/scripts/doctor.mjs');
  const before = readFileSync(candidate, 'utf8');
  const report = score(f.run, { agent: 'fixture', model: 'none', interventions: 0 });
  assert.equal(report.passed, true, JSON.stringify(report));
  assert.equal(readFileSync(candidate, 'utf8'), before);
  assert.equal(report.metrics.interventions, 0);
  assert.equal(report.metrics.tokens, null);
});

for (const [id, file, pattern] of [
  ['fix-bug', 'doctor.test.mjs', null],
  ['safe-sync', 'sync-safety.test.mjs', 'OpenCode preserves JSONC|OpenCode refuses malformed'],
]) {
  test(`public ${id} tests run from a prepared path containing spaces`, t => {
    const f = fixture(t);
    repair(f.run);
    const args = ['--test', '--test-reporter=tap'];
    if (pattern) args.push('--test-name-pattern=' + pattern);
    args.push('tests/' + file);
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, args, {
      cwd: join(f.run, id), env, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^# pass [1-9]\d*$/m);
  });
}

test('scope violations and symlinks fail without being accepted as repairs', t => {
  const f = fixture(t);
  repair(f.run);
  writeFileSync(join(f.run, 'fix-bug/AGENTS.md'), 'changed');
  symlinkSync(f.guidance, join(f.run, 'safe-sync/link'));
  const report = score(f.run);
  assert.equal(report.results[0].passed, false);
  assert.equal(report.results[0].checks[0].passed, false);
  assert.equal(report.results[1].passed, false);
  assert.equal(report.results[2].passed, true);
});

test('rejects invalid measurements and stale checker metadata', t => {
  const f = fixture(t);
  for (const value of [null, [], { tokens: -1 }, { interventions: 0.5 }, { elapsedSeconds: '10' }, { model: '' }]) {
    assert.throws(() => score(f.run, value), /Invalid/);
  }
  const path = join(f.run, 'run.json'), manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.checkerHash = '0'.repeat(64);
  writeFileSync(path, JSON.stringify(manifest));
  assert.throws(() => score(f.run), /Checker changed/);
});

test('source-anchor drift fails preparation and removes only the newly created run', async t => {
  const f = fixture(t);
  const source = join(f.root, 'changed-source');
  const paths = ['scripts/workflow-eval.mjs', 'scripts/doctor.mjs', 'scripts/sync-mcp.mjs', 'scripts/config-utils.mjs', 'tests/doctor.test.mjs', 'tests/sync-safety.test.mjs'];
  for (const path of paths) {
    mkdirSync(dirname(join(source, path)), { recursive: true });
    copyFileSync(new URL('../' + path, import.meta.url), join(source, path));
  }
  writeFileSync(join(source, 'scripts/doctor.mjs'), '// incompatible fixture source\n');
  const module = await import(pathToFileURL(join(source, 'scripts/workflow-eval.mjs')).href);
  const output = join(f.root, 'drift-run');
  assert.throws(() => module.prepare(output, 'drift', f.guidance), /Fixture source changed/);
  assert.equal(existsSync(output), false);
  assert.equal(readFileSync(join(source, 'scripts/doctor.mjs'), 'utf8'), '// incompatible fixture source\n');
});

test('comparison requires repetitions and consistent fixtures, instructions and model', t => {
  const f = fixture(t);
  repair(f.run);
  const base = score(f.run, { agent: 'fixture', model: 'none', elapsedSeconds: 10 });
  const reports = ['baseline', 'candidate'].flatMap(label => [1, 2, 3].map(n => ({
    ...structuredClone(base), label, run: `/fixture/${label}-${n}`,
  })));
  assert.equal(compare(reports).comparable, true);
  assert.equal(compare(reports).groups.baseline.selfReportedMedians.tokens.median, null);
  assert.equal(compare(reports.slice(0, 2)).comparable, false);
  const changed = structuredClone(reports);
  changed[0].fixtureHash = '0'.repeat(64);
  changed[1].metrics.model = 'other';
  changed[2].instructionsHash = '0'.repeat(64);
  const result = compare(changed);
  assert.equal(result.comparable, false);
  assert.ok(result.reasons.some(reason => reason.includes('fixtureHash')));
  assert.ok(result.reasons.some(reason => reason.includes('model')));
  assert.ok(result.reasons.some(reason => reason.includes('instructions')));
  assert.throws(() => compare([{ label: 'fake' }, base]), /Invalid evaluation report/);
});

test('CLI help works and incomplete arguments fail without creating a run', t => {
  const script = new URL('../scripts/workflow-eval.mjs', import.meta.url);
  const help = spawnSync(process.execPath, [script.pathname, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /prepare.*score.*compare/);
  const bad = spawnSync(process.execPath, [script.pathname, 'prepare', '--label', 'baseline'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Usage:/);
});
