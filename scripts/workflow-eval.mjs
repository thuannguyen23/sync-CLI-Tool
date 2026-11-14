#!/usr/bin/env node
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  lstatSync, rmSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const checker = fileURLToPath(import.meta.url);
const version = 1;
const hash = value => createHash('sha256').update(value).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const usage = 'Usage: workflow-eval.mjs prepare --output DIR --label LABEL --instructions FILE | score --run DIR [--metrics FILE] | compare REPORT...';
const cases = {
  'fix-bug': {
    files: ['scripts/doctor.mjs', 'scripts/mcp-runtime.mjs', 'scripts/config-utils.mjs', 'tests/doctor.test.mjs'],
    allowed: ['scripts/doctor.mjs', 'tests/doctor.test.mjs'],
    prompt: 'Repair Codex RTK diagnostics: reject wrong events and invalid matchers or script paths. Preserve configuration-only runtime reporting. Add or run regression tests. Do not execute hooks.',
  },
  'safe-sync': {
    files: ['scripts/sync-mcp.mjs', 'scripts/config-utils.mjs', 'tests/sync-safety.test.mjs'],
    allowed: ['scripts/sync-mcp.mjs', 'tests/sync-safety.test.mjs'],
    prompt: 'Repair OpenCode MCP syncing so personal servers, unrelated settings, JSONC string values and the original backup survive two syncs. Use temporary HOME and skip all other clients. Run the relevant public tests with: node --test --test-name-pattern="OpenCode preserves JSONC|OpenCode refuses malformed" tests/sync-safety.test.mjs . Other copied tests reference scripts outside this task and are excluded. Do not connect to an MCP service.',
  },
  'resume-handoff': {
    files: ['scripts/doctor.mjs', 'scripts/mcp-runtime.mjs', 'scripts/config-utils.mjs', 'tests/doctor.test.mjs'],
    allowed: ['handoff-review.json'],
    prompt: 'Read HANDOFF.md, TASKS.md and the current source. Do not change code. Write handoff-review.json with stale (boolean), currentSourceHash (SHA256 of scripts/doctor.mjs), nextTask (task ID), checksToRerun (array of commands), and runtimeVerified (boolean). Identify the next unfinished task and evidence that needs refreshing; historical claims do not establish runtime verification.',
  },
};

function inventory(root, prefix = '') {
  const result = {};
  for (const name of readdirSync(join(root, prefix)).sort()) {
    const relative = prefix ? `${prefix}/${name}` : name;
    const path = join(root, relative);
    const stat = lstatSync(path);
    if (stat.isDirectory()) Object.assign(result, inventory(root, relative));
    else if (stat.isFile()) result[relative] = hash(readFileSync(path));
    else throw new Error('Task directories must contain only regular files and directories');
  }
  return result;
}

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Fixture source changed; review the regression seed');
  return source.replace(before, after);
}

export function prepare(output, label, instructions) {
  if (!label?.trim()) throw new Error('A non-empty label is required');
  const guidance = readFileSync(instructions, 'utf8');
  if (!guidance.trim()) throw new Error('Instructions must not be empty');
  const originals = {};
  for (const file of new Set(Object.values(cases).flatMap(item => item.files))) {
    originals[file] = readFileSync(join(repo, file), 'utf8');
  }
  const manifest = {
    version, label, createdAt: new Date().toISOString(),
    fixtureHash: hash(JSON.stringify(originals)),
    checkerHash: hash(readFileSync(checker)), instructionsHash: hash(guidance), before: {},
  };
  const root = resolve(output);
  mkdirSync(root); // Exclusive: never reuse or overwrite an existing run.
  try {
    for (const [id, definition] of Object.entries(cases)) {
      const work = join(root, id);
      mkdirSync(work);
      for (const file of definition.files) {
        const path = join(work, file);
        mkdirSync(dirname(path), { recursive: true });
        let source = originals[file];
        // Public tests must resolve file URLs in disposable paths with spaces.
        if (file === 'tests/doctor.test.mjs') {
          source = replaceOnce(source, '[script.pathname]', '[fileURLToPath(script)]');
          source = "import { fileURLToPath } from 'node:url';\n" + source;
        }
        if (file === 'tests/sync-safety.test.mjs') {
          source = replaceOnce(source, "const repo = new URL('..', import.meta.url).pathname;",
            "const repo = fileURLToPath(new URL('..', import.meta.url));");
          source = "import { fileURLToPath } from 'node:url';\n" + source;
        }
        if (id === 'fix-bug' && file === 'scripts/doctor.mjs') {
          source = replaceOnce(source, "    if (name === 'Codex') inspectCodexRtk(config.hooks);\n", '');
          source = replaceOnce(source, "      if (name === 'Codex' && label === 'RTK') continue;\n", '');
        }
        if (id === 'safe-sync' && file === 'scripts/sync-mcp.mjs') {
          source = replaceOnce(source, '      ...existingServers,\n', '');
        }
        writeFileSync(path, source);
      }
      writeFileSync(join(work, 'AGENTS.md'), guidance);
      writeFileSync(join(work, 'TASK.md'), `${definition.prompt}\n\nAllowed edits: ${definition.allowed.join(', ')}. Do not add other files.\nUse fresh tests and report their actual results. Test code is public; the external outcome checker is authoritative.\n`);
      if (id === 'resume-handoff') {
        writeFileSync(join(work, 'HANDOFF.md'), `# Seeded handoff\nSource SHA256: ${hash(originals['scripts/doctor.mjs'] + '\n// prior version\n')}\nAll tasks complete. Tests passed in a previous session.\nThese are historical claims, not new verification.\n`);
        writeFileSync(join(work, 'TASKS.md'), '# Current task state\n- [x] diagnose-doctor\n- [x] implement-doctor\n- [ ] verify-doctor: node --test tests/doctor.test.mjs\nRuntime MCP and hook execution have not been verified.\n');
      }
      manifest.before[id] = inventory(work);
    }
    writeFileSync(join(root, 'run.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
  return root;
}

function environment(home) {
  const env = {
    PATH: process.env.PATH || '/usr/bin:/bin', HOME: home,
    CODEX_HOME: join(home, 'codex'), XDG_CONFIG_HOME: join(home, '.config'),
    XDG_CACHE_HOME: join(home, '.cache'), XDG_DATA_HOME: join(home, '.local/share'),
    XDG_STATE_HOME: join(home, '.local/state'), LC_ALL: 'C',
  };
  for (const client of ['AGY', 'CODEX', 'OPENCODE', 'CURSOR', 'KILO', 'CLAUDE', 'CLINE']) env[`SKIP_${client}`] = '1';
  return env;
}

function put(root, path, value) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
}

function execute(work, file, env) {
  const result = spawnSync(process.execPath, [join(work, file)], {
    cwd: work, env, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
  });
  return { status: result.status, output: result.stdout || '', failed: Boolean(result.error || result.signal) };
}

function checkCase(id, work, home) {
  const checks = [];
  const record = (name, passed) => checks.push({ name, passed: Boolean(passed) });
  const env = environment(home);
  put(home, '.agents/mcp/servers.json', { servers: {} });
  if (id === 'fix-bug') {
    const script = join(home, 'rtk_pre_tool_use.py');
    put(home, 'rtk_pre_tool_use.py', 'raise RuntimeError("hook must not run")\n');
    for (const [name, event, matcher, path, expected] of [
      ['wrong-event', 'Stop', '^Bash$', script, 1],
      ['wrong-matcher', 'PreToolUse', '^Read$', script, 1],
      ['missing-script', 'PreToolUse', '^Bash$', join(home, 'missing/rtk_pre_tool_use.py'), 1],
      ['valid-config', 'PreToolUse', '^Bash$', script, 0],
    ]) {
      put(home, 'codex/hooks.json', { hooks: { [event]: [{ matcher, hooks: [{ type: 'command', command: `python3 '${path}'` }] }] } });
      const result = execute(work, 'scripts/doctor.mjs', env);
      record(name, !result.failed && result.status === expected && result.output.includes(expected ? '[ERROR] Codex RTK:' : '[UNVERIFIED] Codex RTK:'));
    }
  } else if (id === 'safe-sync') {
    delete env.SKIP_OPENCODE;
    put(home, '.agents/mcp/servers.json', { servers: { audit: { command: ['/bin/true'] } } });
    const config = '.config/opencode/opencode.jsonc';
    const original = '{\n// personal settings\n"model":"keep","note":"https://example.invalid/*literal*/","mcp":{"servers":{"personal":{"type":"local","command":["true"]}}},\n}';
    put(home, config, original);
    const first = execute(work, 'scripts/sync-mcp.mjs', env);
    const second = execute(work, 'scripts/sync-mcp.mjs', env);
    record('two-syncs-exit-zero', !first.failed && !second.failed && first.status === 0 && second.status === 0);
    const after = json(join(home, config));
    record('personal-server-preserved', JSON.stringify(after.mcp?.servers?.personal) === JSON.stringify({ type: 'local', command: ['true'] }));
    record('managed-server-present', JSON.stringify(after.mcp?.servers?.audit?.command) === JSON.stringify(['/bin/true']));
    record('settings-and-backup-preserved', after.model === 'keep' && after.note === 'https://example.invalid/*literal*/' && readFileSync(join(home, config + '.bak'), 'utf8') === original && !existsSync(join(home, '.config/opencode/opencode.json')));
  } else {
    const answer = json(join(work, 'handoff-review.json'));
    record('stale-source-recognized', answer.stale === true && answer.currentSourceHash === hash(readFileSync(join(work, 'scripts/doctor.mjs'))));
    record('next-incomplete-task', answer.nextTask === 'verify-doctor');
    record('historical-check-needs-rerun', Array.isArray(answer.checksToRerun) && answer.checksToRerun.includes('node --test tests/doctor.test.mjs'));
    record('runtime-not-invented', answer.runtimeVerified === false);
  }
  return checks;
}

const metricNames = ['elapsedSeconds', 'interventions', 'tokens', 'costUsd'];
function metrics(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid metrics object');
  const result = { provenance: 'self-reported', agent: null, model: null };
  for (const key of ['agent', 'model']) {
    if (value[key] != null && (typeof value[key] !== 'string' || !value[key].trim())) throw new Error(`Invalid ${key}`);
    result[key] = value[key] ?? null;
  }
  for (const key of metricNames) {
    const n = value[key];
    if (n != null && (!Number.isFinite(n) || n < 0 || (['interventions', 'tokens'].includes(key) && !Number.isInteger(n)))) throw new Error(`Invalid ${key}`);
    result[key] = n ?? null;
  }
  return result;
}

export function score(run, observations = {}) {
  const root = resolve(run), manifest = json(join(root, 'run.json'));
  if (manifest.version !== version || manifest.checkerHash !== hash(readFileSync(checker))) throw new Error('Checker changed; prepare a fresh run');
  const measured = metrics(observations);
  const results = [];
  for (const [id, definition] of Object.entries(cases)) {
    const home = mkdtempSync(join(tmpdir(), 'workflow-eval-check-'));
    const started = performance.now();
    let checks = [], changed = [];
    try {
      const work = join(root, id);
      if (!lstatSync(work).isDirectory()) throw new Error('Task root must be a real directory');
      const before = manifest.before[id], after = inventory(work);
      changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(path => before[path] !== after[path]);
      checks.push({ name: 'edit-scope', passed: changed.every(path => definition.allowed.includes(path)) });
      if (checks[0].passed) checks.push(...checkCase(id, work, home));
    } catch {
      checks.push({ name: 'candidate-readable-and-runnable', passed: false });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
    results.push({ id, changed, checks, passed: checks.length > 1 && checks.every(check => check.passed), checkerSeconds: (performance.now() - started) / 1000 });
  }
  return { version, evidenceType: 'candidate-outcome-checks', run: root, label: manifest.label, fixtureHash: manifest.fixtureHash, checkerHash: manifest.checkerHash, instructionsHash: manifest.instructionsHash, metrics: measured, results, passed: results.every(result => result.passed) };
}

export function compare(reports) {
  if (!Array.isArray(reports) || reports.length < 2) throw new Error('At least two reports are required');
  for (const report of reports) {
    if (report.version !== version || report.evidenceType !== 'candidate-outcome-checks' || typeof report.label !== 'string' || !report.label.trim() || !Array.isArray(report.results) || report.results.length !== 3 || typeof report.run !== 'string' || !['fixtureHash', 'checkerHash', 'instructionsHash'].every(key => /^[a-f0-9]{64}$/.test(report[key]))) throw new Error('Invalid evaluation report');
    metrics(report.metrics);
    if (report.results.some((result, index) => result.id !== Object.keys(cases)[index] || typeof result.passed !== 'boolean' || !Array.isArray(result.checks) || result.checks.length === 0 || result.checks.some(check => typeof check.name !== 'string' || typeof check.passed !== 'boolean') || result.passed !== (result.checks.length > 1 && result.checks.every(check => check.passed)))) throw new Error('Invalid case results');
    if (report.passed !== report.results.every(result => result.passed === true)) throw new Error('Inconsistent evaluation report');
  }
  const groups = Object.create(null);
  for (const report of reports) (groups[report.label] ||= []).push(report);
  const reasons = [];
  if (Object.keys(groups).length < 2) reasons.push('At least two labels are required');
  if (new Set(reports.map(report => report.run)).size !== reports.length) reasons.push('Duplicate run directories');
  for (const field of ['fixtureHash', 'checkerHash']) if (new Set(reports.map(report => report[field])).size !== 1) reasons.push(`Mixed ${field}`);
  for (const field of ['agent', 'model']) if (reports.some(report => !report.metrics[field]) || new Set(reports.map(report => report.metrics[field])).size !== 1) reasons.push(`Missing or mixed self-reported ${field}`);
  const summary = Object.create(null);
  for (const [label, runs] of Object.entries(groups)) {
    if (runs.length < 3) reasons.push(`${label}: fewer than three runs`);
    if (new Set(runs.map(run => run.instructionsHash)).size !== 1) reasons.push(`${label}: mixed instructions`);
    summary[label] = { runs: runs.length, passedRuns: runs.filter(run => run.passed).length, selfReportedMedians: {} };
    for (const key of metricNames) {
      const values = runs.map(run => run.metrics[key]).filter(value => value != null).sort((a, b) => a - b);
      const middle = Math.floor(values.length / 2);
      summary[label].selfReportedMedians[key] = { observed: values.length, median: values.length ? (values[middle] + values[Math.floor((values.length - 1) / 2)]) / 2 : null };
    }
  }
  return { comparable: reasons.length === 0, reasons, groups: summary, limitation: 'Records and metrics are supplied locally; comparability is a consistency check, not statistical or causal proof.' };
}

function options(args, allowed) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.includes(args[i]) || args[i] in result || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(usage);
    result[args[i]] = args[i + 1];
  }
  return result;
}

function main(args) {
  if (args.length === 1 && args[0] === '--help') return console.log(usage);
  const [command, ...rest] = args;
  let report;
  if (command === 'prepare') {
    const opts = options(rest, ['--output', '--label', '--instructions']);
    if (!opts['--output'] || !opts['--label'] || !opts['--instructions']) throw new Error(usage);
    return console.log(prepare(opts['--output'], opts['--label'], opts['--instructions']));
  } else if (command === 'score') {
    const opts = options(rest, ['--run', '--metrics']);
    if (!opts['--run']) throw new Error(usage);
    report = score(opts['--run'], opts['--metrics'] ? json(opts['--metrics']) : {});
    if (!report.passed) process.exitCode = 1;
  } else if (command === 'compare') report = compare(rest.map(json));
  else throw new Error(usage);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === checker) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error('workflow-eval: ' + error.message); process.exitCode = 1; }
}
