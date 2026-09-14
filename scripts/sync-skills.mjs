#!/usr/bin/env node
/**
 * sync-skills.mjs — Synchronize skills from ~/.agents/skills (or ./skills)
 * to all tool-specific locations:
 *   - AGY Global:  ~/.gemini/config/skills/
 *   - AGY CLI:     ~/.gemini/antigravity-cli/skills/
 *   - AGY IDE:     ~/.gemini/antigravity-ide/skills/
 *   - AGY 2.0:     ~/.gemini/antigravity/skills/
 *   - Codex:       ~/.codex/skills/
 *   - Cursor:      ~/.config/Cursor/User/skills
 */

import { readdirSync, existsSync, mkdirSync, symlinkSync, unlinkSync, readlinkSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

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

function cleanupBrokenLinks(dir) {
  if (!existsSync(dir)) return;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const stat = lstatSafe(fullPath);
      if (stat?.isSymbolicLink() && !existsSync(fullPath)) {
        unlinkSync(fullPath);
        info(`Cleaned broken link: ${fullPath}`);
      }
    }
  } catch {}
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
  const targetDirs = [
    { name: 'AGY Global (IDE / CLI / 2.0)', path: join(HOME, '.gemini', 'config', 'skills') },
    { name: 'AGY CLI', path: join(HOME, '.gemini', 'antigravity-cli', 'skills') },
    { name: 'AGY IDE', path: join(HOME, '.gemini', 'antigravity-ide', 'skills') },
    { name: 'AGY 2.0', path: join(HOME, '.gemini', 'antigravity', 'skills') },
    { name: 'Codex', path: join(HOME, '.codex', 'skills') },
  ];

  for (const target of targetDirs) {
    if (!existsSync(target.path)) {
      mkdirSync(target.path, { recursive: true });
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
          unlinkSync(dest);
        } else if (stat) {
          // Exists as a non-symlink file/directory, do not overwrite
          continue;
        }
        symlinkSync(src, dest, 'dir');
      } catch (err) {
        warn(`Failed to link ${skill} to ${target.name}: ${err.message}`);
      }
    }

    // Clean dead symlinks
    cleanupBrokenLinks(target.path);
  }

  // Cursor handling: ensure symlink exists
  const cursorUserDir = join(HOME, '.config', 'Cursor', 'User');
  const cursorSkillsLink = join(cursorUserDir, 'skills');
  if (existsSync(cursorUserDir)) {
    const stat = lstatSafe(cursorSkillsLink);
    if (!stat) {
      try {
        symlinkSync(REPO_SKILLS_DIR, cursorSkillsLink, 'dir');
        ok(`Cursor skills linked → ${REPO_SKILLS_DIR}`);
      } catch {}
    }
  }

  ok(`Skills synchronized: ${skillDirs.length} skills across all agent environments.`);
  return { synced: skillDirs.length, skills: skillDirs };
}

// Execute if run directly
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  syncSkills();
}
