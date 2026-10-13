# personal-stack skills — attribution

Vendored from the author's personal agent stack (backup 2026-10-10,
`claude-code/skills` tree) — the author's own work, no external license.
Regenerate with `AionCore/scripts/vendor-personal-stack.py <skills-root>`.

Vendored (craft/process skills, portable across engines):
- decompose-and-execute
- diagnosing-bugs
- grilling
- handoff
- karpathy-guidelines
- resolving-merge-conflicts
- skill-security-auditor
- universal-scraping-architect
- writing-for-agents

Deliberately NOT vendored (machine/harness-bound: host-specific browser
profiles and cache paths, desktop Claude Code plugin/session/CLAUDE.md
machinery that does not exist inside the app runtime):
- chrome-devtools-mcp-basics, chrome-devtools-mcp-troubleshoot
- claude-md-management (claude-md-improver)
- claude-sound, commit-commands
- plugin-dev/* (agent/command/hook/mcp/plugin-settings/plugin-structure/skill-development)
- playwright-cli, playwright-mcp
- session-report

Also skipped, upstream already in corpus:
- skill-creator (corpus ships the Anthropic original at auto-inject/skill-creator;
  the personal copy is a machine-keyed fork of the same lineage)
