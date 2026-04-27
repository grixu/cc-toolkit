#!/usr/bin/env python3
"""Dump enabled hookify file/all rules as JSON.

Used by the review-changes skill to load all rules relevant to a static
diff review (skips bash, stop, and prompt rules — they don't apply to a
file-content diff).

The script reuses hookify's existing core.config_loader so dedup and tier
priority match runtime behavior exactly.

Output schema (one JSON object on stdout):
{
  "rules": [
    {
      "name": "warn-console-log",
      "event": "file",
      "action": "warn",
      "source": "/path/to/.claude/hookify.warn-console-log.local.md",
      "source_type": "project-local",
      "message": "Console.log detected ...",
      "conditions": [
        {"field": "file_path", "operator": "regex_match", "pattern": "\\.tsx?$"},
        {"field": "new_text",  "operator": "regex_match", "pattern": "console\\.log\\("}
      ],
      "file_path_filters": ["\\.tsx?$"]
    },
    ...
  ],
  "count": 1
}

`file_path_filters` is precomputed for the skill: the regex patterns from any
condition with `field: file_path` and `operator: regex_match`. If empty, the
rule applies to every changed file.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def _import_config_loader():
    """Locate and import hookify.core.config_loader.

    Resolution order:
      1. CLAUDE_PLUGIN_ROOT env var (set when plugin is loaded by Claude Code)
      2. Path relative to this script: ../../../core/config_loader.py
    """
    candidates = []
    if env_root := os.environ.get("CLAUDE_PLUGIN_ROOT"):
        candidates.append(Path(env_root))
    script_dir = Path(__file__).resolve().parent
    candidates.append(script_dir.parent.parent.parent)  # plugin root

    for plugin_root in candidates:
        core = plugin_root / "core" / "config_loader.py"
        if core.is_file():
            sys.path.insert(0, str(plugin_root))
            import core.config_loader as cl  # noqa: WPS433
            return cl

    raise SystemExit(
        "list_rules.py: cannot locate hookify core/config_loader.py — "
        "set CLAUDE_PLUGIN_ROOT or run from inside the plugin tree."
    )


def main() -> int:
    cl = _import_config_loader()
    all_rules = cl.load_rules()

    out = []
    for r in all_rules:
        if r.event not in ("file", "all"):
            continue
        conds = [
            {"field": c.field, "operator": c.operator, "pattern": c.pattern}
            for c in r.conditions
        ]
        file_path_filters = [
            c.pattern
            for c in r.conditions
            if c.field == "file_path" and c.operator == "regex_match"
        ]
        out.append(
            {
                "name": r.name,
                "event": r.event,
                "action": r.action,
                "source": r.source,
                "source_type": r.source_type,
                "message": r.message,
                "conditions": conds,
                "file_path_filters": file_path_filters,
            }
        )

    json.dump({"rules": out, "count": len(out)}, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
