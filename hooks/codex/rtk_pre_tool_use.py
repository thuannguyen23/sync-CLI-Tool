#!/usr/bin/env python3
import json
import subprocess
import sys


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    if payload.get("hook_event_name") != "PreToolUse":
        return 0

    if payload.get("tool_name") != "Bash":
        return 0

    tool_input = payload.get("tool_input") or {}
    command = tool_input.get("command")
    if not isinstance(command, str) or not command.strip():
        return 0

    try:
        result = subprocess.run(
            ["rtk", "rewrite", command],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        return 0

    rewritten = result.stdout.strip()
    if not rewritten or rewritten == command:
        return 0

    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "updatedInput": {
                    "command": rewritten,
                },
            }
        },
        sys.stdout,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
