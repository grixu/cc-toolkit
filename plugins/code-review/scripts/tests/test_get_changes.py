"""get_changes.py against real git repositories built per test."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "get_changes.py"


def git(repo: Path, *args: str) -> str:
    res = subprocess.run(
        ["git", *args], cwd=repo, capture_output=True, text=True, check=True
    )
    return res.stdout


def commit(repo: Path, name: str, body: str) -> None:
    (repo / name).write_text(body)
    git(repo, "add", name)
    git(repo, "commit", "-m", f"add {name}")


def run_script(repo: Path, *args: str) -> dict:
    res = subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=repo, capture_output=True, text=True, check=True,
    )
    return json.loads(res.stdout)


@pytest.fixture
def origin_repo(tmp_path: Path) -> Path:
    """A clone whose branch tracks its own pushed counterpart on origin."""
    upstream = tmp_path / "origin.git"
    seed = tmp_path / "seed"
    seed.mkdir()
    git(seed, "init", "-b", "main")
    git(seed, "config", "user.email", "t@example.com")
    git(seed, "config", "user.name", "T")
    commit(seed, "base.ts", "export const a = 1\n")
    git(seed, "clone", "--bare", str(seed), str(upstream))

    work = tmp_path / "work"
    subprocess.run(["git", "clone", str(upstream), str(work)], check=True,
                   capture_output=True)
    git(work, "config", "user.email", "t@example.com")
    git(work, "config", "user.name", "T")
    git(work, "checkout", "-b", "feature")
    commit(work, "feature.ts", "export const b = 2\n")
    git(work, "push", "-u", "origin", "feature")
    return work


def test_committed_reports_alternate_base_when_upstream_sees_nothing(origin_repo: Path):
    out = run_script(origin_repo, "--scope", "committed")

    assert out["count"] == 0
    alt = out["alternate"]
    assert alt["ref"] == "origin/main"
    assert alt["count"] == 1
    files = run_script(origin_repo, "--scope", "committed", "--base", alt["ref"])["files"]
    assert [f["path"] for f in files] == ["feature.ts"]


def test_no_alternate_when_the_resolved_base_already_sees_the_change(origin_repo: Path):
    git(origin_repo, "commit", "--allow-empty", "-m", "unpushed")

    out = run_script(origin_repo, "--scope", "committed")

    assert out["count"] == 0  # the empty commit touches no file
    assert "alternate" in out  # …but origin/main still holds feature.ts

    commit(origin_repo, "later.ts", "export const c = 3\n")
    out = run_script(origin_repo, "--scope", "committed")
    assert [f["path"] for f in out["files"]] == ["later.ts"]
    assert "alternate" not in out


def test_explicit_base_never_gets_an_alternate(origin_repo: Path):
    out = run_script(origin_repo, "--scope", "committed", "--base", "HEAD")

    assert out["count"] == 0
    assert "alternate" not in out
