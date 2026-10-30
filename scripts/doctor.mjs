#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';

const home = homedir();
const agentsDir = join(home, '.agents');
const codexDir = resolve(process.env.CODEX_HOME || join(home, '.codex'));
const results = [];

function report(status, subject, detail) {
  results.push({ status, subject, detail });
}

function readObject(path, subject) {
  if (!existsSync(path)) {
    report('UNVERIFIED', subject, `File not found: ${path}`);
    return null;
  }

  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Expected an object');
    }
    return value;
  } catch {
    report('ERROR', subject, `Cannot read a valid JSON object: ${path}`);
    return null;
  }
}

function inspectMcp() {
  const path = join(agentsDir, 'mcp', 'servers.json');
  const config = readObject(path, 'MCP catalog');
  if (!config) return;

  const servers = config.servers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    report('ERROR', 'MCP catalog', 'Expected a servers object');
    return;
  }

  for (const [name, server] of Object.entries(servers)) {
    if (!server || typeof server !== 'object' || Array.isArray(server)) {
      report('ERROR', `MCP ${name}`, 'Server configuration must be an object');
      continue;
    }

    if (typeof server.url === 'string' && server.url.trim()) {
      if (server.url.includes('${')) {
        report('UNVERIFIED', `MCP ${name}`, 'URL contains a placeholder; connection not tested');
        continue;
      }

      try {
        const url = new URL(server.url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol');
        report('UNVERIFIED', `MCP ${name}`, 'HTTP URL is valid; connection not tested');
      } catch {
        report('ERROR', `MCP ${name}`, 'Invalid HTTP URL');
      }
      continue;
    }

    if (
      Array.isArray(server.command) &&
      server.command.length > 0 &&
      server.command.every(value => typeof value === 'string' && value.length > 0)
    ) {
      report('UNVERIFIED', `MCP ${name}`, 'Command is configured; server not started');
    } else {
      report('ERROR', `MCP ${name}`, 'Expected an HTTP URL or a non-empty command array');
    }
  }
}

function inspectSkills() {
  const source = join(agentsDir, 'skills');
  if (!existsSync(source)) {
    report('UNVERIFIED', 'Skills', `Source directory not found: ${source}`);
    return;
  }

  let skills;
  try {
    skills = readdirSync(source, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && existsSync(join(source, entry.name, 'SKILL.md')))
      .map(entry => entry.name);
  } catch {
    report('ERROR', 'Skills', `Cannot read source directory: ${source}`);
    return;
  }

  const targets = [
    ['AGY Global', join(home, '.gemini', 'config', 'skills')],
    ['AGY CLI', join(home, '.gemini', 'antigravity-cli', 'skills')],
    ['AGY IDE', join(home, '.gemini', 'antigravity-ide', 'skills')],
    ['AGY App', join(home, '.gemini', 'antigravity', 'skills')],
    ['Codex default', join(home, '.codex', 'skills')],
    ['Codex active', join(codexDir, 'skills')],
    ['Claude Code', join(home, '.claude', 'skills')],
    ['Cline', join(home, '.cline', 'skills')],
    ['OpenCode', join(home, '.config', 'opencode', 'skills')],
    ['Cursor CLI', join(home, '.cursor', 'skills')],
  ];

  const visited = new Set();
  for (const [name, target] of targets) {
    if (visited.has(target) || !existsSync(target)) continue;
    visited.add(target);

    for (const skill of skills) {
      const destination = join(target, skill);
      const subject = `Skill ${name}/${skill}`;

      try {
        const stat = lstatSync(destination);
        if (!stat.isSymbolicLink()) {
          report('UNVERIFIED', subject, 'An unmanaged entry occupies this path');
        } else if (!existsSync(destination)) {
          report('ERROR', subject, 'Broken symlink');
        } else if (realpathSync(destination) !== realpathSync(join(source, skill))) {
          report('UNVERIFIED', subject, 'Symlink points to a different source');
        } else {
          report('OK', subject, 'Symlink points to the configured skill');
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          report('UNVERIFIED', subject, 'Skill is not linked in this directory');
        } else {
          report('ERROR', subject, 'Cannot inspect skill path');
        }
      }
    }
  }

  if (visited.size === 0) {
    report('UNVERIFIED', 'Skills', 'No supported skill target directory found');
  }
}

function commandsIn(value) {
  if (Array.isArray(value)) return value.flatMap(commandsIn);
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, child]) =>
    key === 'command' && typeof child === 'string' ? [child] : commandsIn(child),
  );
}

function inspectCodexRtk(hooks) {
  const subject = 'Codex RTK';
  let found = false;
  for (const [event, groups] of Object.entries(hooks || {})) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!Array.isArray(group?.hooks)) continue;
      for (const hook of group.hooks) {
        if (typeof hook?.command !== 'string' || !hook.command.includes('rtk_pre_tool_use.py')) continue;
        found = true;
        if (event !== 'PreToolUse') {
          report('ERROR', subject, 'RTK hook must use PreToolUse');
          continue;
        }
        if (hook.type !== undefined && hook.type !== 'command') {
          report('ERROR', subject, 'RTK hook must have command type');
          continue;
        }
        try {
          if (group.matcher !== undefined &&
              (typeof group.matcher !== 'string' || !new RegExp(group.matcher).test('Bash'))) {
            report('ERROR', subject, 'RTK matcher does not match Bash');
            continue;
          }
        } catch {
          report('ERROR', subject, 'RTK matcher is invalid');
          continue;
        }
        // Parse only a direct python3 invocation; never evaluate shell syntax.
        const match = hook.command.match(/^python3\s+(?:'([^']+)'|"([^"$`\\]+)"|([^\s'"$`\\;|&<>]+))\s*$/);
        const scriptPath = match && (match[1] ?? match[2] ?? match[3]);
        if (!scriptPath || !isAbsolute(scriptPath) || basename(scriptPath) !== 'rtk_pre_tool_use.py') {
          report('UNVERIFIED', subject, 'RTK command path cannot be checked statically; execution not tested');
          continue;
        }
        try {
          if (!statSync(scriptPath).isFile()) {
            report('ERROR', subject, 'RTK script is not a regular file');
            continue;
          }
        } catch (error) {
          report('ERROR', subject, error.code === 'ENOENT'
            ? 'RTK script does not exist' : 'Cannot inspect RTK script');
          continue;
        }
        report('UNVERIFIED', subject, 'RTK event, matcher and script file checked; execution not tested');
      }
    }
  }
  if (!found) report('UNVERIFIED', subject, 'Hook command not found');
}

function inspectHooks() {
  const targets = [
    ['Codex', join(codexDir, 'hooks.json'), 'rtk_pre_tool_use.py'],
    ['Cursor', join(home, '.cursor', 'hooks.json'), 'rtk hook cursor'],
    ['Claude Code', join(home, '.claude', 'settings.json'), 'rtk hook claude'],
  ];

  for (const [name, path, rtkIdentifier] of targets) {
    if (!existsSync(path)) continue;
    const config = readObject(path, `${name} hooks`);
    if (!config) continue;

    if (name === 'Codex') inspectCodexRtk(config.hooks);
    const commands = commandsIn(config.hooks);
    for (const [label, identifier] of [
      ['RTK', rtkIdentifier],
      ['context-mode', 'context-mode hook'],
    ]) {
      if (name === 'Codex' && label === 'RTK') continue;
      const found = commands.some(command => command.includes(identifier));
      report(
        'UNVERIFIED',
        `${name} ${label}`,
        found ? 'Hook command is configured; execution not tested' : 'Hook command not found',
      );
    }
  }

  report('UNVERIFIED', 'Other clients', 'Hook adapters are not inspected by this version');
}

inspectMcp();
inspectSkills();
inspectHooks();

for (const { status, subject, detail } of results) {
  console.log(`[${status}] ${subject}: ${detail}`);
}

if (results.some(result => result.status === 'ERROR')) {
  process.exitCode = 1;
}
