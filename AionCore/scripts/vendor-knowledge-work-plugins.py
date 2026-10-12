#!/usr/bin/env python3
"""Vendor anthropics/knowledge-work-plugins skills into the builtin-skills corpus.

Usage:
    python vendor-knowledge-work-plugins.py <kwp-clone-dir> [--dest <assets/builtin-skills>] [--manifest <out.json>]

Copies every plugin's skills/ tree to <dest>/<plugin>-<skill-name>/ as a FLAT
top-level corpus entry: directory name and SKILL.md frontmatter `name` are both
`<plugin>-<skill-name>`, so the flat skill namespace (conversation presets,
`[LOAD_SKILL: name]`, the per-view symlink names, the name-based source-path
fallbacks) stays globally unique and every existing consumer keeps working.
Everything else inside a skill directory is copied verbatim.

Validation mirrors aionui-extension's `parse_frontmatter_fields`: frontmatter must
YAML-parse, `description` must be a non-empty string, `name` may be empty (the
scanner then falls back to the directory name). A skill that would be silently
dropped at runtime fails this script instead.

Idempotent: a previous run's vendored directories (and the legacy nested
`knowledge-work/` tree) are removed before the new set is written. Run from a
fresh clone of https://github.com/anthropics/knowledge-work-plugins.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

import yaml

FINAL_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")

# Vendored roots are recognized by these plugin prefixes on re-runs.
PARTNER_DIRS = ("apollo", "brand-voice", "common-room", "slack", "zoom-plugin")


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


def collect_skill_dirs(root: Path) -> list[Path]:
    """Mirror collect_skill_dirs_recursive: descend until a dir holds SKILL.md."""
    out: list[Path] = []
    if (root / "SKILL.md").is_file():
        return [root]
    for entry in sorted(root.iterdir()):
        if entry.is_dir() and not entry.is_symlink():
            out.extend(collect_skill_dirs(entry))
    return out


def sanitize(name: str) -> str:
    lowered = name.lower()
    cleaned = re.sub(r"[^a-z0-9-]+", "-", lowered).strip("-")
    return re.sub(r"-{2,}", "-", cleaned)


def rewrite_name_line(frontmatter: str, new_name: str) -> str:
    """Replace the value of the first top-level `name:` key, preserving line endings."""
    lines = frontmatter.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if re.match(r"^name:\s*\S", line):
            ending = "\r\n" if line.endswith("\r\n") else "\n"
            lines[i] = f"name: {new_name}{ending}"
            return "".join(lines)
    raise ValueError("frontmatter has no `name:` line")


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="clone of anthropics/knowledge-work-plugins")
    parser.add_argument(
        "--dest",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "crates" / "aionui-app" / "assets" / "builtin-skills",
    )
    parser.add_argument("--manifest", type=Path, default=None, help="where to write the plugin->skill manifest json")
    args = parser.parse_args()

    source: Path = args.source
    if not (source / "README.md").is_file():
        print(f"error: {source} does not look like a knowledge-work-plugins clone", file=sys.stderr)
        return 1

    plugins = sorted(p for p in source.iterdir() if p.is_dir() and (p / "skills").is_dir() and p.name != ".git")
    partner = sorted(p for p in (source / "partner-built").glob("*/skills")) if (source / "partner-built").is_dir() else []
    plugin_dirs = plugins + [p.parent for p in partner]
    prefixes = tuple(f"{p.name}-" for p in plugin_dirs)

    existing_names: set[str] = set()
    for skill_md in args.dest.rglob("SKILL.md"):
        # Skip this script's own previous output (nested legacy tree or flat dirs).
        rel = skill_md.relative_to(args.dest).as_posix()
        if rel.startswith("knowledge-work/") or rel.split("/")[0].startswith(prefixes):
            continue
        fm, _ = read_frontmatter(skill_md.read_text(encoding="utf-8"))
        data = yaml.safe_load(fm) or {}
        existing_names.add(str(data.get("name") or skill_md.parent.name))

    manifest: dict[str, list[dict]] = {}
    seen: set[str] = set()
    errors: list[str] = []

    # Clean previous output: legacy nested tree + flat vendored dirs.
    legacy = args.dest / "knowledge-work"
    if legacy.exists():
        shutil.rmtree(legacy)
    for entry in sorted(args.dest.iterdir()):
        if entry.is_dir() and entry.name.startswith(prefixes):
            shutil.rmtree(entry)

    for plugin_dir in plugin_dirs:
        plugin = plugin_dir.name
        entries = []
        for skill_dir in collect_skill_dirs(plugin_dir / "skills"):
            rel = skill_dir.relative_to(plugin_dir / "skills")
            try:
                text = skill_dir.joinpath("SKILL.md").read_text(encoding="utf-8")
                fm, body = read_frontmatter(text)
                data = yaml.safe_load(fm) or {}
                if not isinstance(data, dict):
                    raise ValueError("frontmatter is not a mapping")
                description = data.get("description")
                if not isinstance(description, str) or not description.strip():
                    raise ValueError("description missing or empty")
                base_name = str(data.get("name") or "").strip() or rel.name
                final_name = sanitize(f"{plugin}-{base_name}")
                if not FINAL_NAME_RE.match(final_name):
                    raise ValueError(f"sanitized name {final_name!r} is not a valid skill name")
                if final_name in seen:
                    raise ValueError(f"duplicate skill name {final_name!r}")
                if final_name in existing_names:
                    raise ValueError(f"name {final_name!r} collides with an existing corpus skill")
                seen.add(final_name)
                new_skill_md = "---\n" + rewrite_name_line(fm, final_name) + "---\n" + body
                # Re-validate the WRITTEN form the same way the Rust scanner
                # will read it (fences intact, renamed name parses).
                written_fm, written_body = read_frontmatter(new_skill_md)
                written = yaml.safe_load(written_fm) or {}
                if written.get("name") != final_name or not str(written.get("description", "")).strip():
                    raise ValueError("rewritten SKILL.md failed post-write validation")
                if written_body != body:
                    raise ValueError("body was altered by the rewrite")
                skill_dest = args.dest / final_name
                shutil.copytree(skill_dir, skill_dest)
                skill_dest.joinpath("SKILL.md").write_text(new_skill_md, encoding="utf-8", newline="")
                entries.append({"dir": str(rel.as_posix()), "name": final_name, "description_chars": len(description)})
            except Exception as exc:  # noqa: BLE001 - collect all, fail at the end
                errors.append(f"{plugin}/{rel.as_posix()}: {exc}")
        manifest[plugin] = sorted(entries, key=lambda e: e["name"])

    if errors:
        print(f"FAILED: {len(errors)} skill(s) invalid:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        # Roll back everything this run created so a bad vendor never lands half-done.
        for entry in sorted(args.dest.iterdir()):
            if entry.is_dir() and entry.name.startswith(prefixes):
                shutil.rmtree(entry)
        return 1

    attribution = ["# knowledge-work plugins — attribution", "",
                   "Skills vendored from https://github.com/anthropics/knowledge-work-plugins",
                   "and renamed to <plugin>-<skill>. Regenerate with",
                   "AionCore/scripts/vendor-knowledge-work-plugins.py <clone>.", "",
                   "Top-level plugins are Apache-2.0 (see knowledge-work-LICENSE).",
                   "Partner plugins carry their own licenses:", ""]
    for plugin_dir in plugin_dirs:
        license_file = plugin_dir / "LICENSE"
        label = license_file.read_text(encoding="utf-8", errors="replace").splitlines()[0].strip() if license_file.is_file() else "see repository"
        attribution.append(f"- {plugin_dir.name}: {label}")
    args.dest.joinpath("knowledge-work-ATTRIBUTION.md").write_text("\n".join(attribution) + "\n", encoding="utf-8", newline="\n")
    if (source / "LICENSE").is_file():
        shutil.copy2(source / "LICENSE", args.dest / "knowledge-work-LICENSE")

    total = sum(len(v) for v in manifest.values())
    manifest_path = args.manifest or Path.cwd() / "knowledge-work-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK: {total} skills across {len(manifest)} plugins -> {args.dest}")
    print(f"manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
