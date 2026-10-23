#!/usr/bin/env node
/**
 * sync-mcp.mjs — Convert ~/.agents/mcp/servers.json to all supported tool formats.
 *
 * Formats:
 *   AGY CLI     → ~/.gemini/config/mcp_config.json   (JSON, mcpServers + $typeName + absolute paths)
 *   Cursor      → ~/.cursor/mcp.json                  (JSON, mcpServers, simple)
 *   OpenCode    → ~/.config/opencode/opencode.json    (JSON, mcp key, merged — preserves other keys)
 *   Codex       → ~/.codex/config.toml                (TOML, via `codex mcp add`)
 *   Cline       → cline_mcp_settings.json             (JSON, mcpServers, CLI & VS Code global storage)
 *   Claude Code → ~/.claude.json                      (JSON, top-level mcpServers, merged)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { backupFile, codexHome, openCodeConfigPath, readConfig } from './config-utils.mjs';

const HOME = homedir();
const AGENTS_DIR = join(HOME, ".agents");
const SECRETS_FILE = join(AGENTS_DIR, "secrets.env");
const SERVERS_FILE = join(AGENTS_DIR, "mcp/servers.json");

// ─── Colours ────────────────────────────────────────────────────────────────
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const ok = (msg) => console.log(`${GREEN}✅ ${msg}${RESET}`);
const warn = (msg) => console.log(`${YELLOW}⚠️  ${msg}${RESET}`);
const err = (msg) => { process.exitCode = 1; console.error(`${RED}❌ ${msg}${RESET}`); };
const info = (msg) => console.log(`${DIM}   ${msg}${RESET}`);

// ─── Load secrets ────────────────────────────────────────────────────────────
const secrets = {};
if (existsSync(SECRETS_FILE)) {
  readFileSync(SECRETS_FILE, "utf8")
    .split("\n")
    .forEach((line) => {
      line = line.trim();
      if (!line || line.startsWith("#")) return;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) return;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if (val.startsWith("~/")) {
        val = join(HOME, val.slice(2));
      }
      secrets[key] = val;
    });
} else {
  warn("secrets.env not found — ${VAR} placeholders will NOT be replaced");
  info(`Run: cp ${AGENTS_DIR}/secrets.env.example ${SECRETS_FILE}`);
}

function interpolate(value) {
  if (typeof value !== "string") return value;
  return value.replace(/\$\{([^}]+)\}/g, (_, key) => {
    if (secrets[key] !== undefined) return secrets[key];
    if (process.env[key] !== undefined) return process.env[key];
    warn(`Secret not found: ${key}`);
    return `\${${key}}`;
  });
}

// ─── Read master config ──────────────────────────────────────────────────────
if (!existsSync(SERVERS_FILE)) {
  err(`servers.json not found: ${SERVERS_FILE}`);
  process.exit(1);
}

let servers = {};
try {
  const parsed = JSON.parse(readFileSync(SERVERS_FILE, "utf8"));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !parsed.servers ||
    typeof parsed.servers !== "object"
  ) {
    err(`servers.json is invalid: Must contain a top-level "servers" object.`);
    process.exit(1);
  }
  servers = parsed.servers;

  // Basic structural validation for each server
  for (const [name, config] of Object.entries(servers)) {
    if (!config.url && (!config.command || !Array.isArray(config.command))) {
      err(
        `servers.json is invalid: Server '${name}' must have either a 'url' string or a 'command' array.`,
      );
      process.exit(1);
    }
  }
} catch (e) {
  err(`Failed to parse servers.json: ${e.message}`);
  process.exit(1);
}

// ─── Resolve binary absolute path ────────────────────────────────────────────
function resolveBin(cmd) {
  try {
    return execSync(`which ${cmd}`, { encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return null; // not found
  }
}

function checkRequires(serverName, requires = []) {
  const missing = requires.filter((bin) => !resolveBin(bin));
  if (missing.length > 0) {
    warn(
      `MCP '${serverName}' requires: ${missing.join(", ")} — not found in PATH`,
    );
    info(
      `Config will still be written; install the binary to activate this MCP.`,
    );
  }
  return missing.length === 0;
}

// ─── 1. AGY CLI format ───────────────────────────────────────────────────────
// Requires: $typeName field, absolute command path, PATH env variable
function buildAgy() {
  const mcpServers = {};
  for (const [name, server] of Object.entries(servers)) {
    if (server.url) {
      mcpServers[name] = {
        serverUrl: interpolate(server.url),
        url: interpolate(server.url),
        ...(server.headers
          ? {
              headers: Object.fromEntries(
                Object.entries(server.headers).map(([k, v]) => [
                  k,
                  interpolate(v),
                ]),
              ),
            }
          : {}),
      };
      continue;
    }
    checkRequires(name, server.requires);
    const [cmd, ...args] = server.command;
    const resolvedCmd = resolveBin(cmd) ?? cmd;
    const binDir = resolvedCmd.includes("/") ? dirname(resolvedCmd) : null;

    const env = {};
    // Inject PATH so nvm-managed node/npx is resolvable inside the tool
    if (binDir) {
      env.PATH = `${binDir}:/usr/local/bin:/usr/bin:/bin`;
    }
    if (server.env) {
      for (const [k, v] of Object.entries(server.env)) {
        env[k] = interpolate(v);
      }
    }

    mcpServers[name] = {
      $typeName: "exa.cascade_plugins_pb.CascadePluginCommandTemplate",
      command: resolvedCmd,
      args: args.map((a) => interpolate(a)),
      ...(Object.keys(env).length > 0 ? { env } : {}),
    };
  }
  return { mcpServers };
}

// ─── 2. Cursor format ────────────────────────────────────────────────────────
// Simple JSON: command (string) + args (array) + env (object)
function buildCursor() {
  const mcpServers = {};
  for (const [name, server] of Object.entries(servers)) {
    if (server.url) {
      mcpServers[name] = {
        url: interpolate(server.url),
        ...(server.headers
          ? {
              headers: Object.fromEntries(
                Object.entries(server.headers).map(([k, v]) => [
                  k,
                  interpolate(v),
                ]),
              ),
            }
          : {}),
      };
      continue;
    }
    const [cmd, ...args] = server.command;
    const entryArgs =
      name === "codegraph" && !args.includes("${workspaceFolder}")
        ? [...args, "--path", "${workspaceFolder}"]
        : args.map((a) => interpolate(a));
    const entry = { command: cmd, args: entryArgs };
    if (server.env && Object.keys(server.env).length > 0) {
      entry.env = Object.fromEntries(
        Object.entries(server.env).map(([k, v]) => [k, interpolate(v)]),
      );
    }
    mcpServers[name] = entry;
  }
  return { mcpServers };
}

// ─── 3. OpenCode format (MERGE for v2) ───────────────────────────────────────
// Uses "mcp.servers" key for v2, command is an array, env key is "environment"
// IMPORTANT: Updates the "mcp.servers" key; preserves everything else (provider, plugins, etc.)
function buildOpenCode() {
  const opencodeFile = openCodeConfigPath();
  const existing = readConfig(opencodeFile);

  const mcpServers = {};
  for (const [name, server] of Object.entries(servers)) {
    if (server.url) {
      mcpServers[name] = {
        type: "remote",
        url: interpolate(server.url),
        ...(server.headers
          ? {
              headers: Object.fromEntries(
                Object.entries(server.headers).map(([k, v]) => [
                  k,
                  interpolate(v),
                ]),
              ),
            }
          : {}),
        enabled: true,
      };
      continue;
    }
    const entry = {
      type: "local",
      command: server.command.map((p) => interpolate(p)),
      enabled: true,
    };
    if (server.env && Object.keys(server.env).length > 0) {
      entry.environment = Object.fromEntries(
        Object.entries(server.env).map(([k, v]) => [k, interpolate(v)]),
      );
    }
    mcpServers[name] = entry;
  }

  // Global plugins/*.ts files are discovered automatically by OpenCode V2.
  // Remove only the obsolete explicit RTK file entry; retain other plugins.
  const plugins = (existing.plugins ?? existing.plugin ?? []).filter(p =>
    !(typeof p === 'string' && p.includes('plugins/rtk.ts')));

  // Ensure global AGENTS.md is registered in instructions array
  const agentsMdPath = join(HOME, ".config/opencode/AGENTS.md");
  let instructions = existing.instructions ?? [];
  if (!instructions.includes(agentsMdPath)) {
    instructions = [agentsMdPath, ...instructions];
  }

  const existingServers = existing.mcp?.servers ?? existing.mcp ?? {};
  delete existingServers.servers;

  const mcp = {
    servers: {
      ...existingServers,
      ...mcpServers,
    },
  };

  return {
    ...existing,
    $schema: "https://opencode.ai/v2/config.json",
    instructions,
    plugins,
    plugin: plugins,
    mcp,
  };
}

// ─── 4. Codex — use `codex mcp add` (writes correctly to config.toml) ────────
// global-mcp.toml is NOT read by Codex; config.toml is the correct file.
// The `codex mcp add` CLI handles all TOML merging safely.
async function syncCodex() {
  const { execFileSync } = await import("node:child_process");
  const run = (args, opts = {}) =>
    execFileSync("codex", args, {
      encoding: "utf8",
      stdio: "pipe",
      ...opts,
      env: { ...process.env, ...secrets, ...opts.env },
    });

  // Upsert the declared servers only. Unmanaged servers are never removed.
  const configFile = join(codexHome(), 'config.toml');
  backupIfNeeded(configFile);

  // Add each server fresh
  for (const [name, server] of Object.entries(servers)) {
    if (server.url) {
      const resolvedUrl = interpolate(server.url);
      const cliArgs = ["mcp", "add", name, "--url", resolvedUrl];
      try {
        run(cliArgs);
        ok(`Codex    (mcp add ${name} → ${resolvedUrl})`);
      } catch (e) {
        throw new Error(`Codex add failed for ${name}`);
      }
      continue;
    }
    const [cmd, ...args] = server.command;
    // Resolve absolute path — Codex runs sandboxed and may not have ~/.local/bin in PATH
    const resolvedCmd = resolveBin(cmd) ?? cmd;
    const cliArgs = ["mcp", "add", name];
    if (server.env) {
      for (const [k, v] of Object.entries(server.env)) {
        cliArgs.push("--env", `${k}=${interpolate(v)}`);
      }
    }
    cliArgs.push("--");
    cliArgs.push(resolvedCmd, ...args.map((a) => interpolate(a)));
    try {
      run(cliArgs);
      ok(`Codex    (mcp add ${name} → ${resolvedCmd})`);
    } catch (e) {
      throw new Error(`Codex add failed for ${name}`);
    }
  }

  // Inject http_headers for remote servers into ~/.codex/config.toml
  const codexConfigFile = join(codexHome(), 'config.toml');
  if (existsSync(codexConfigFile)) {
    let tomlContent = readFileSync(codexConfigFile, "utf8");
    let modified = false;

    for (const [name, server] of Object.entries(servers)) {
      if (
        !server.url ||
        !server.headers ||
        Object.keys(server.headers).length === 0
      )
        continue;

      const headerEntries = Object.entries(server.headers)
        .map(
          ([k, v]) =>
            `${JSON.stringify(k)} = ${JSON.stringify(interpolate(v))}`,
        )
        .join(", ");

      const sectionHeader = `[mcp_servers.${name}]`;
      const sectionIdx = tomlContent.indexOf(sectionHeader);
      if (sectionIdx === -1) continue;

      const nextSectionIdx = tomlContent.indexOf(
        "\n[",
        sectionIdx + sectionHeader.length,
      );
      const sectionEnd =
        nextSectionIdx === -1 ? tomlContent.length : nextSectionIdx;

      let sectionBody = tomlContent.slice(sectionIdx, sectionEnd);
      sectionBody = sectionBody
        .split("\n")
        .filter(
          (l) =>
            !l.trim().startsWith("bearer_token_env_var") &&
            !l.trim().startsWith("http_headers"),
        )
        .join("\n");

      const insertLine = `http_headers = { ${headerEntries} }`;
      sectionBody = sectionBody.replace(
        new RegExp(
          `(\\[mcp_servers\\.${name}\\][\\s\\S]*?url\\s*=\\s*"[^"]*")`,
        ),
        (_match, prefix) => `${prefix}\n${insertLine}`,
      );

      tomlContent =
        tomlContent.slice(0, sectionIdx) +
        sectionBody +
        tomlContent.slice(sectionEnd);
      modified = true;
    }

    if (modified) {
      backupIfNeeded(codexConfigFile);
      writeFileSync(codexConfigFile, tomlContent, "utf8");
      ok(`Codex    (injected http_headers into config.toml)`);
    }
  }
}

// ─── 5. Cline format ─────────────────────────────────────────────────────────
// Simple JSON with mcpServers key, written to CLI and VS Code global storage
function buildCline() {
  const mcpServers = {};
  for (const [name, server] of Object.entries(servers)) {
    if (server.url) {
      mcpServers[name] = {
        type: "streamableHttp",
        url: interpolate(server.url),
        ...(server.headers
          ? {
              headers: Object.fromEntries(
                Object.entries(server.headers).map(([k, v]) => [
                  k,
                  interpolate(v),
                ]),
              ),
            }
          : {}),
      };
      continue;
    }
    const [cmd, ...args] = server.command;
    const entry = { command: cmd, args: args.map((a) => interpolate(a)) };
    if (server.env && Object.keys(server.env).length > 0) {
      entry.env = Object.fromEntries(
        Object.entries(server.env).map(([k, v]) => [k, interpolate(v)]),
      );
    }
    mcpServers[name] = entry;
  }
  return { mcpServers };
}

// ─── 6. Claude Code format (MERGE ~/.claude.json) ────────────────────────────
// Claude Code stores user-scoped MCP under top-level "mcpServers" key in ~/.claude.json
function buildClaudeCode() {
  const claudeFile = join(HOME, ".claude.json");
  let existing = {};
  if (existsSync(claudeFile)) {
    try {
      const raw = readFileSync(claudeFile, "utf8");
      existing = JSON.parse(raw);
    } catch (e) {
      warn(`Could not parse existing ~/.claude.json: ${e.message}`);
    }
  }

  const mcpServers = {};
  for (const [name, server] of Object.entries(servers)) {
    if (server.url) {
      mcpServers[name] = {
        type: "http",
        url: interpolate(server.url),
        ...(server.headers
          ? {
              headers: Object.fromEntries(
                Object.entries(server.headers).map(([k, v]) => [
                  k,
                  interpolate(v),
                ]),
              ),
            }
          : {}),
      };
      continue;
    }
    const [cmd, ...args] = server.command;
    const resolvedCmd = resolveBin(cmd) ?? cmd;
    mcpServers[name] = {
      command: resolvedCmd,
      args: args.map((a) => interpolate(a)),
      ...(server.env && Object.keys(server.env).length > 0
        ? {
            env: Object.fromEntries(
              Object.entries(server.env).map(([k, v]) => [k, interpolate(v)]),
            ),
          }
        : {}),
    };
  }

  // Merge: preserve manually-added servers (e.g. Exa HTTP),
  // source-of-truth entries win on conflict.
  return { ...existing, mcpServers: { ...(existing.mcpServers ?? {}), ...mcpServers } };
}

// ─── Write helpers ────────────────────────────────────────────────────────────
function backupIfNeeded(file) {
  backupFile(file);
}

function writeJson(file, data, label) {
  mkdirSync(dirname(file), { recursive: true });
  backupIfNeeded(file);
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  ok(`${label} → ${file} (backed up to .bak)`);
}

function writeText(file, data, label) {
  mkdirSync(dirname(file), { recursive: true });
  backupIfNeeded(file);
  writeFileSync(file, data, "utf8");
  ok(`${label} → ${file} (backed up to .bak)`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log("\n🔌 Syncing MCP configs from servers.json...\n");

  const agyFileGlobal = join(HOME, ".gemini/config/mcp_config.json");
  const agyFileCli = join(HOME, ".gemini/antigravity-cli/mcp_config.json");
  const agyFileIde = join(HOME, ".gemini/antigravity-ide/mcp_config.json");
  const agyFileApp = join(HOME, ".gemini/antigravity/mcp_config.json");
  const cursorFile = join(HOME, ".cursor/mcp.json");
  const vscodeMcpFile = join(HOME, ".config/Code/User/mcp.json");
  const agyIdeUserMcpFile = join(HOME, ".config/Antigravity IDE/User/mcp.json");
  // Resolve the selected OpenCode file inside its own error boundary.


  if (!process.env.SKIP_AGY) {
    try {
      const agyData = buildAgy();
      const targets = [agyFileGlobal, agyFileCli, agyFileIde, agyFileApp];
      // Parse every destination before changing any AGY configuration.
      const merged = targets.map(file => {
        const existing = readConfig(file);
        return { ...existing, mcpServers: { ...existing.mcpServers, ...agyData.mcpServers } };
      });
      targets.forEach((file, index) => writeJson(file, merged[index], 'AGY'));
    } catch (e) {
      err(`AGY: ${e.message}`);
    }
  } else {
    info("AGY       → skipped (user opted out)");
  }

  if (!process.env.SKIP_CURSOR) {
    try {
      const cursorData = buildCursor();
      writeJson(cursorFile, cursorData, "Cursor   ");
      if (existsSync(dirname(vscodeMcpFile))) {
        writeJson(vscodeMcpFile, cursorData, "VS Code (User)  ");
      }
      if (existsSync(dirname(agyIdeUserMcpFile))) {
        writeJson(agyIdeUserMcpFile, cursorData, "Antigravity IDE (User)");
      }
    } catch (e) {
      err(`Cursor / VS Code / Antigravity IDE: ${e.message}`);
    }
  } else {
    info("Cursor    → skipped (user opted out)");
  }

  if (!process.env.SKIP_OPENCODE) {
    try {
      writeJson(openCodeConfigPath(), buildOpenCode(), "OpenCode ");
    } catch (e) {
      err(`OpenCode: ${e.message}`);
    }
  } else {
    info("OpenCode  → skipped (user opted out)");
  }

  if (!process.env.SKIP_CODEX) {
    try {
      await syncCodex();
    } catch (e) {
      err(`Codex: ${e.message}`);
    }
  } else {
    info("Codex     → skipped (user opted out)");
  }

  if (!process.env.SKIP_CLINE) {
    try {
      const clineData = buildCline();
      const clineCliFile = join(HOME, ".cline/data/settings/cline_mcp_settings.json");
      const clineVscodeFile = join(
        HOME,
        ".config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json",
      );
      writeJson(clineCliFile, clineData, "Cline (CLI)    ");
      writeJson(clineVscodeFile, clineData, "Cline (VS Code)");
    } catch (e) {
      err(`Cline: ${e.message}`);
    }
  } else {
    info("Cline     → skipped (user opted out)");
  }

  if (!process.env.SKIP_CLAUDE) {
    try {
      const claudeFile = join(HOME, ".claude.json");
      writeJson(claudeFile, buildClaudeCode(), "Claude Code    ");
    } catch (e) {
      err(`Claude Code: ${e.message}`);
    }
  } else {
    info("Claude Code → skipped (user opted out)");
  }

  console.log(process.exitCode ? "\nMCP sync failed; inspect the errors above.\n" : "\n✨ MCP sync complete.\n");
})();
