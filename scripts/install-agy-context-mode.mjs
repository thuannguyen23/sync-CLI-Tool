#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const version = '1.0.169';
function valid(prefix) {
  try {
    const pkg = join(prefix, 'node_modules/context-mode');
    return JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version === version &&
      existsSync(join(pkg, 'configs/antigravity-cli/plugin.json')) &&
      existsSync(join(pkg, 'configs/antigravity-cli/hooks.json')) &&
      existsSync(join(prefix, 'node_modules/.bin/context-mode'));
  } catch { return false; }
}
export function installAgyContextMode(root = homedir(), install = prefix => {
  execFileSync('npm', ['install', '--prefix', prefix, '--no-save', '--no-package-lock', `context-mode@${version}`], { stdio: 'inherit', timeout: 300000 });
}) {
  const parent = join(root, '.local/share/sync-cli-tool');
  const target = join(parent, 'context-mode-agy');
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (existsSync(target)) {
    if (!valid(target)) throw new Error(`Existing AGY context-mode installation is incomplete or invalid: ${target}`);
    console.log(`AGY context-mode ${version} already installed`);
    return;
  }
  const staged = mkdtempSync(join(parent, '.context-mode-agy-install-'));
  try {
    install(staged);
    if (!valid(staged)) throw new Error('Downloaded AGY context-mode installation is incomplete or invalid');
    renameSync(staged, target);
    console.log(`Installed AGY context-mode ${version}: ${target}`);
  } finally { rmSync(staged, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) installAgyContextMode();
