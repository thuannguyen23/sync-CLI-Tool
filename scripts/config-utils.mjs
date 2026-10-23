import { copyFileSync, constants, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

export const codexHome = () => resolve(process.env.CODEX_HOME || join(homedir(), '.codex'));

export function openCodeConfigPath() {
  const dir = join(homedir(), '.config', 'opencode');
  const json = join(dir, 'opencode.json');
  const jsonc = join(dir, 'opencode.jsonc');
  if (existsSync(json) && existsSync(jsonc)) {
    throw new Error('Both opencode.json and opencode.jsonc exist; choose one before syncing');
  }
  return existsSync(jsonc) ? jsonc : json;
}

export function backupFile(file) {
  if (!existsSync(file)) return;
  try {
    copyFileSync(file, file + '.bak', constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

// Remove JSONC comments and trailing commas without touching quoted strings.
export function parseConfig(source) {
  let text = '', quoted = false, escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      text += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') {
      quoted = true;
      text += char;
    } else if (char === '/' && source[i + 1] === '/') {
      while (i + 1 < source.length && source[i + 1] !== '\n') i++;
      text += ' ';
    } else if (char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) throw new Error('Unterminated JSONC comment');
      i = end + 1;
      text += ' ';
    } else text += char;
  }
  let json = '';
  quoted = false;
  escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!quoted && char === ',' && /^\s*[}\]]/.test(text.slice(i + 1))) continue;
    json += char;
    if (quoted && escaped) escaped = false;
    else if (quoted && char === '\\') escaped = true;
    else if (char === '"') quoted = !quoted;
  }
  const value = JSON.parse(json);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Configuration must be an object');
  }
  return value;
}

export function readConfig(file) {
  return existsSync(file) ? parseConfig(readFileSync(file, 'utf8')) : {};
}
