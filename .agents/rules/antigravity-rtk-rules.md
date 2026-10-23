---
name: antigravity-rtk
description: RTK command compression for Antigravity CLI.
trigger: always_on
---

# RTK - Rust Token Killer (Google Antigravity)

**Usage**: Token-optimized CLI proxy for shell commands.

## Rule

The installed RTK hook automatically rewrites supported shell commands.
Do not add a second prefix to commands already rewritten by the hook.
When the hook is unavailable, use `rtk` for supported commands.

Examples:

```bash
rtk git status
rtk cargo test
rtk ls src/
rtk grep "pattern" src/
rtk find "*.rs" .
rtk docker ps
rtk gh pr list
```

## Meta Commands

```bash
rtk gain              # Show token savings
rtk gain --history    # Command history with savings
rtk discover          # Find missed RTK opportunities
rtk proxy <cmd>       # Run raw (no filtering, for debugging)
```

## Why

RTK filters and compresses supported command output before it reaches the LLM context.
