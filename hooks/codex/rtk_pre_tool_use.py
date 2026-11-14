#!/usr/bin/env python3
"""Compatibility delegate for existing Codex processes with cached hook paths.

New registrations invoke the native RTK hook directly. This file intentionally
contains no command rewrite or permission logic.
"""
import os
import shutil
from pathlib import Path

binary = Path.home() / ".local/bin/rtk"
command = str(binary) if binary.is_file() else shutil.which("rtk")
if command:
    os.execv(command, [command, "hook", "codex"])
