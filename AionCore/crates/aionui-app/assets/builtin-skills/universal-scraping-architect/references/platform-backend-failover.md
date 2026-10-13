# Platform Backend Failover — Ordered Routing, Real Probing, Dated Intel

Absorbed 2026-09-21 from [Agent-Reach](https://github.com/Panniantong/Agent-Reach) — a trending "capability layer" CLI that routes agents to working internet-access backends. Evaluated and **not installed** in this environment: every channel it manages already has a resident route (GLM-native web_reader, built-in WebSearch, gh, yt-dlp, Playwright Edge-AutoMCP persistent profile, the X/抖音 spider pipelines). What is worth keeping is its routing pattern and its field-tested backend intel.

## The Routing Pattern

Model every platform's fetch path as an **ordered candidate list**, not a single tool:

1. **Primary + fallbacks per platform.** Swapping backends later means reordering the list — a config change, never a pipeline rewrite.
2. **Probe for real, not for existence.** Select a candidate by attempting a minimal actual fetch through it. "Binary installed" ≠ "channel alive": sites risk-control tools into death (HTTP 412), APIs get deprecated, and single-platform CLIs go unmaintained in batches (a wave of them died together in 2026-03).
3. **Failover is silent to the caller.** When the primary dies, the pipeline serves from the next candidate with zero user action; the dead backend gets a fix-or-retire note in the run log.
4. **Doctor-style audit.** One report answers, per platform: which backend is currently serving, what is broken, and what the fix is. Date every probe — backend health drifts on a months cadence.

When building a pipeline here: put the candidate list in one place the fetcher iterates (a config block or list constant at the top of the script), log which candidate served alongside a probe date, and when a channel dies update the table below instead of scattering the fix through code.

## Backend Intel (Agent-Reach snapshot, 2026-09-21)

Moving facts — this records what upstream field-testing found at the snapshot date. Re-probe before betting a new pipeline on any row.

| Platform | Upstream verdict (2026-09) | Resident route (this environment) |
|---|---|---|
| Web page | Jina Reader — free, no key | web_reader (GLM native) → Jina Reader fallback |
| Web search | Exa via mcporter (MCP, no key) | WebSearch (built-in) → Exa |
| GitHub | gh, official; private repos/Issues need auth | gh |
| YouTube | yt-dlp still the best (154k★); zero-config | yt-dlp |
| B站 | **yt-dlp 412-risk-controlled and retired for B站 (2026-06)**; bili-cli works logged-out (search + read); OpenCLI search API as backup | Playwright intercept of the site's own detail API + curl (the 抖音 pattern), or bili-cli — decide per task |
| X / Twitter | twitter-cli (search stable) → OpenCLI browser session; manual cookie export required (auth_token + ct0) | vxtwitter API + yt-dlp pipeline (existing) → twitter-cli / OpenCLI |
| Reddit | Anonymous JSON API dead; official API approval-gated — **no zero-config path left**, browser session or rdt-cli + cookie only | Playwright Edge-AutoMCP persistent profile |
| 小红书 | OpenCLI reusing the user's existing browser session; xiaohongshu-mcp (server) / xhs-cli with manual cookie export | Playwright Edge-AutoMCP persistent profile (login once, persists) |
| Facebook / Instagram | Browser-login session is the practical path; Graph API approval-gated (IG needs Business/Creator account); instaloader-type paths unstable | Playwright Edge-AutoMCP persistent profile |
| LinkedIn | mcp-server-linkedin; public pages readable via Jina | web_reader for public pages |
| Boss直聘 | Dedicated real-Chrome CDP route, manual login; no fallback listed | Playwright Edge-AutoMCP persistent profile |
| V2EX / 雪球 | Zero-config or simple config | web_reader |
| RSS | feedparser (Python standard choice) | web_reader / feedparser |
| 小宇宙播客 | Whisper free transcription | no resident channel — decide when needed |
