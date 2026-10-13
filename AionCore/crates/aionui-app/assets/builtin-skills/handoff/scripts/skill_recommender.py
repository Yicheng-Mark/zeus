#!/usr/bin/env python3
"""skill_recommender.py — Recommend which skills the next session should use.

Stdlib-only. Scans a handoff document for content signals and matches them to
the skills actually installed on this host. Output: ranked recommendations with
rationale.

Re-keyed to the AionUi builtin-skills corpus. If you add or remove corpus
skills, re-key SKILL_SIGNALS below to match.

Signal-to-skill mapping (representative):

  - "write a skill" / "new skill" / "skill author"    -> skill-creator
  - "karpathy" / "complexity" / "refactor"            -> karpathy-guidelines
  - "decompose" / "migration" / "big feature"         -> decompose-and-execute
  - "LCP" / "slow page" / "memory leak" / "OOM"       -> diagnosing-bugs
  - "a11y" / "accessibility" / "ARIA"                 -> chrome-devtools-mcp-basics
  - "playwright" / "browser automation"               -> playwright-mcp
  - "chrome devtools" / "perf trace"                  -> chrome-devtools-mcp-basics
  - "scrape" / "crawl"                                -> universal-scraping-architect
  - "security" / "audit skill" / "malware"            -> skill-security-auditor
  - "mcp server" / "tool integration"                 -> plugin-dev:mcp-integration
  - "LLM cost" / "token spend"                        -> claude-api (built-in)
  - "handoff" / "next session"                        -> handoff

NO LLM CALLS. Pattern-match recommender.

Usage:
    python skill_recommender.py                          # uses embedded sample
    python skill_recommender.py path/to/handoff.md
    python skill_recommender.py handoff.md --output json
"""

import argparse
import json
import re
import sys
from typing import Any, Dict, List, Tuple


# (keyword pattern, skill name, rationale template)
SKILL_SIGNALS: List[Tuple[re.Pattern, str, str]] = [
    (re.compile(r"\b(write|create|author|build)\s+(a\s+)?skill\b", re.IGNORECASE),
     "skill-creator",
     "Next session involves authoring a new skill; skill-creator gives the description/progressive-discipline authoring workflow."),
    (re.compile(r"\b(karpathy|complexity|refactor|code\s+quality)\b", re.IGNORECASE),
     "karpathy-guidelines",
     "Next session involves per-step code-quality discipline; karpathy-guidelines is the lightweight always-on mindset."),
    (re.compile(r"\b(decompose|multi-step|migration|multi-file|big\s+feature)\b", re.IGNORECASE),
     "decompose-and-execute",
     "Next session involves a large/multi-step task; decompose-and-execute runs the TodoWrite + parallel-agent execution loop."),
    (re.compile(r"\b(LCP|largest\s+contentful|slow\s+page|Core\s+Web\s+Vital|CWV)\b", re.IGNORECASE),
     "diagnosing-bugs",
     "Next session involves page-load/performance debugging; diagnosing-bugs owns the perf-regression diagnosis loop."),
    (re.compile(r"\b(memory\s+leak|heapsnapshot|heap\s+snapshot|OOM|out\s+of\s+memory)\b", re.IGNORECASE),
     "diagnosing-bugs",
     "Next session involves a memory leak/OOM; diagnosing-bugs owns the feedback-loop-first diagnosis discipline."),
    (re.compile(r"\b(scrape|crawling|web\s+extraction|firecrawl)\b", re.IGNORECASE),
     "universal-scraping-architect",
     "Next session involves web scraping; universal-scraping-architect covers Firecrawl + local Python extraction pipelines."),
    (re.compile(r"\b(security\s+audit|is\s+this\s+skill\s+safe|malware|supply\s+chain)\b", re.IGNORECASE),
     "skill-security-auditor",
     "Next session involves vetting a skill/plugin before install; skill-security-auditor is the pre-install security scanner."),
    (re.compile(r"\b(handoff|next\s+session|continue\s+the\s+work)\b", re.IGNORECASE),
     "handoff",
     "Next session may need to be handed off again; handoff produces continuity docs."),
]


SAMPLE_HANDOFF = """# Handoff — tighten trigger boundaries on the chrome-devtools-mcp family

## Goal of next session
Add NOT-for negative conditions to the chrome-devtools-mcp-basics / -troubleshoot
siblings so they stop colliding on generic "devtools" triggers. Validate with
skill-creator's description rules.

## State of play
Done: basics router + troubleshoot specialist built.
In progress: trigger-boundary edits across the family.
Blocking: nothing.

## Open decisions
- Compress the basics SKILL.md to save tokens?
- Re-run the perf trace capture against the LCP sample?

## Artifacts
- Branch: feature/cdt-trigger-boundaries
- Issues: none
- PRD: documentation/skills/chrome-devtools-family-plan.md
"""


def recommend(text: str) -> List[Dict[str, Any]]:
    hits: Dict[str, Dict[str, Any]] = {}
    for pattern, skill, rationale in SKILL_SIGNALS:
        matches = pattern.findall(text)
        if not matches:
            continue
        if skill not in hits:
            hits[skill] = {"skill": skill, "rationale": rationale, "hits": 0, "matched_keywords": []}
        hits[skill]["hits"] += len(matches)
        hits[skill]["matched_keywords"].extend(
            m if isinstance(m, str) else " ".join(filter(None, m))
            for m in matches[:3]
        )
    ranked = sorted(hits.values(), key=lambda x: -x["hits"])
    return ranked


def analyze(text: str) -> Dict[str, Any]:
    recommendations = recommend(text)
    return {
        "total_skills_recommended": len(recommendations),
        "recommendations": recommendations,
    }


def render_text(r: Dict[str, Any]) -> str:
    lines = []
    lines.append("=" * 72)
    lines.append("SKILL RECOMMENDER FOR NEXT SESSION")
    lines.append("=" * 72)
    lines.append("")
    lines.append(f"Skills recommended: {r['total_skills_recommended']}")
    lines.append("")
    if not r["recommendations"]:
        lines.append("No skill signals detected. Next session may not need a specific skill.")
    else:
        for i, rec in enumerate(r["recommendations"], start=1):
            kw_preview = ", ".join(rec["matched_keywords"][:3])
            lines.append(f"  [{i}] {rec['skill']:30s} (matched {rec['hits']}x: {kw_preview})")
            lines.append(f"      {rec['rationale']}")
            lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Recommend skills for the next session based on handoff content.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("path", nargs="?", help="Path to handoff markdown (uses embedded sample if omitted)")
    parser.add_argument("--output", choices=("text", "json"), default="text", help="Output format")
    args = parser.parse_args()

    if args.path:
        try:
            with open(args.path, "r", encoding="utf-8") as f:
                text = f.read()
        except (IOError, OSError) as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
    else:
        text = SAMPLE_HANDOFF

    result = analyze(text)
    if args.output == "json":
        print(json.dumps(result, indent=2))
    else:
        print(render_text(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
