# Add Kilo Code Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add support for Kilo Code to `sync-CLI-Tool`, syncing MCP servers, skills, and rules to `~/.config/kilo`.

**Architecture:** Extend the existing sync logic in bash and Node.js scripts to include a fifth target (`kilo`), mirroring the approach used for `opencode` with its JSON configuration format.

**Tech Stack:** Bash, Node.js ESM, JSON/JSONC parsing.

## Global Constraints

- Must run on Linux, macOS, and Windows (via bash).
- Must not break existing support for AGY, Codex, OpenCode, and Cursor.
- Must gracefully handle missing `~/.config/kilo` directory if Kilo Code is not installed.
- Must preserve existing user configuration in `~/.config/kilo/kilo.json` or `kilo.jsonc`.

---

### Task 1: Update `setup.sh` to support Kilo Code

**Files:**
- Modify: `setup.sh`

**Interfaces:**
- Consumes: User input or CLI args (`--silent`).
- Produces: Symlinked `skills` and `AGENTS.md` for Kilo, plus RTK initialization.

- [ ] **Step 1: Write the failing test (Simulated)**
No explicit unit test for `setup.sh` bash script in the test suite yet, but we will visually inspect the file to verify the changes.

- [ ] **Step 2: Write minimal implementation**

Modify `setup.sh` to add checks and symlinks for Kilo.

```bash
# Add to interactive selection section (around line 73)
has kilo || [ -d "$HOME_DIR/.config/kilo" ] && kilo_found=true || kilo_found=false
ask_install "Kilo" $kilo_found || export SKIP_KILO=1

# Add to Step 3: Skills symlinks (around line 147)
# Kilo: reads ~/.agents/skills natively (Agent Skills spec), same as OpenCode
if [ -z "${SKIP_KILO:-}" ]; then
  ok "Kilo skills: reads ~/.agents/skills natively (no symlink needed)"
else
  info "Kilo skills sync skipped."
fi

# Add to Step 4: AGENTS.md symlinks (around line 170)
# Kilo
if [ -z "${SKIP_KILO:-}" ]; then
  mkdir -p "$HOME_DIR/.config/kilo"
  ln -sfn "$AGENTS_MD" "$HOME_DIR/.config/kilo/AGENTS.md"
  ok "Kilo AGENTS.md → $HOME_DIR/.config/kilo/AGENTS.md"
fi

# Add to Step 5: RTK (around line 211)
  # Kilo: create RTK.md instruction file (similar to Codex, or use rtk init)
  if [ -z "${SKIP_KILO:-}" ]; then
    rtk init -g --agent kilo --auto-patch 2>/dev/null \
      && ok "RTK → Kilo (RTK configured)" \
      || info "RTK → Kilo (already configured or unsupported directly by rtk init)"
  fi
```

- [ ] **Step 3: Commit**

```bash
git add setup.sh
git commit -m "feat: add kilo code support to setup.sh"
```

### Task 2: Update `scripts/sync-mcp.mjs` for Kilo

**Files:**
- Modify: `scripts/sync-mcp.mjs`

**Interfaces:**
- Consumes: `mcp/servers.json`
- Produces: Merged MCP configuration in `~/.config/kilo/kilo.json`

- [ ] **Step 1: Write the failing test**

There isn't a direct unit test for `sync-mcp.mjs` execution, but it relies on logic. We will add a test case if applicable, or just verify manually. Let's add the logic directly as the architecture is straightforward.

- [ ] **Step 2: Write minimal implementation**

Modify `scripts/sync-mcp.mjs` to add the `buildKilo` function and execute it.

```javascript
// Add around line 84 (after OpenCode implementation)

// ─── 4. Kilo format (MERGE) ──────────────────────────────────────────────
// Very similar to OpenCode. Reads/writes ~/.config/kilo/kilo.json or kilo.jsonc
function buildKilo() {
  const kiloFileJson = join(HOME, '.config/kilo/kilo.json')
  const kiloFileJsonc = join(HOME, '.config/kilo/kilo.jsonc')
  
  let targetFile = kiloFileJson
  let baseConfig = {}

  if (existsSync(kiloFileJsonc)) {
    targetFile = kiloFileJsonc
    try {
      baseConfig = parseJson(readFileSync(kiloFileJsonc, 'utf8'))
    } catch (e) {
      warn(`Could not parse existing kilo.jsonc: ${e.message}`)
    }
  } else if (existsSync(kiloFileJson)) {
    try {
      baseConfig = parseJson(readFileSync(kiloFileJson, 'utf8'))
    } catch (e) {
      warn(`Could not parse existing kilo.json: ${e.message}`)
    }
  }

  const kiloMcp = { ...baseConfig.mcp }

  for (const [name, server] of Object.entries(master)) {
    if (server.type === 'local') {
      kiloMcp[name] = {
        type: 'local',
        command: parseCommand(server.command),
        environment: server.env,
        enabled: true
      }
    } else if (server.type === 'remote') {
      kiloMcp[name] = {
        type: 'remote',
        url: server.url,
        headers: server.headers || {},
        enabled: true
      }
    }
  }

  baseConfig.mcp = kiloMcp
  return { file: targetFile, config: baseConfig }
}

// Add to the execution block at the bottom
  const kiloResult = buildKilo()
  if (!process.env.SKIP_KILO) {
    try { 
      mkdirSync(join(HOME, '.config/kilo'), { recursive: true })
      writeJson(kiloResult.file, kiloResult.config, 'Kilo     ') 
    } catch(e) { err(`Kilo: ${e.message}`) }
  } else { info('Kilo      → skipped (user opted out)') }
```

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-mcp.mjs
git commit -m "feat: add kilo mcp sync logic"
```

### Task 3: Update `scripts/sync-hooks.mjs` for Kilo

**Files:**
- Modify: `scripts/sync-hooks.mjs`

**Interfaces:**
- Consumes: Context mode and Herdr hook settings.
- Produces: Output logic indicating Kilo handles context mode via plugins or skills natively, avoiding direct `mcp` injection for context-mode if it breaks things (similar to OpenCode).

- [ ] **Step 1: Write the failing test (Simulated)**
No explicit unit test, visual inspection of the script output.

- [ ] **Step 2: Write minimal implementation**

Modify `scripts/sync-hooks.mjs` to add Kilo logic.

```javascript
// Add around line 125 (after OpenCode logic)

// ─── 5. Kilo CLI ────────────────────────────────────────────────────────
// Kilo handles context-mode natively via skills or its own MCP config.
// We will just log that it's managed, similar to OpenCode.
function syncKilo() {
  // Similar to OpenCode, Kilo manages context-mode through other means (like skills or native plugins).
  // We just ensure we don't break its kilo.json
  ok(`Kilo hooks up to date (managed natively)`)
}

if (!process.env.SKIP_KILO) { try { syncKilo() } catch (e) { err(`Kilo: ${e.message}`) } } else { info('Kilo hooks     → skipped') }
```

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-hooks.mjs
git commit -m "feat: add kilo hooks sync logic"
```

### Task 4: Update `teardown.sh` and Documentation

**Files:**
- Modify: `teardown.sh`
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: N/A
- Produces: Clean removal script for Kilo, updated docs.

- [ ] **Step 1: Write the failing test (Simulated)**
Run `teardown.sh` to ensure it removes Kilo config.

- [ ] **Step 2: Write minimal implementation**

Modify `teardown.sh`:
```bash
# Add to teardown.sh
remove_symlink "$HOME_DIR/.config/kilo/AGENTS.md"
restore_bak "$HOME_DIR/.config/kilo/kilo.json"
restore_bak "$HOME_DIR/.config/kilo/kilo.jsonc"
```

Modify `README.md`:
Find and replace instances of "4 CLI tools" with "5 CLI tools". Add Kilo to the lists of supported tools (AGY, Codex, OpenCode, Cursor, **Kilo**).
Add Kilo paths in the "Tool Mechanics" section (`~/.config/kilo/kilo.json`).

Modify `package.json`:
Update description: "Single Source of Truth for MCP servers, skills, rules, and hooks — automatically synced to AGY, Codex, OpenCode, Cursor, and Kilo".

- [ ] **Step 3: Commit**

```bash
git add teardown.sh README.md package.json
git commit -m "docs: update teardown and docs for kilo support"
```

### Task 5: Final Review and Integration Test

**Files:**
- Test: Run `./setup.sh` locally to verify it prompts for Kilo and correctly generates/updates `~/.config/kilo/kilo.json`.

**Interfaces:**
- Consumes: The newly updated scripts.
- Produces: Verified configuration on the local machine.

- [ ] **Step 1: Run Setup**

```bash
./setup.sh --silent
```

- [ ] **Step 2: Verify Outputs**

```bash
cat ~/.config/kilo/kilo.json
```
Verify that the `mcp` block from `mcp/servers.json` has been successfully merged into `~/.config/kilo/kilo.json`.
Verify `ls -l ~/.config/kilo/AGENTS.md` points to the correct symlink.

- [ ] **Step 3: Commit**

(No commit necessary if tests pass, this is just verification).
