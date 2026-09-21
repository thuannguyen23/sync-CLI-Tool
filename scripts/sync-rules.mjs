#!/usr/bin/env node
/**
 * sync-rules.mjs — Distribute rules/AGENTS.md and rules/CLAUDE.md to all agent environments.
 */

import { existsSync, mkdirSync, lstatSync, unlinkSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const ROOT = join(import.meta.dirname, '..');
const AGENTS_MD = join(ROOT, 'rules', 'AGENTS.md');
const CLAUDE_MD = join(ROOT, 'rules', 'CLAUDE.md');

const targets = [
  { name: 'AGY Global', dest: join(HOME, '.gemini', 'config', 'AGENTS.md'), src: AGENTS_MD },
  { name: 'AGY CLI', dest: join(HOME, '.gemini', 'antigravity-cli', 'AGENTS.md'), src: AGENTS_MD },
  { name: 'AGY IDE', dest: join(HOME, '.gemini', 'antigravity-ide', 'AGENTS.md'), src: AGENTS_MD },
  { name: 'AGY App', dest: join(HOME, '.gemini', 'antigravity', 'AGENTS.md'), src: AGENTS_MD },
  { name: 'Codex', dest: join(HOME, '.codex', 'AGENTS.md'), src: AGENTS_MD },
  { name: 'OpenCode', dest: join(HOME, '.config', 'opencode', 'AGENTS.md'), src: AGENTS_MD },
  { name: 'Kilo', dest: join(HOME, '.config', 'kilo', 'AGENTS.md'), src: AGENTS_MD },
  { name: 'Cline', dest: join(HOME, '.cline', 'rules', 'AGENTS.md'), src: AGENTS_MD },
  { name: 'Claude Code', dest: join(HOME, '.claude', 'CLAUDE.md'), src: existsSync(CLAUDE_MD) ? CLAUDE_MD : AGENTS_MD },
];

export function syncRules() {
  let synced = 0;
  for (const { name, dest, src } of targets) {
    if (!existsSync(src)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    try {
      const stat = lstatSync(dest);
      if (stat.isSymbolicLink() || stat.isFile()) unlinkSync(dest);
    } catch {}
    symlinkSync(src, dest);
    synced++;
  }
  console.log(`✅ Rules synchronized: ${synced} platforms received AGENTS.md / CLAUDE.md.`);
  return { synced };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  syncRules();
}
