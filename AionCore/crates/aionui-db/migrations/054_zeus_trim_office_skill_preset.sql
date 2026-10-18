-- Zeus fork: trim the 办公 (OpenCode) and 开发 (Claude Code) skill presets down
-- to the curated core.
--
-- Migrations 046/049/051 seeded office with 191 names, and 046/047/049/051
-- seeded dev with 73. The compile-time presets in
-- aionui-assistant/zeus_mode_presets.rs now keep only the names that pass all
-- three curation tests: the skill needs no connector or external account (a
-- first-launch default that opens by asking the user to plug in a CRM is a
-- dead end), it is essential to the role its engine plays, and it does not
-- overlap a sibling already on the list.
--
-- office therefore drops 150 names — the apollo-, bio-research-, common-room-,
-- customer-support-, enterprise-search- and slack- connector blocks, the sales-
-- and small-business- families, most of marketing-/product-management-/
-- operations-, extra finance/journal and legal singles, and the data- query and
-- viz builders — and keeps 41: the officecli document suite, morph decks, pdf
-- and pdf-viewer, weixin-file-send, the finance/legal/human-resources/
-- operations cores, brand-voice, marketing-content-creation,
-- product-management-product-brainstorming, data-data-visualization,
-- data-sql-queries, data-statistical-analysis, the productivity-* set,
-- multi-agent-orchestration and the recruiters.
-- dev drops 50 — the zoom-plugin-* integration family, cowork-plugin-
-- management-*, enterprise-search-* and the data- query and viz builders
-- (data-sql-queries is the one that stays) — and keeps 23: the engineering-*
-- craft family and the personal-stack process skills (decompose-and-execute,
-- diagnosing-bugs, grilling, handoff, karpathy-guidelines,
-- resolving-merge-conflicts, skill-security-auditor,
-- universal-scraping-architect, writing-for-agents), mermaid,
-- pdf-viewer-view-pdf and multi-agent-orchestration. The four productivity-*
-- skills leave dev and stay in office alone; design is unchanged.
--
-- The two lists differ, so each engine carries its own name set and each
-- UPDATE is scoped to its own backend. Nothing is deleted: every trimmed skill
-- stays in the corpus (aionui-app/assets/builtin-skills/) and stays one toggle
-- away in the assistant editor.
--
-- The file keeps its original name (…trim_office_skill_preset.sql) because the
-- version is unreleased — no install has applied it — so extending it to dev is
-- a rewrite in place rather than a new 055.
--
-- Guards follow 047/049/051: only a row still carrying the untouched preset shape
-- is rewritten, keyed on a sentinel name that appears in that preset and
-- nowhere else. Lists the user edited by hand (sentinel gone) and lists
-- deliberately emptied ('[]') are left alone. The sentinel is itself filtered
-- out below, so a row stops matching once trimmed and the migration is
-- idempotent. json_each scans in array order, so survivors keep their original
-- order; an all-removed list collapses to '[]' rather than NULL, because the
-- JSON aggregates return the empty array for zero rows.

-- office (OpenCode): 191 -> 41 names
UPDATE assistant_definitions
SET default_skill_ids = (
      SELECT json_group_array(value)
      FROM json_each(assistant_definitions.default_skill_ids)
      WHERE value NOT IN (
        'apollo-enrich-lead', 'apollo-prospect', 'apollo-sequence-load', 'bio-research-instrument-data-to-allotrope',
        'bio-research-nextflow-development', 'bio-research-scientific-problem-selection', 'bio-research-scvi-tools', 'bio-research-single-cell-rna-qc',
        'bio-research-start', 'common-room-account-research', 'common-room-call-prep', 'common-room-compose-outreach',
        'common-room-contact-research', 'common-room-prospect', 'common-room-weekly-prep-brief', 'customer-support-customer-escalation',
        'customer-support-customer-research', 'customer-support-draft-response', 'customer-support-kb-article', 'customer-support-ticket-triage',
        'data-analyze', 'data-build-dashboard', 'data-create-viz', 'data-data-context-extractor',
        'data-explore-data', 'data-validate-data', 'data-write-query', 'enterprise-search-digest',
        'enterprise-search-knowledge-synthesis', 'enterprise-search-search', 'enterprise-search-search-strategy', 'enterprise-search-source-management',
        'finance-financial-statements', 'finance-journal-entry', 'finance-journal-entry-prep', 'finance-sox-testing',
        'human-resources-comp-analysis', 'human-resources-draft-offer', 'human-resources-onboarding', 'human-resources-people-report',
        'human-resources-performance-review', 'human-resources-policy-lookup', 'legal-brief', 'legal-compliance-check',
        'legal-legal-response', 'legal-signature-request', 'legal-triage-nda', 'legal-vendor-check',
        'marketing-brand-review', 'marketing-campaign-plan', 'marketing-competitive-brief', 'marketing-draft-content',
        'marketing-email-sequence', 'marketing-performance-report', 'marketing-seo-audit', 'operations-capacity-plan',
        'operations-change-request', 'operations-process-doc', 'operations-runbook', 'operations-status-report',
        'operations-vendor-review', 'product-management-competitive-brief', 'product-management-metrics-review', 'product-management-roadmap-update',
        'product-management-sprint-planning', 'product-management-stakeholder-update', 'product-management-synthesize-research', 'product-management-write-spec',
        'sales-account-context', 'sales-account-plan', 'sales-account-research', 'sales-account-tiering',
        'sales-call-prep', 'sales-call-summary', 'sales-close-plan', 'sales-competitive-intelligence',
        'sales-create-an-asset', 'sales-crm-hygiene-check', 'sales-customer-health', 'sales-customer-voice',
        'sales-daily-briefing', 'sales-deal-advance-gap', 'sales-deal-review', 'sales-deal-signals',
        'sales-deal-slip-scenario', 'sales-draft-outreach', 'sales-end-of-day', 'sales-expansion-whitespace',
        'sales-forecast', 'sales-handle-objection', 'sales-inbox-sweep', 'sales-lead-triage',
        'sales-log-activity', 'sales-pipeline-review', 'sales-renewal-radar', 'sales-rep-context',
        'sales-route-lead', 'sales-schedule-meeting', 'sales-setup', 'sales-stakeholder-map',
        'sales-team-pipeline', 'sales-update-opportunity', 'sales-weekly-wrap', 'sales-win-loss-review',
        'slack-slack-messaging', 'slack-slack-search', 'small-business-ad-manager', 'small-business-ap-processor',
        'small-business-brand-style', 'small-business-build-agent', 'small-business-build-connector', 'small-business-business-pulse',
        'small-business-call-list', 'small-business-canva-creator', 'small-business-cash-flow-snapshot', 'small-business-close-month',
        'small-business-content-strategy', 'small-business-contract-review', 'small-business-crm-autopilot', 'small-business-grant-rfp-writer',
        'small-business-grow-pipeline', 'small-business-growth-pulse', 'small-business-hiring-screener', 'small-business-inbox-manager',
        'small-business-inventory-planner', 'small-business-invoice-chase', 'small-business-job-post-builder', 'small-business-lead-finder',
        'small-business-lead-triage', 'small-business-marketing-monday', 'small-business-monday-brief', 'small-business-month-end-prep',
        'small-business-outreach-composer', 'small-business-pay-the-bills', 'small-business-payroll-prep', 'small-business-plan-payroll',
        'small-business-proposal-builder', 'small-business-reactivate', 'small-business-report-builder', 'small-business-report-pack',
        'small-business-restock', 'small-business-review-reputation', 'small-business-seo-ai-visibility', 'small-business-smb-onboard',
        'small-business-smb-router', 'small-business-social-content-engine', 'small-business-speed-to-lead', 'small-business-tax-prep',
        'small-business-tax-season-organizer', 'small-business-ticket-deflector'
      )
    ),
    updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND owner_type = 'system'
  AND default_skills_mode = 'fixed'
  AND default_skill_ids <> '[]'
  AND default_skill_ids LIKE '%"small-business-plan-payroll"%'
  AND agent_id IN (SELECT id FROM agent_metadata WHERE backend = 'opencode');

-- dev (Claude Code): 73 -> 23 names
UPDATE assistant_definitions
SET default_skill_ids = (
      SELECT json_group_array(value)
      FROM json_each(assistant_definitions.default_skill_ids)
      WHERE value NOT IN (
        'cowork-plugin-management-cowork-plugin-customizer', 'cowork-plugin-management-create-cowork-plugin', 'data-analyze', 'data-build-dashboard',
        'data-create-viz', 'data-data-context-extractor', 'data-data-visualization', 'data-explore-data',
        'data-statistical-analysis', 'data-validate-data', 'data-write-query', 'enterprise-search-digest',
        'enterprise-search-knowledge-synthesis', 'enterprise-search-search', 'enterprise-search-search-strategy', 'enterprise-search-source-management',
        'productivity-memory-management', 'productivity-start', 'productivity-task-management', 'productivity-update',
        'zoom-plugin-build-zoom-bot', 'zoom-plugin-build-zoom-contact-center-app', 'zoom-plugin-build-zoom-meeting-app', 'zoom-plugin-build-zoom-meeting-sdk-app',
        'zoom-plugin-build-zoom-phone-integration', 'zoom-plugin-build-zoom-rest-api-app', 'zoom-plugin-build-zoom-team-chat-app', 'zoom-plugin-build-zoom-video-sdk-app',
        'zoom-plugin-build-zoom-virtual-agent', 'zoom-plugin-choose-zoom-approach', 'zoom-plugin-debug-zoom', 'zoom-plugin-debug-zoom-integration',
        'zoom-plugin-design-mcp-workflow', 'zoom-plugin-plan-zoom-integration', 'zoom-plugin-plan-zoom-product', 'zoom-plugin-probe-sdk',
        'zoom-plugin-rivet-sdk', 'zoom-plugin-scribe', 'zoom-plugin-setup-zoom-mcp', 'zoom-plugin-setup-zoom-oauth',
        'zoom-plugin-setup-zoom-webhooks', 'zoom-plugin-setup-zoom-websockets', 'zoom-plugin-start', 'zoom-plugin-ui-toolkit-web',
        'zoom-plugin-zoom-apps-sdk', 'zoom-plugin-zoom-cobrowse-sdk', 'zoom-plugin-zoom-general', 'zoom-plugin-zoom-mcp',
        'zoom-plugin-zoom-oauth', 'zoom-plugin-zoom-rtms'
      )
    ),
    updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND owner_type = 'system'
  AND default_skills_mode = 'fixed'
  AND default_skill_ids <> '[]'
  AND default_skill_ids LIKE '%"zoom-plugin-build-zoom-bot"%'
  AND agent_id IN (SELECT id FROM agent_metadata WHERE backend = 'claude');
