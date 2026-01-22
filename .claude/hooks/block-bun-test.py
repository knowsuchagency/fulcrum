#!/usr/bin/env python3
"""
Claude Code PreToolUse hook to block direct `bun test` calls.

Tests must be run via `mise run test` to ensure proper isolation.
Running `bun test` directly bypasses test isolation (HOME/FULCRUM_DIR overrides)
which can corrupt production settings files.
"""
import json
import re
import sys

input_data = json.load(sys.stdin)

if input_data.get("tool_name") != "Bash":
    sys.exit(0)

command = input_data.get("tool_input", {}).get("command", "")

# Block direct bun test commands
# Matches: bun test, bun test somefile.ts, bun test --watch, etc.
# Does NOT match: mise run test, echo "bun test", etc.
if re.search(r"(?:^|&&|\|\||;)\s*bun\s+test\b", command):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": (
                "Blocked: `bun test` bypasses test isolation. "
                "Use `mise run test` instead to ensure HOME and FULCRUM_DIR are set to temp directories."
            )
        }
    }))
    sys.exit(0)

sys.exit(0)
