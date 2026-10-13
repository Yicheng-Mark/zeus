#!/usr/bin/env python3
"""Vendor the personal agent-stack skills into the builtin-skills corpus.

Usage:
    python vendor-personal-stack.py <personal-skills-root> [--dest <assets/builtin-skills>]

<personal-skills-root> is a `claude-code/skills` tree from the personal agent
backup (2026-10-10). Only the hand-curated PORTABLE_SKILLS below are vendored:
pure craft/process skills whose instructions hold inside AionUi's isolated
runtime. Machine-bound siblings (playwright/chrome-devtools MCP operation with
host-specific profiles, desktop Claude Code plugin/session/CLAUDE.md machinery)
stay out on purpose — their paths and harness references do not exist in the
app runtime. Do not "complete" the set by adding them back.

Portability rewrites applied to the copies (never to the source):
  - runnable `python ~/.claude/skills/<name>/scripts/...` invocations in
    markdown become skill-relative (`python scripts/...`), matching the corpus
    convention already used by the vendored knowledge-work skills; prose that
    merely *describes* desktop locations is left alone
  - handoff/scripts/skill_recommender.py is re-keyed to this corpus: signal
    rows recommending skills that are not vendored here are dropped, and its
    host-specific docstring line is rewritten

Validation mirrors aionui-extension's parse_frontmatter_fields (same as
vendor-knowledge-work-plugins.py): frontmatter must YAML-parse, `description`
must be a non-empty string, `name` must match the directory name. A skill that
would be silently dropped at runtime fails this script instead.

Idempotent: this script's previous output dirs are removed before the new set
is written. vendor-knowledge-work-plugins.py re-runs never touch these entries
(no plugin-prefix collision), and this script never touches theirs.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

import yaml

FINAL_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")

# Skills vendored from the personal stack, in corpus order (alphabetical).
# skill-creator stays out: the corpus already ships the upstream Anthropic
# skill-creator (auto-inject/skill-creator) and the personal copy is a
# machine-keyed fork of the same lineage — a second one would collide.
PORTABLE_SKILLS: tuple[str, ...] = (
    "decompose-and-execute",
    "diagnosing-bugs",
    "grilling",
    "handoff",
    "karpathy-guidelines",
    "resolving-merge-conflicts",
    "skill-security-auditor",
    "universal-scraping-architect",
    "writing-for-agents",
)

# `python ~/.claude/skills/<skill>/...` -> `python ...` (invocations only).
DESKTOP_PATH_INVOCATION_RE = re.compile(r"(python\s+)~/\.claude/skills/[A-Za-z0-9_.-]+/")

# handoff's recommender: drop signal rows whose target skill is not vendored.
RECOMMEND_BLOCK_START_RE = re.compile(r"^\s*\(re\.compile\(")
RECOMMEND_SKILL_LINE_RE = re.compile(r'^\s*"([^"]+)",\s*$')
RECOMMEND_DOCSTRING_OLD = (
    'Re-keyed to this machine\'s real skill set (~/.claude/skills + built-ins). If you\n'
    "move this skill to another host, re-key SKILL_SIGNALS below to that host's skills."
)
RECOMMEND_DOCSTRING_NEW = (
    "Re-keyed to the AionUi builtin-skills corpus. If you add or remove corpus\n"
    "skills, re-key SKILL_SIGNALS below to match."
)


def read_frontmatter(text: str) -> tuple[str, str]:
    """Split SKILL.md text into (frontmatter-yaml-text, body-after-closing-fence). Mirrors extract_frontmatter_text."""
    if text.startswith("﻿"):
        raise ValueError("SKILL.md starts with a UTF-8 BOM")
    after_open = None
    for prefix in ("---\n", "---\r\n"):
        if text.startswith(prefix):
            after_open = text[len(prefix):]
            break
    if after_open is None:
        raise ValueError("missing opening --- frontmatter fence")
    pos = 0
    for line in after_open.splitlines(keepends=True):
        stripped = line.rstrip("\r\n")
        if stripped == "---":
            return after_open[:pos], after_open[pos + len(line):]
        pos += len(line)
    raise ValueError("missing closing --- frontmatter fence")


def rewrite_invocation_paths(text: str) -> tuple[str, int]:
    return DESKTOP_PATH_INVOCATION_RE.subn(r"\1", text)


def rekey_skill_recommender(text: str, vendored: frozenset[str]) -> tuple[str, int]:
    """Drop SKILL_SIGNALS blocks whose recommended skill is not in the corpus."""
    if RECOMMEND_DOCSTRING_OLD not in text:
        raise ValueError("skill_recommender.py docstring no longer matches the expected source text")
    text = text.replace(RECOMMEND_DOCSTRING_OLD, RECOMMEND_DOCSTRING_NEW)

    lines = text.splitlines(keepends=True)
    out: list[str] = []
    dropped = 0
    i = 0
    while i < len(lines):
        if not RECOMMEND_BLOCK_START_RE.match(lines[i]):
            out.append(lines[i])
            i += 1
            continue
        # A signal tuple spans from `(re.compile(` to the line ending `"),`.
        block: list[str] = []
        while i < len(lines):
            block.append(lines[i])
            done = lines[i].rstrip("\r\n").endswith('"),')
            i += 1
            if done:
                break
        skill_line = next((l for l in block if RECOMMEND_SKILL_LINE_RE.match(l)), None)
        skill = RECOMMEND_SKILL_LINE_RE.match(skill_line).group(1) if skill_line else ""
        if skill in vendored or not skill:
            out.extend(block)
        else:
            dropped += 1
    return "".join(out), dropped


def validate_skill_dir(skill_dir: Path) -> None:
    """Fail loudly on anything the runtime scanner would silently drop."""
    text = skill_dir.joinpath("SKILL.md").read_text(encoding="utf-8")
    fm, _ = read_frontmatter(text)
    data = yaml.safe_load(fm) or {}
    if not isinstance(data, dict):
        raise ValueError("frontmatter is not a mapping")
    description = data.get("description")
    if not isinstance(description, str) or not description.strip():
        raise ValueError("description missing or empty")
    name = str(data.get("name") or "").strip()
    if name != skill_dir.name:
        raise ValueError(f"frontmatter name {name!r} != directory name {skill_dir.name!r}")
    if not FINAL_NAME_RE.match(name):
        raise ValueError(f"name {name!r} is not a valid skill name")


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="personal claude-code/skills tree (from the agent backup)")
    parser.add_argument(
        "--dest",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "crates" / "aionui-app" / "assets" / "builtin-skills",
    )
    args = parser.parse_args()

    source: Path = args.source
    for name in PORTABLE_SKILLS:
        if not (source / name / "SKILL.md").is_file():
            print(f"error: {source} is missing portable skill {name}", file=sys.stderr)
            return 1

    existing_names: set[str] = set()
    for skill_md in args.dest.rglob("SKILL.md"):
        rel = skill_md.relative_to(args.dest).as_posix()
        if rel.split("/")[0] in PORTABLE_SKILLS:
            continue  # this script's own previous output
        fm, _ = read_frontmatter(skill_md.read_text(encoding="utf-8"))
        data = yaml.safe_load(fm) or {}
        existing_names.add(str(data.get("name") or skill_md.parent.name))

    # Clean previous output of this script only.
    for name in PORTABLE_SKILLS:
        entry = args.dest / name
        if entry.exists():
            shutil.rmtree(entry)

    # Signals survive iff the recommended skill exists somewhere in the corpus:
    # this run's vendored set plus what was already there (e.g. the upstream
    # auto-inject skill-creator, which is not in PORTABLE_SKILLS but is real).
    vendored = frozenset(PORTABLE_SKILLS) | existing_names
    report: list[str] = []
    for name in PORTABLE_SKILLS:
        if name in existing_names:
            print(f"FAILED: {name} collides with an existing corpus skill", file=sys.stderr)
            return 1
        skill_dest = args.dest / name
        shutil.copytree(source / name, skill_dest)
        try:
            for md in sorted(skill_dest.rglob("*.md")):
                text = md.read_text(encoding="utf-8")
                rewritten, n = rewrite_invocation_paths(text)
                if n:
                    md.write_text(rewritten, encoding="utf-8", newline="")
                    report.append(f"{name}: rewrote {n} invocation path(s) in {md.relative_to(skill_dest).as_posix()}")
            recommender = skill_dest / "scripts" / "skill_recommender.py"
            if recommender.is_file():
                text = recommender.read_text(encoding="utf-8")
                rewritten, dropped = rekey_skill_recommender(text, vendored)
                recommender.write_text(rewritten, encoding="utf-8", newline="")
                report.append(f"{name}: re-keyed skill_recommender.py (dropped {dropped} non-corpus signal(s))")
            validate_skill_dir(skill_dest)
        except Exception:
            shutil.rmtree(skill_dest, ignore_errors=True)
            raise
        report.append(f"{name}: vendored")

    attribution = [
        "# personal-stack skills — attribution",
        "",
        "Vendored from the author's personal agent stack (backup 2026-10-10,",
        "`claude-code/skills` tree) — the author's own work, no external license.",
        "Regenerate with `AionCore/scripts/vendor-personal-stack.py <skills-root>`.",
        "",
        "Vendored (craft/process skills, portable across engines):",
        *[f"- {name}" for name in PORTABLE_SKILLS],
        "",
        "Deliberately NOT vendored (machine/harness-bound: host-specific browser",
        "profiles and cache paths, desktop Claude Code plugin/session/CLAUDE.md",
        "machinery that does not exist inside the app runtime):",
        "- chrome-devtools-mcp-basics, chrome-devtools-mcp-troubleshoot",
        "- claude-md-management (claude-md-improver)",
        "- claude-sound, commit-commands",
        "- plugin-dev/* (agent/command/hook/mcp/plugin-settings/plugin-structure/skill-development)",
        "- playwright-cli, playwright-mcp",
        "- session-report",
        "",
        "Also skipped, upstream already in corpus:",
        "- skill-creator (corpus ships the Anthropic original at auto-inject/skill-creator;",
        "  the personal copy is a machine-keyed fork of the same lineage)",
    ]
    args.dest.joinpath("personal-stack-ATTRIBUTION.md").write_text("\n".join(attribution) + "\n", encoding="utf-8", newline="\n")

    print(f"OK: {len(PORTABLE_SKILLS)} skills -> {args.dest}")
    for line in report:
        print(f"  - {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
