#!/usr/bin/env python3
"""Enumerate changed files for a review scope.

Usage:
    get_changes.py --scope {uncommitted|committed|both} [--base REF]

Scopes:
    uncommitted   working tree + index vs HEAD          (git diff HEAD)
    committed     HEAD vs merge-base with upstream/main (git diff BASE..HEAD)
    both          working tree vs that same merge-base  (git diff BASE)

Base resolution (when --base is omitted):
    1. merge-base with @{upstream} if an upstream is configured
    2. merge-base with origin/main, then origin/master
    3. main, then master
    Falls back with an error if none of the above exist.

Output (JSON on stdout):
{
  "scope": "both",
  "base": "abc1234",                      // null for uncommitted-only
  "diff_args": ["abc1234"],               // pass to `git diff <args> -- <file>`
  "files": [
    {"path": "src/foo.ts", "status": "M", "binary": false}
  ],
  "count": 1,
  "alternate": {                          // only when the run found nothing
    "ref": "origin/main",                 // and another base would have
    "base": "def5678",
    "diff_args": ["def5678..HEAD"],
    "count": 7
  }
}

Status codes follow `git diff --name-status`:
    A added, M modified, D deleted, R renamed, C copied, T type-changed.
Deleted files are dropped (no content to review).

Untracked (and non-gitignored) files are included for `uncommitted` and
`both` scopes, marked with `"untracked": true` and status `A`. To diff them,
read the file directly — `git diff` will not show their contents.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from typing import Optional


def _run(cmd: list[str], check: bool = True) -> str:
    res = subprocess.run(cmd, capture_output=True, text=True)
    if check and res.returncode != 0:
        raise SystemExit(f"command failed ({res.returncode}): {' '.join(cmd)}\n{res.stderr.strip()}")
    return res.stdout


def _ref_exists(ref: str) -> bool:
    res = subprocess.run(
        ["git", "rev-parse", "--verify", "--quiet", ref],
        capture_output=True, text=True,
    )
    return res.returncode == 0


BASE_CANDIDATES = ["@{upstream}", "origin/main", "origin/master", "main", "master"]


def _merge_base(ref: str) -> Optional[str]:
    if not _ref_exists(ref):
        return None
    return _run(["git", "merge-base", "HEAD", ref], check=False).strip() or None


def _resolve_base(explicit: Optional[str]) -> tuple[str, str]:
    if explicit:
        if not _ref_exists(explicit):
            raise SystemExit(f"--base ref does not exist: {explicit}")
        merge_base = _run(["git", "merge-base", "HEAD", explicit]).strip()
        return merge_base or explicit, explicit

    for ref in BASE_CANDIDATES:
        mb = _merge_base(ref)
        if mb:
            return mb, ref
    raise SystemExit(
        "could not resolve a base ref — set upstream, push to origin/main, "
        "or pass --base <ref>"
    )


def _alternate(scope: str, base: str, used_ref: str) -> Optional[dict]:
    """A second base worth reporting when the resolved one saw no change.

    A branch whose upstream is its own remote counterpart diffs to nothing the
    moment it is pushed, which reads as "no changes" while the whole branch is
    still unreviewed against the trunk.
    """
    for ref in BASE_CANDIDATES[1:]:
        if ref == used_ref:
            continue
        mb = _merge_base(ref)
        if not mb or mb == base:
            continue
        ref_args = [mb] if scope == "both" else [f"{mb}..HEAD"]
        files = _list_files(ref_args)
        if files:
            return {"ref": ref, "base": mb, "diff_args": ref_args, "count": len(files)}
    return None


def _is_binary(path: str, ref_args: list[str]) -> bool:
    """Detect binary files via git diff --numstat ('-' for binary)."""
    out = _run(["git", "diff", "--numstat", *ref_args, "--", path], check=False)
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) >= 3 and parts[0] == "-" and parts[1] == "-":
            return True
    return False


def _list_files(ref_args: list[str]) -> list[dict]:
    raw = _run(["git", "diff", "--name-status", *ref_args])
    files: list[dict] = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        status = parts[0][0]  # R100 -> R, A -> A, etc.
        if status == "D":
            continue
        path = parts[-1]
        files.append(
            {
                "path": path,
                "status": status,
                "binary": _is_binary(path, ref_args),
            }
        )
    return files


def _list_untracked() -> list[dict]:
    """Untracked, non-ignored files. Treated as additions (status 'A')."""
    raw = _run(["git", "ls-files", "--others", "--exclude-standard"])
    files: list[dict] = []
    for line in raw.splitlines():
        path = line.strip()
        if not path:
            continue
        files.append(
            {
                "path": path,
                "status": "A",
                "binary": _is_binary_untracked(path),
                "untracked": True,
            }
        )
    return files


def _is_binary_untracked(path: str) -> bool:
    """Detect binary for an untracked file via file inspection (no git diff)."""
    try:
        with open(path, "rb") as f:
            chunk = f.read(8192)
        if b"\x00" in chunk:
            return True
        # also: very high ratio of non-printable bytes → binary
        text_chars = bytes(range(32, 127)) + b"\n\r\t\f\b"
        nontext = sum(b not in text_chars for b in chunk)
        return len(chunk) > 0 and nontext / len(chunk) > 0.30
    except OSError:
        return False


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--scope", required=True, choices=["uncommitted", "committed", "both"])
    p.add_argument("--base", default=None, help="explicit base ref (default: auto-detect)")
    args = p.parse_args()

    inside = _run(["git", "rev-parse", "--is-inside-work-tree"], check=False).strip()
    if inside != "true":
        raise SystemExit("not inside a git repository")

    include_untracked = False
    used_ref = None
    if args.scope == "uncommitted":
        ref_args = ["HEAD"]
        base = None
        include_untracked = True
    elif args.scope == "committed":
        base, used_ref = _resolve_base(args.base)
        ref_args = [f"{base}..HEAD"]
    else:  # both
        base, used_ref = _resolve_base(args.base)
        ref_args = [base]
        include_untracked = True

    files = _list_files(ref_args)
    if include_untracked:
        tracked_paths = {f["path"] for f in files}
        for u in _list_untracked():
            if u["path"] not in tracked_paths:
                files.append(u)
    payload = {
        "scope": args.scope,
        "base": base,
        "diff_args": ref_args,
        "files": files,
        "count": len(files),
    }
    if not files and base and not args.base:
        alternate = _alternate(args.scope, base, used_ref)
        if alternate:
            payload["alternate"] = alternate
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
