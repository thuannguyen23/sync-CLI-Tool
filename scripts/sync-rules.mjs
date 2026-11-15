#!/usr/bin/env node
/**
 * sync-rules.mjs — Distribute the shared policy to Codex, Antigravity and OpenCode.
 */

import { existsSync, mkdirSync, lstatSync, unlinkSync, symlinkSync, readlinkSync, realpathSync, readFileSync, copyFileSync, chmodSync, constants } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { backupFile } from './config-utils.mjs';

import { selectedAgentPaths } from './agent-paths.mjs';

const HOME = homedir();
const ROOT = join(import.meta.dirname, '..');
const AGENTS_MD = join(ROOT, 'rules', 'AGENTS.md');
const LEGACY_WORKFLOW_MD = join(ROOT, 'rules', 'WORKFLOW.md');
// Only this exact obsolete, standalone upstream-generated file is migrated.
// Modified files and files containing personal instructions are never removed.
const LEGACY_CONTEXT_RULE_HASH = '7e18f3598fc47c27a6113dfd02a96c5035bcce54d2e28a3568cdb0796151b4d2';
function migrateLegacyContextRule() {
  const file = join(HOME, '.gemini', 'GEMINI.md');
  if (!existsSync(file) || !lstatSync(file).isFile()) return;
  const contents = readFileSync(file);
  if (createHash('sha256').update(contents).digest('hex') !== LEGACY_CONTEXT_RULE_HASH) return;
  const backup = file + '.legacy-context-mode.bak';
  try { copyFileSync(file, backup, constants.COPYFILE_EXCL); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (!readFileSync(backup).equals(contents)) {
    throw new Error(`Refusing migration: backup differs from ${file}`);
  }
  chmodSync(backup, 0o600);
  unlinkSync(file);
  console.log('✅ Archived exact obsolete AGY context-mode rule; shared routing applies.');
}

function retireManagedWorkflow(directory) {
  const file = join(directory, 'WORKFLOW.md');
  let stat;
  try { stat = lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (!stat.isSymbolicLink()) return;
  const source = resolve(dirname(file), readlinkSync(file));
  let managed = source === LEGACY_WORKFLOW_MD;
  if (!managed && basename(source) === 'WORKFLOW.md') {
    try { managed = realpathSync(dirname(source)) === realpathSync(join(ROOT, 'rules')); }
    catch { /* Preserve an unrelated or unresolvable link. */ }
  }
  if (managed) unlinkSync(file); // Also handles dangling links after source removal.
}

export function syncRules() {
  if (!existsSync(AGENTS_MD)) throw new Error(`Missing canonical instruction source: ${AGENTS_MD}`);
  let synced = 0;
  for (const { directory } of selectedAgentPaths()) {
    const dest = join(directory, 'AGENTS.md');
    const src = AGENTS_MD;
    mkdirSync(dirname(dest), { recursive: true });
    let stat;
    try { stat = lstatSync(dest); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (stat?.isSymbolicLink() && readlinkSync(dest) === src) {
      synced++;
      retireManagedWorkflow(dirname(dest));
      continue;
    }
    if (stat) {
      if (!stat.isSymbolicLink() && !stat.isFile()) {
        throw new Error(`Refusing to replace a rules directory: ${dest}`);
      }
      backupFile(dest);
      unlinkSync(dest);
    }
    symlinkSync(src, dest);
    synced++;
    retireManagedWorkflow(dirname(dest));
  }
  if (!process.env.SKIP_AGY) migrateLegacyContextRule();
  console.log(`✅ Rules synchronized: ${synced} instruction files linked (unified policy).`);
  return { synced };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  syncRules();
}
