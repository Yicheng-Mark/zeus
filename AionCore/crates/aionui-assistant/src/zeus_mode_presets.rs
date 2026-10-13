//! Zeus fork: skill-name presets for the three fixed mode assistants.
//!
//! Every generated (per-agent) assistant is created with the mode's preset as
//! its fixed skill default, so each engine starts with its role's share of the
//! vendored knowledge-work corpus on board with zero user action - and can
//! still be tuned per assistant in the editor afterwards.
//!
//! The names reference builtin skills vendored under
//! `aionui-app/assets/builtin-skills/` by two scripts: the flat
//! `<plugin>-<skill>` corpus from anthropics/knowledge-work-plugins via
//! `AionCore/scripts/vendor-knowledge-work-plugins.py`, and the portable
//! personal-stack craft skills via `AionCore/scripts/vendor-personal-stack.py`
//! (see PERSONAL_STACK_SKILLS below). Names, not skill row ids: conversation
//! creation resolves names against the live catalog, which keeps the presets
//! stable across machines and reinstalls.

/// Bare vendored skill names the Zeus fork ships without a plugin prefix
/// (officecli / morph carry their own prefixes; these are standalone). Listed
/// so the prefix test below can tell them apart from typos.
pub const ZEUS_STANDALONE_SKILLS: &[&str] = &[
    "mermaid",
    "multi-agent-orchestration",
    "pdf",
    "weixin-file-send",
    "x-recruiter",
    "xiaohongshu-recruiter",
];

/// 办公 (OpenCode): the full business/ops corpus.
pub const OFFICE_MODE_SKILLS: &[&str] = &[
    "apollo-enrich-lead", "apollo-prospect", "apollo-sequence-load",
    "bio-research-instrument-data-to-allotrope", "bio-research-nextflow-development",
    "bio-research-scientific-problem-selection", "bio-research-scvi-tools",
    "bio-research-single-cell-rna-qc", "bio-research-start", "brand-voice-brand-voice-enforcement",
    "brand-voice-discover-brand", "brand-voice-guideline-generation",
    "common-room-account-research", "common-room-call-prep", "common-room-compose-outreach",
    "common-room-contact-research", "common-room-prospect", "common-room-weekly-prep-brief",
    "customer-support-customer-escalation", "customer-support-customer-research",
    "customer-support-draft-response", "customer-support-kb-article",
    "customer-support-ticket-triage", "data-analyze", "data-build-dashboard", "data-create-viz",
    "data-data-context-extractor", "data-data-visualization", "data-explore-data",
    "data-sql-queries", "data-statistical-analysis", "data-validate-data", "data-write-query",
    "enterprise-search-digest", "enterprise-search-knowledge-synthesis", "enterprise-search-search",
    "enterprise-search-search-strategy", "enterprise-search-source-management",
    "finance-audit-support", "finance-close-management", "finance-financial-statements",
    "finance-journal-entry", "finance-journal-entry-prep", "finance-reconciliation",
    "finance-sox-testing", "finance-variance-analysis", "human-resources-comp-analysis",
    "human-resources-draft-offer", "human-resources-interview-prep", "human-resources-onboarding",
    "human-resources-org-planning", "human-resources-people-report",
    "human-resources-performance-review", "human-resources-policy-lookup",
    "human-resources-recruiting-pipeline", "legal-brief", "legal-compliance-check",
    "legal-legal-response", "legal-legal-risk-assessment", "legal-meeting-briefing",
    "legal-review-contract", "legal-signature-request", "legal-triage-nda", "legal-vendor-check",
    "marketing-brand-review", "marketing-campaign-plan", "marketing-competitive-brief",
    "marketing-content-creation", "marketing-draft-content", "marketing-email-sequence",
    "marketing-performance-report", "marketing-seo-audit", "morph-ppt", "morph-ppt-3d",
    "multi-agent-orchestration",
    "officecli-academic-paper", "officecli-data-dashboard", "officecli-docx",
    "officecli-financial-model", "officecli-pitch-deck", "officecli-pptx",
    "officecli-word-form", "officecli-xlsx", "operations-capacity-plan",
    "operations-change-request", "operations-compliance-tracking", "operations-process-doc",
    "operations-process-optimization", "operations-risk-assessment", "operations-runbook",
    "operations-status-report", "operations-vendor-review", "pdf", "pdf-viewer-view-pdf",
    "product-management-competitive-brief", "product-management-metrics-review",
    "product-management-product-brainstorming", "product-management-roadmap-update",
    "product-management-sprint-planning", "product-management-stakeholder-update",
    "product-management-synthesize-research", "product-management-write-spec",
    "productivity-memory-management", "productivity-start", "productivity-task-management",
    "productivity-update", "sales-account-context", "sales-account-plan", "sales-account-research",
    "sales-account-tiering", "sales-call-prep", "sales-call-summary", "sales-close-plan",
    "sales-competitive-intelligence", "sales-create-an-asset", "sales-crm-hygiene-check",
    "sales-customer-health", "sales-customer-voice", "sales-daily-briefing",
    "sales-deal-advance-gap", "sales-deal-review", "sales-deal-signals", "sales-deal-slip-scenario",
    "sales-draft-outreach", "sales-end-of-day", "sales-expansion-whitespace", "sales-forecast",
    "sales-handle-objection", "sales-inbox-sweep", "sales-lead-triage", "sales-log-activity",
    "sales-pipeline-review", "sales-renewal-radar", "sales-rep-context", "sales-route-lead",
    "sales-schedule-meeting", "sales-setup", "sales-stakeholder-map", "sales-team-pipeline",
    "sales-update-opportunity", "sales-weekly-wrap", "sales-win-loss-review",
    "slack-slack-messaging", "slack-slack-search", "small-business-ad-manager",
    "small-business-ap-processor", "small-business-brand-style", "small-business-build-agent",
    "small-business-build-connector", "small-business-business-pulse", "small-business-call-list",
    "small-business-canva-creator", "small-business-cash-flow-snapshot",
    "small-business-close-month", "small-business-content-strategy",
    "small-business-contract-review", "small-business-crm-autopilot",
    "small-business-grant-rfp-writer", "small-business-grow-pipeline",
    "small-business-growth-pulse", "small-business-hiring-screener", "small-business-inbox-manager",
    "small-business-inventory-planner", "small-business-invoice-chase",
    "small-business-job-post-builder", "small-business-lead-finder", "small-business-lead-triage",
    "small-business-marketing-monday", "small-business-monday-brief",
    "small-business-month-end-prep", "small-business-outreach-composer",
    "small-business-pay-the-bills", "small-business-payroll-prep", "small-business-plan-payroll",
    "small-business-proposal-builder", "small-business-reactivate", "small-business-report-builder",
    "small-business-report-pack", "small-business-restock", "small-business-review-reputation",
    "small-business-seo-ai-visibility", "small-business-smb-onboard", "small-business-smb-router",
    "small-business-social-content-engine", "small-business-speed-to-lead",
    "small-business-tax-prep", "small-business-tax-season-organizer",
    "small-business-ticket-deflector", "weixin-file-send", "x-recruiter",
    "xiaohongshu-recruiter",
];

/// 设计 (Zeus aionrs): design craft plus the viz-adjacent data skills.
pub const DESIGN_MODE_SKILLS: &[&str] = &[
    "brand-voice-brand-voice-enforcement", "brand-voice-discover-brand",
    "brand-voice-guideline-generation", "data-build-dashboard", "data-create-viz",
    "data-data-visualization", "design-accessibility-review", "design-design-critique",
    "design-design-handoff", "design-design-system", "design-research-synthesis",
    "design-user-research", "design-ux-copy", "multi-agent-orchestration", "pdf-viewer-view-pdf",
    "productivity-memory-management", "productivity-start", "productivity-task-management",
    "productivity-update",
];

/// 开发 (Claude Code): engineering plus integration-building skills, plus the
/// personal-stack craft/process skills (see PERSONAL_STACK_SKILLS).
pub const DEV_MODE_SKILLS: &[&str] = &[
    "cowork-plugin-management-cowork-plugin-customizer",
    "cowork-plugin-management-create-cowork-plugin", "data-analyze", "data-build-dashboard",
    "data-create-viz", "data-data-context-extractor", "data-data-visualization",
    "data-explore-data", "data-sql-queries", "data-statistical-analysis", "data-validate-data",
    "data-write-query", "decompose-and-execute", "diagnosing-bugs", "engineering-architecture",
    "engineering-code-review", "engineering-debug",
    "engineering-deploy-checklist", "engineering-documentation", "engineering-incident-response",
    "engineering-standup", "engineering-system-design", "engineering-tech-debt",
    "engineering-testing-strategy", "enterprise-search-digest",
    "enterprise-search-knowledge-synthesis", "enterprise-search-search",
    "enterprise-search-search-strategy", "enterprise-search-source-management", "grilling",
    "handoff", "karpathy-guidelines", "mermaid", "multi-agent-orchestration", "pdf-viewer-view-pdf", "productivity-memory-management",
    "productivity-start", "productivity-task-management", "productivity-update",
    "resolving-merge-conflicts", "skill-security-auditor", "universal-scraping-architect",
    "writing-for-agents", "zoom-plugin-build-zoom-bot",
    "zoom-plugin-build-zoom-contact-center-app", "zoom-plugin-build-zoom-meeting-app",
    "zoom-plugin-build-zoom-meeting-sdk-app", "zoom-plugin-build-zoom-phone-integration",
    "zoom-plugin-build-zoom-rest-api-app", "zoom-plugin-build-zoom-team-chat-app",
    "zoom-plugin-build-zoom-video-sdk-app", "zoom-plugin-build-zoom-virtual-agent",
    "zoom-plugin-choose-zoom-approach", "zoom-plugin-debug-zoom",
    "zoom-plugin-debug-zoom-integration", "zoom-plugin-design-mcp-workflow",
    "zoom-plugin-plan-zoom-integration", "zoom-plugin-plan-zoom-product", "zoom-plugin-probe-sdk",
    "zoom-plugin-rivet-sdk", "zoom-plugin-scribe", "zoom-plugin-setup-zoom-mcp",
    "zoom-plugin-setup-zoom-oauth", "zoom-plugin-setup-zoom-webhooks",
    "zoom-plugin-setup-zoom-websockets", "zoom-plugin-start", "zoom-plugin-ui-toolkit-web",
    "zoom-plugin-zoom-apps-sdk", "zoom-plugin-zoom-cobrowse-sdk", "zoom-plugin-zoom-general",
    "zoom-plugin-zoom-mcp", "zoom-plugin-zoom-oauth", "zoom-plugin-zoom-rtms",
];

/// Personal-stack craft/process skills vendored by
/// `AionCore/scripts/vendor-personal-stack.py` from the author's own agent
/// backup. Bare names (no plugin prefix) — the uniqueness test below allows
/// exactly these alongside the `<plugin>-` prefixed knowledge-work names, so
/// adding a name here without vendoring the skill fails tests, and vendoring
/// one without registering it here silently shrinks the dev preset.
pub const PERSONAL_STACK_SKILLS: &[&str] = &[
    "decompose-and-execute",
    "diagnosing-bugs",
    "grilling",
    "handoff",
    "karpathy-guidelines",
    "resolving-merge-conflicts",
    "skill-security-auditor",
    "universal-scraping-architect",
    "writing-for-agents",
];

/// Mode rule bodies (the assistant's system-prompt channel — currently the
/// only per-mode prompt text in the product). Chinese-first: the fixed catalog
/// targets a zh user base, and the rule reader falls back to the locale-less
/// `<id>.md` file for every locale.
///
/// reconcile_generated_assistant seeds the matching rule ONCE when no rule
/// file exists yet; a file the user has written or edited always wins.
pub const OFFICE_MODE_RULE: &str = r#"# 角色

你是「办公」助手（OpenCode 引擎）。你的职责覆盖文档、数据、调研、运营类知识工作。

# 多 Agent 工作方式（重要）

用户只发任务，你来编排。对任何有多个组成部分或需要读大量材料的任务：

1. 先分解任务，识别可并行的独立子任务。
2. 用 Task 工具（subagent）把子任务派发出去：无依赖的并行派发，有依赖的按顺序串行。
3. 主上下文只保留计划、各子任务的结论、最终交付物。读资料、探索、试错一律下沉给子 agent，让它们只回传 ≤10 行的结论摘要。
4. 文档产出（docx/xlsx/pptx/pdf）让子 agent 直接写文件，你只记录路径与结论。
5. 合并前验证关键结果，矛盾之处派子 agent 复核，不要自己重读原始材料。

小任务（单步可答、单文件小改）直接完成，不编排。

# 技能

按需加载技能（[LOAD_SKILL: <名称>]）；复杂多步任务的分解方法见 multi-agent-orchestration 技能。
"#;

pub const DESIGN_MODE_RULE: &str = r#"# 角色

你是「设计」助手（Zeus 内置引擎）。你的职责覆盖视觉/体验设计、品牌、数据可视化与设计交付。

# 多 Agent 工作方式（重要）

用户只发任务，你来编排。当前会话没有独立子 agent 工具，采用严格的阶段化纪律控制上下文：

1. 先产出工作分解：子任务清单 + 依赖关系 + 每项的产出物。
2. 逐阶段执行；每阶段结束立即把中间产物压缩成要点，再进入下一阶段——上下文里不留长篇过程。
3. 素材探索（参考、规范、数据）先列「要看的清单+每项看什么」，逐项摘要，不整篇展开。
4. 用 [LOAD_SKILL: <名称>] 按需加载设计技能（设计系统、数据可视化、交付规范等），不要凭记忆。
5. 交付时以工作分解为骨架汇总，标注遗留项。

# 技能

复杂任务的分解方法见 multi-agent-orchestration 技能。
"#;

pub const DEV_MODE_RULE: &str = r#"# 角色

你是「开发」助手（Claude Code 引擎）。你的职责覆盖编码、调试、重构、集成与工程交付。

# 多 Agent 工作方式（重要）

用户只发任务，你来编排。对任何多文件、多模块或需要大量探索的任务：

1. 先分解任务，识别可并行的独立子任务。
2. 用 Task 工具把子任务派发给 subagent：探索/找代码/查资料 → explorer；方案设计 → planner；结果把关 → critic。无依赖的并行派发。
3. 主上下文是决策与编排层：只保留计划、结论、决策，不保留文件内容与长输出。子 agent 报告过长时要求其重写为 ≤10 行结论。
4. 涉及破坏性操作（删除、强推、覆盖）仍需先向用户确认——编排不改变安全边界。
5. 合并前用 critic 子 agent 抽查关键改动。

单文件小修、单步问题直接做，不编排。

# 技能

按需加载技能；复杂任务的分解方法见 multi-agent-orchestration 与 decompose-and-execute 技能。
"#;

/// Resolve the seeded rule body for a generated assistant's agent row. Same
/// match order as [`mode_preset_skill_names`]; custom agents get `None` (no
/// seed).
pub fn mode_preset_rule(backend: Option<&str>, agent_type: aionui_common::AgentType) -> Option<&'static str> {
    match (backend, agent_type) {
        (Some("opencode"), _) => Some(OFFICE_MODE_RULE),
        (Some("claude"), _) => Some(DEV_MODE_RULE),
        (None, aionui_common::AgentType::Aionrs) => Some(DESIGN_MODE_RULE),
        _ => None,
    }
}

/// MCP server-name presets for the three fixed mode assistants.
///
/// The skill presets above ship names because row ids are per-install; MCP is
/// the same trade taken one step further — `default_mcp_ids` historically
/// holds `mcp_servers` row ids (per-install `mcp_<uuid-v7>`), so a preset
/// written in source can only be portable as NAMES. The conversation layer
/// resolves each entry against the live `mcp_servers` rows at
/// conversation-creation time, accepting either a row id or a server name;
/// unknown entries are skipped with a warn, mirroring skill resolution.
///
/// The builtin servers (`aionui-browser`, `chrome-devtools`,
/// `aionui-image-generation`) are seeded under these exact names by the
/// Electron-side migrations in
/// `AionUi/packages/desktop/src/process/utils/runBackendMigrations.ts`;
/// `open-design` is a user-installed server. An empty preset (custom agents)
/// keeps the historical `auto` binding instead of pinning an empty list.
pub const OFFICE_MODE_MCPS: &[&str] = &["aionui-browser"];
pub const DESIGN_MODE_MCPS: &[&str] = &["aionui-image-generation", "open-design"];
pub const DEV_MODE_MCPS: &[&str] = &["aionui-browser", "chrome-devtools"];

/// Match order mirrors the shipped catalog: `backend` identifies the two CLI
/// engines (opencode -> office, claude -> dev), the internal agent is
/// recognized by `agent_type == Aionrs` with no backend. Unknown combinations
/// (user-added custom agents) get an empty list and keep today's behavior.
pub fn mode_preset_skill_names(backend: Option<&str>, agent_type: aionui_common::AgentType) -> &'static [&'static str] {
    match (backend, agent_type) {
        (Some("opencode"), _) => OFFICE_MODE_SKILLS,
        (Some("claude"), _) => DEV_MODE_SKILLS,
        (None, aionui_common::AgentType::Aionrs) => DESIGN_MODE_SKILLS,
        _ => &[],
    }
}

/// Resolve the mode MCP preset for a generated assistant's agent row. Same
/// match order as [`mode_preset_skill_names`]; unknown combinations (custom
/// agents) get an empty list, which callers treat as "keep `auto`".
pub fn mode_preset_mcp_names(backend: Option<&str>, agent_type: aionui_common::AgentType) -> &'static [&'static str] {
    match (backend, agent_type) {
        (Some("opencode"), _) => OFFICE_MODE_MCPS,
        (Some("claude"), _) => DEV_MODE_MCPS,
        (None, aionui_common::AgentType::Aionrs) => DESIGN_MODE_MCPS,
        _ => &[],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_match_the_three_shipped_engines() {
        assert_eq!(mode_preset_skill_names(Some("opencode"), aionui_common::AgentType::Acp), OFFICE_MODE_SKILLS);
        assert_eq!(mode_preset_skill_names(Some("claude"), aionui_common::AgentType::Acp), DEV_MODE_SKILLS);
        assert_eq!(mode_preset_skill_names(None, aionui_common::AgentType::Aionrs), DESIGN_MODE_SKILLS);
        assert!(mode_preset_skill_names(None, aionui_common::AgentType::Acp).is_empty());
    }

    #[test]
    fn every_mode_preset_carries_the_orchestration_skill() {
        for preset in [OFFICE_MODE_SKILLS, DESIGN_MODE_SKILLS, DEV_MODE_SKILLS] {
            assert!(
                preset.contains(&"multi-agent-orchestration"),
                "a mode preset is missing the multi-agent-orchestration skill"
            );
        }
    }

    #[test]
    fn mode_rules_dispatch_by_engine_and_seed_only_generated_modes() {
        assert_eq!(mode_preset_rule(Some("opencode"), aionui_common::AgentType::Acp), Some(OFFICE_MODE_RULE));
        assert_eq!(mode_preset_rule(Some("claude"), aionui_common::AgentType::Acp), Some(DEV_MODE_RULE));
        assert_eq!(mode_preset_rule(None, aionui_common::AgentType::Aionrs), Some(DESIGN_MODE_RULE));
        assert_eq!(mode_preset_rule(None, aionui_common::AgentType::Acp), None);
        for rule in [OFFICE_MODE_RULE, DESIGN_MODE_RULE, DEV_MODE_RULE] {
            assert!(rule.contains("多 Agent"), "a mode rule lost its orchestration section");
        }
    }

    #[test]
    fn mcp_presets_match_the_three_shipped_engines() {
        assert_eq!(mode_preset_mcp_names(Some("opencode"), aionui_common::AgentType::Acp), OFFICE_MODE_MCPS);
        assert_eq!(mode_preset_mcp_names(Some("claude"), aionui_common::AgentType::Acp), DEV_MODE_MCPS);
        assert_eq!(mode_preset_mcp_names(None, aionui_common::AgentType::Aionrs), DESIGN_MODE_MCPS);
        assert!(mode_preset_mcp_names(None, aionui_common::AgentType::Acp).is_empty());
    }

    #[test]
    fn mcp_preset_names_are_unique_per_engine() {
        for preset in [OFFICE_MODE_MCPS, DESIGN_MODE_MCPS, DEV_MODE_MCPS] {
            let mut sorted = preset.to_vec();
            sorted.sort_unstable();
            sorted.dedup();
            assert_eq!(sorted.len(), preset.len(), "an MCP preset lists a server twice");
        }
    }

    #[test]
    fn preset_names_are_unique_per_engine_and_plugin_prefixed() {
        // Sharing a skill across modes (productivity, pdf-viewer, the data viz
        // trio) is intended; a DUPLICATE inside one preset would silently
        // shrink that engine's snapshot.
        for preset in [OFFICE_MODE_SKILLS, DESIGN_MODE_SKILLS, DEV_MODE_SKILLS] {
            let mut sorted = preset.to_vec();
            sorted.sort_unstable();
            sorted.dedup();
            assert_eq!(sorted.len(), preset.len(), "a preset lists a skill twice");
        }
        let all: Vec<&str> = OFFICE_MODE_SKILLS
            .iter()
            .chain(DESIGN_MODE_SKILLS)
            .chain(DEV_MODE_SKILLS)
            .copied()
            .collect();
        let mut names = all.clone();
        names.sort_unstable();
        names.dedup();
        for name in names {
            assert!(
                ["productivity-","sales-","finance-","data-","legal-","marketing-","customer-support-","product-management-","engineering-","human-resources-","design-","operations-","small-business-","bio-research-","enterprise-search-","cowork-plugin-management-","pdf-viewer-","apollo-","brand-voice-","common-room-","slack-","zoom-plugin-","morph-","officecli-"].iter().any(|p| name.starts_with(p))
                    || PERSONAL_STACK_SKILLS.contains(&name)
                    || ZEUS_STANDALONE_SKILLS.contains(&name),
                "{name} is missing its plugin prefix"
            );
        }
    }
}
