//! Zeus fork: skill-name presets for the three fixed mode assistants.
//!
//! Every generated (per-agent) assistant is created with the mode's preset as
//! its fixed skill default, so each engine starts with its role's share of the
//! vendored knowledge-work corpus on board with zero user action - and can
//! still be tuned per assistant in the editor afterwards.
//!
//! The names reference builtin skills vendored under
//! `aionui-app/assets/builtin-skills/knowledge-work/<plugin>/<skill>/` by
//! `AionCore/scripts/vendor-knowledge-work-plugins.py` (source:
//! anthropics/knowledge-work-plugins). Names, not skill row ids: conversation
//! creation resolves names against the live catalog, which keeps the presets
//! stable across machines and reinstalls.

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
    "marketing-performance-report", "marketing-seo-audit", "operations-capacity-plan",
    "operations-change-request", "operations-compliance-tracking", "operations-process-doc",
    "operations-process-optimization", "operations-risk-assessment", "operations-runbook",
    "operations-status-report", "operations-vendor-review", "pdf-viewer-view-pdf",
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
    "small-business-ticket-deflector",
];

/// 设计 (Zeus aionrs): design craft plus the viz-adjacent data skills.
pub const DESIGN_MODE_SKILLS: &[&str] = &[
    "brand-voice-brand-voice-enforcement", "brand-voice-discover-brand",
    "brand-voice-guideline-generation", "data-build-dashboard", "data-create-viz",
    "data-data-visualization", "design-accessibility-review", "design-design-critique",
    "design-design-handoff", "design-design-system", "design-research-synthesis",
    "design-user-research", "design-ux-copy", "pdf-viewer-view-pdf",
    "productivity-memory-management", "productivity-start", "productivity-task-management",
    "productivity-update",
];

/// 开发 (Claude Code): engineering plus integration-building skills.
pub const DEV_MODE_SKILLS: &[&str] = &[
    "cowork-plugin-management-cowork-plugin-customizer",
    "cowork-plugin-management-create-cowork-plugin", "data-analyze", "data-build-dashboard",
    "data-create-viz", "data-data-context-extractor", "data-data-visualization",
    "data-explore-data", "data-sql-queries", "data-statistical-analysis", "data-validate-data",
    "data-write-query", "engineering-architecture", "engineering-code-review", "engineering-debug",
    "engineering-deploy-checklist", "engineering-documentation", "engineering-incident-response",
    "engineering-standup", "engineering-system-design", "engineering-tech-debt",
    "engineering-testing-strategy", "enterprise-search-digest",
    "enterprise-search-knowledge-synthesis", "enterprise-search-search",
    "enterprise-search-search-strategy", "enterprise-search-source-management",
    "pdf-viewer-view-pdf", "productivity-memory-management", "productivity-start",
    "productivity-task-management", "productivity-update", "zoom-plugin-build-zoom-bot",
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

/// Resolve the mode preset for a generated assistant's agent row.
///
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
                ["productivity-","sales-","finance-","data-","legal-","marketing-","customer-support-","product-management-","engineering-","human-resources-","design-","operations-","small-business-","bio-research-","enterprise-search-","cowork-plugin-management-","pdf-viewer-","apollo-","brand-voice-","common-room-","slack-","zoom-plugin-"].iter().any(|p| name.starts_with(p)),
                "{name} is missing its plugin prefix"
            );
        }
    }
}
