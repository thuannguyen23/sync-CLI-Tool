import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { codexHome } from './config-utils.mjs';

// Policy/skill destinations shared by distributors and diagnostics.
// MCP and hook schemas stay in their host-specific adapters.
export function agentPaths(home = homedir(), activeCodexHome = codexHome()) {
  const codexDefault = join(home, '.codex');
  const paths = [
    ...['config', 'antigravity-cli', 'antigravity-ide', 'antigravity'].map((dir, i) => ({
      agent: 'AGY', name: ['AGY Global', 'AGY CLI', 'AGY IDE', 'AGY App'][i],
      directory: join(home, '.gemini', dir),
    })),
    { agent: 'CODEX', name: 'Codex default', directory: codexDefault },
  ];
  if (resolve(activeCodexHome) !== resolve(codexDefault)) {
    paths.push({ agent: 'CODEX', name: 'Codex active', directory: resolve(activeCodexHome) });
  }
  paths.push({ agent: 'OPENCODE', name: 'OpenCode', directory: join(home, '.config', 'opencode') });
  return paths;
}

export function selectedAgentPaths() {
  return agentPaths().filter(({ agent }) => !process.env[`SKIP_${agent}`]);
}
