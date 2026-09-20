# Antigravity IDE Chat History Recovery & Stability Hardening Guide

> **Google Antigravity IDE Chat History Recovery & Stability Hardening Guide**  
> *A technical compendium of root-cause analyses, data recovery procedures, and automated resilience tooling for the developer community.*

---

## Table of Contents
1. [Core Issue (Is Chat Data Actually Lost?)](#1-core-issue)
2. [Architectural Root Causes](#2-architectural-root-causes)
3. [Hands-On Data Recovery Workflow](#3-hands-on-data-recovery-workflow)
4. [One-Click Automated Recovery Tool: `agy-rescue`](#4-one-click-automated-recovery-tool-agy-rescue)
5. [Hardened Configuration (`settings.json`)](#5-hardened-configuration-settingsjson)
6. [Should IDE, 2.0, and CLI Share Active Sessions?](#6-should-ide-20-and-cli-share-active-sessions)
7. [Best Practices to Prevent Chat Loss](#7-best-practices-to-prevent-chat-loss)

---

## 1. Core Issue

When you open Antigravity IDE and encounter an empty chat panel or only sessions from several weeks ago:

> [!NOTE]  
> **Your conversation data HAS NOT been deleted from your disk.**  
> The underlying SQLite databases (`.db`) and Protobuf records (`.pb`) remain intact on the local filesystem. What disappeared is solely the **Display Index** in the sidebar UI.

---

## 2. Architectural Root Causes

This issue stems from four underlying mechanisms in Antigravity IDE:

1. **Directory Structure Migration Flaws After Auto-Update:**  
   Antigravity migrated its data directory naming between versions (from `~/.gemini/antigravity/` to `~/.gemini/antigravity-ide/`). The IDE loads files only from the active directory, rendering historical sessions in the legacy folder orphaned.
2. **`chat.ChatSessionStore.index` Reset Glitch:**  
   When the IDE performs background updates, schema migration errors can reset the sidebar index key in SQLite `state.vscdb` to an empty structure (`{"version": 1, "entries": {}}`), occasionally overwriting the backup file as well.
3. **Abrupt Shutdown Freezing Write-Ahead Logs (`.db-wal`):**  
   The IDE buffers recent conversation turns in memory and flushes them to disk upon clean exit. If the machine is powered off abruptly while the IDE is active, uncommitted transactions stay trapped in `*.db-wal` without reaching the primary `.db` file.
4. **Workspace Hash Mismatch:**  
   The IDE scopes chat history by workspace root path. If launched from a subfolder terminal rather than the project root, the IDE computes a distinct workspace identifier and conceals parent directory conversations.

---

## 3. Hands-On Data Recovery Workflow

### Step 1: Merge Fragmented Chat Sessions
Safely copy historical conversation databases into the active IDE storage directory (without overwriting existing files):
```bash
cp --update=none ~/.gemini/antigravity/conversations/*.db ~/.gemini/antigravity-ide/conversations/
cp --update=none ~/.gemini/antigravity/conversation_summaries.db ~/.gemini/antigravity-ide/ 2>/dev/null || true
```

### Step 2: Flush and Checkpoint Frozen WAL Files
If a chat crashed due to sudden shutdown (leaving behind `.db-wal` files), force an SQLite checkpoint:
```python
import sqlite3, glob, os

convs_dir = os.path.expanduser("~/.gemini/antigravity-ide/conversations")
for db in glob.glob(os.path.join(convs_dir, "*.db")):
    if os.path.exists(db + "-wal"):
        con = sqlite3.connect(db)
        con.execute("PRAGMA wal_checkpoint(FULL);")
        con.close()
        print(f"Checkpointed: {os.path.basename(db)}")
```

---

## 4. One-Click Automated Recovery Tool: `agy-rescue`

Install this script to `~/.local/bin/agy-rescue` (grant executable permissions via `chmod +x`) to recover conversations at any time:

```bash
#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== [Antigravity IDE Rescue & Sync Tool] ===${NC}"

if pgrep -fl -i "antigravity" | grep -v "grep" | grep -v "agy-rescue" > /dev/null 2>&1; then
    echo -e "${YELLOW}[!] It is recommended to close the IDE (Ctrl+Q) first to prevent SQLite lock collisions.${NC}"
fi

CONVS_DIR="$HOME/.gemini/antigravity-ide/conversations"
LEGACY_DIR="$HOME/.gemini/antigravity/conversations"
STATE_DIR="$HOME/.config/Antigravity IDE/User/globalStorage"
BACKUP_DIR="$HOME/.gemini/antigravity-ide/backups"

mkdir -p "$CONVS_DIR" "$BACKUP_DIR"

# 1. Checkpoint frozen WAL logs
python3 -c "
import os, glob, sqlite3
convs_dir = os.path.expanduser('~/.gemini/antigravity-ide/conversations')
for db in glob.glob(os.path.join(convs_dir, '*.db')):
    if os.path.exists(db + '-wal'):
        try:
            con = sqlite3.connect(db)
            con.execute('PRAGMA wal_checkpoint(FULL);')
            con.close()
            print(f'  ✓ Checkpointed: {os.path.basename(db)}')
        except Exception as e:
            print(f'  ✗ Error {os.path.basename(db)}: {e}')
"

# 2. Sync sessions from legacy directory
if [ -d "$LEGACY_DIR" ]; then
    cp --update=none "$LEGACY_DIR"/*.db "$CONVS_DIR"/ 2>/dev/null || true
    cp --update=none "$HOME/.gemini/antigravity/conversation_summaries.db" "$HOME/.gemini/antigravity-ide/" 2>/dev/null || true
fi

# 3. Create rolling snapshot (retain last 7 days)
TODAY=$(date +%Y%m%d_%H%M%S)
if [ -f "$STATE_DIR/state.vscdb" ]; then
    cp "$STATE_DIR/state.vscdb" "$BACKUP_DIR/state_${TODAY}.vscdb"
    find "$BACKUP_DIR" -name "state_*.vscdb" -mtime +7 -delete 2>/dev/null || true
fi

TOTAL_CHATS=$(ls -1 "$CONVS_DIR"/*.db 2>/dev/null | wc -l)
echo -e "${GREEN}✓ All conversation data safeguarded and synchronized! (Current: $TOTAL_CHATS sessions)${NC}"
```

---

## 5. Hardened Configuration (`settings.json`)

Apply the following settings to `~/.config/Antigravity IDE/User/settings.json` (and standard VS Code installations):

```json
{
  // 1. Disable silent background updates to prevent periodic session index resets
  "update.mode": "none",

  // 2. Enforce workspace and view state restoration across restarts
  "window.restoreWindows": "all",
  "workbench.editor.restoreViewState": true,

  // 3. Prevent diff drift: Format modified lines only rather than the whole file during agent edits
  "editor.formatOnSaveMode": "modificationsIfAvailable",

  // 4. Prevent UI latency on Linux X11: Disable background clipboard querying
  "chat.clipboardContext.enabled": false,

  // 5. Eliminate indexing locks & reduce CPU usage: Exclude non-source directories
  "files.watcherExclude": {
    "**/.git/objects/**": true,
    "**/node_modules/**": true,
    "**/.venv/**": true,
    "**/dist/**": true,
    "**/build/**": true
  },

  // 6. Quality-of-life code reading enhancements
  "editor.stickyScroll.enabled": true,
  "editor.guides.bracketPairs": "active",
  "terminal.integrated.scrollback": 10000,
  "search.smartCase": true
}
```

---

## 6. Should IDE, 2.0, and CLI Share Active Sessions?

> [!WARNING]  
> **DO NOT share an active SQLite database concurrently across IDE, 2.0, and CLI.**

- **File Lock Contention:** Simultaneous SQLite write transactions produce `database is locked` errors, corrupting write streams.
- **Mismatched Data Schemas:** The IDE stores cursor positions and line diff blocks; Antigravity 2.0 tracks multi-agent trees; the CLI records an append-only token log.
- **Context Pollution:** Sharing unified history inflates prompt tokens unnecessarily for quick IDE queries.

### Recommended Operational Model (Separation of Concerns):
- **Antigravity 2.0:** Serves as **Architect** — High-level planning, multi-agent dispatch, emitting `PLAN.md`.
- **Antigravity IDE:** Serves as **Builder** — Consumes `PLAN.md`, provides code lenses, reviews line-by-line diffs.
- **Antigravity CLI:** Serves as **DevOps / Execution Engine** — Fast automated test loops, terminal debugging.
- **Single Source of Truth:** **The Git Repository & Markdown artifacts** (`AGENTS.md`, `docs/superpowers/plans/`).

---

## 7. Best Practices to Prevent Chat Loss

1. **Graceful Exit (`Ctrl + Q`):** Close Antigravity IDE 3–5 seconds before system shutdown to allow SQLite to flush RAM buffers cleanly to disk.
2. **Refresh View via Workspace Reload:** If historical sessions appear hidden, open **Open Agent Manager** > click **Open Workspace** > reselect the project root folder to trigger a full disk reload.
3. **Session Hygiene (`Ctrl + N`):** Open a fresh chat session after finishing each major feature or every 1–2 days. Avoid continuous month-long single threads that exhaust SQLite buffers.
