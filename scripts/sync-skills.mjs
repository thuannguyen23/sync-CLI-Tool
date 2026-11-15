#!/usr/bin/env node
/**
 * Link canonical skills into Codex, Antigravity and OpenCode host locations.
 * Preserve personal entries, unrelated links and active Codex system skills.
 */
import { readdirSync, existsSync, mkdirSync, symlinkSync, readlinkSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { selectedAgentPaths } from './agent-paths.mjs';

const HOME = homedir();
const AGENTS_DIR = join(HOME, '.agents');
const REPO_SKILLS_DIR = existsSync(join(AGENTS_DIR, 'skills'))
  ? join(AGENTS_DIR, 'skills')
  : resolve('skills');

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const ok = (msg) => console.log(`${GREEN}✅ ${msg}${RESET}`);
const warn = (msg) => console.log(`${YELLOW}⚠️  ${msg}${RESET}`);
const info = (msg) => console.log(`${DIM}   ${msg}${RESET}`);

function lstatSafe(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

export function syncSkills() {
  if (!existsSync(REPO_SKILLS_DIR)) {
    warn(`Skills directory not found at ${REPO_SKILLS_DIR}`);
    return { synced: 0, skills: [] };
  }

  const skillDirs = readdirSync(REPO_SKILLS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && existsSync(join(REPO_SKILLS_DIR, dirent.name, 'SKILL.md')))
    .map(dirent => dirent.name);

  // Target directories that accept individual skill symlinks
  const targetDirs = selectedAgentPaths().map(({ directory, name }) => ({ name, path: join(directory, 'skills') }));

  for (const target of targetDirs) {
    try {
      if (!existsSync(target.path)) {
        mkdirSync(target.path, { recursive: true });
      }
    } catch (err) {
      warn(`Failed to create directory ${target.name} (${target.path}): ${err.message}`);
      continue;
    }

    for (const skill of skillDirs) {
      const src = join(REPO_SKILLS_DIR, skill);
      const dest = join(target.path, skill);

      try {
        const stat = lstatSafe(dest);
        if (stat?.isSymbolicLink()) {
          const currentTarget = readlinkSync(dest);
          if (currentTarget === src) {
            continue; // already correctly linked
          }
          warn(`Preserving existing skill link: ${dest}`);
          continue;
        } else if (stat) {
          // Exists as a non-symlink file/directory, do not overwrite
          continue;
        }
        symlinkSync(src, dest, 'dir');
      } catch (err) {
        warn(`Failed to link ${skill} to ${target.name}: ${err.message}`);
      }
    }

    // Preserve unrelated and temporarily unavailable links.
  }

  ok(`Skills synchronized: ${skillDirs.length} skills across ${targetDirs.length} selected host locations.`);
  return { synced: skillDirs.length, skills: skillDirs };
}

// Execute if run directly
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  syncSkills();
}
