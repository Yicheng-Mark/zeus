---
name: handoff
description: Compact the current conversation into a handoff document for another
  agent to pick up. References existing artifacts (PRDs, plans, ADRs, issues, commits,
  diffs) by path or URL instead of duplicating them. Use when user wants to hand off
  the conversation to a fresh agent or starts a new session that picks up prior work.
  Forward-looking continuity only — NOT for a retrospective end-of-session report
  or summary (use session-report for HTML usage analytics of tokens/cache/subagents/skills; use a manual
  summary or the next session's context for work retrospectives).
license: MIT
metadata:
  derived_from: https://github.com/mattpocock/skills/tree/main/skills/productivity/handoff
  original_author: Matt Pocock (@mattpocock)
  original_license: MIT
  voice: Matt Pocock — no-duplication, reference-existing-artifacts, tailored to next-session
    focus
version: 1.0.0
---

# Handoff

> Derived from [Matt Pocock's handoff](https://github.com/mattpocock/skills/tree/main/skills/productivity/handoff) (MIT). Matt's no-duplication discipline preserved verbatim. Additions: validation tools + references (see [references/companion_tooling.md](references/companion_tooling.md)).

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it to a path produced by `mktemp -t handoff-XXXXXX.md` (read the file before you write to it). Windows without mktemp (cmd/PowerShell): write to the user temp dir instead — `$env:TEMP\handoff-<name>.md` in PowerShell (Git Bash has mktemp, so the default works there).

Suggest the skills to be used, if any, by the next session.

Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

## Sections

- **Goal of next session** (from user argument or inferred)
- **State of play** (what's done, what's blocking)
- **Open decisions** (what the next agent must decide)
- **Skills to use** (concrete list)
- **Artifacts** (paths/URLs to PRDs, plans, ADRs, issues, branches, PRs — do not duplicate)

## Tooling

See [references/companion_tooling.md](references/companion_tooling.md). Stdlib-Python tools under `scripts/`: template generator + artifact deduplicator + skill recommender.

## Methodology references (read on demand)

Load these only at the relevant step — they are not needed for a straightforward handoff:

- [references/handoff_structure.md](references/handoff_structure.md) — canonical section order and what each section must contain. Read first when the handoff covers a multi-session, multi-artifact effort.
- [references/deduplication_discipline.md](references/deduplication_discipline.md) — the no-duplication rules (reference artifacts by path/URL, never paste them in). Read when the conversation touches PRDs, plans, ADRs, or diffs.
- [references/next_session_skill_matching.md](references/next_session_skill_matching.md) — how to choose the concrete "Skills to use" list for the next session. Read when filling the Skills section.

---

**Version:** 1.0.0
**Derived:** Matt Pocock (MIT) + this repo's wrapper
