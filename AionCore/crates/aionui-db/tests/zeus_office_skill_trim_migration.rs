//! Migrations 054, 055 and 056 — the Zeus mode skill presets are cut down
//! twice, then reset outright: 054 drops the connector-bound families, 055
//! the names whose tooling the product does not ship, and 056 clears every
//! generated, system-owned, fixed-mode list on the three engines to '[]' so
//! the owner can reconfigure from scratch.
//!
//! A fresh in-memory database never carries a preset list (reconcile seeds it
//! at boot from the compile-time arrays), so these tests hand-build a database
//! at 053 — the version before any of the three — seed definition rows with
//! the old shapes, then run migrations over them. The two layers need
//! different runners:
//!
//! - The trim cases (054/055) run a chain CAPPED at 055. On a real upgrade
//!   056 follows immediately and erases their output, so the only way a trim's
//!   own behavior stays observable is to stop before the reset; each asserts
//!   the state an install at 055 carries into 056.
//! - The reset cases (056) run the FULL staged init, the way every real
//!   install lands, and assert the end state: '[]'.
//!
//! The file keeps its original office-trim name for the same reason 054's own
//! header gives for keeping its own: the version is unreleased, so extending
//! in place is a rewrite rather than a new file.
//!
//! Expectations are hardcoded, not read back out of
//! aionui-assistant/zeus_mode_presets.rs: this crate must not depend on the
//! preset source, and a test that compared the migrations against the arrays
//! they mirror would agree with any edit to them. The long JSON literals below
//! are single-line on purpose — they are compared byte-for-byte with the stored
//! column.

use std::borrow::Cow;
use std::path::Path;

use aionui_db::init_database_staged;
use sqlx::migrate::Migrator;
use sqlx::sqlite::SqlitePoolOptions;

/// The three agent rows a generated definition can hang off, spelled the way
/// the migration guards spell them.
const OPENCODE_AGENT: &str = "SELECT id FROM agent_metadata WHERE backend = 'opencode'";
const CLAUDE_AGENT: &str = "SELECT id FROM agent_metadata WHERE backend = 'claude'";
const AIONRS_AGENT: &str = "SELECT id FROM agent_metadata WHERE backend IS NULL AND agent_type = 'aionrs'";

/// The dev preset as migrations 046/047/049/051 left it (73 names), in the
/// order those migrations produced — 047's literal, then 049's `mermaid`, then
/// 051's `multi-agent-orchestration`, which is why the last two sit at the end
/// and not in the alphabetical-looking body. Exactly what a real upgrade hands
/// to 054 (verified against an installed database).
const OLD_DEV_PRESET: &str = r#"["cowork-plugin-management-cowork-plugin-customizer","cowork-plugin-management-create-cowork-plugin","data-analyze","data-build-dashboard","data-create-viz","data-data-context-extractor","data-data-visualization","data-explore-data","data-sql-queries","data-statistical-analysis","data-validate-data","data-write-query","decompose-and-execute","diagnosing-bugs","engineering-architecture","engineering-code-review","engineering-debug","engineering-deploy-checklist","engineering-documentation","engineering-incident-response","engineering-standup","engineering-system-design","engineering-tech-debt","engineering-testing-strategy","enterprise-search-digest","enterprise-search-knowledge-synthesis","enterprise-search-search","enterprise-search-search-strategy","enterprise-search-source-management","grilling","handoff","karpathy-guidelines","pdf-viewer-view-pdf","productivity-memory-management","productivity-start","productivity-task-management","productivity-update","resolving-merge-conflicts","skill-security-auditor","universal-scraping-architect","writing-for-agents","zoom-plugin-build-zoom-bot","zoom-plugin-build-zoom-contact-center-app","zoom-plugin-build-zoom-meeting-app","zoom-plugin-build-zoom-meeting-sdk-app","zoom-plugin-build-zoom-phone-integration","zoom-plugin-build-zoom-rest-api-app","zoom-plugin-build-zoom-team-chat-app","zoom-plugin-build-zoom-video-sdk-app","zoom-plugin-build-zoom-virtual-agent","zoom-plugin-choose-zoom-approach","zoom-plugin-debug-zoom","zoom-plugin-debug-zoom-integration","zoom-plugin-design-mcp-workflow","zoom-plugin-plan-zoom-integration","zoom-plugin-plan-zoom-product","zoom-plugin-probe-sdk","zoom-plugin-rivet-sdk","zoom-plugin-scribe","zoom-plugin-setup-zoom-mcp","zoom-plugin-setup-zoom-oauth","zoom-plugin-setup-zoom-webhooks","zoom-plugin-setup-zoom-websockets","zoom-plugin-start","zoom-plugin-ui-toolkit-web","zoom-plugin-zoom-apps-sdk","zoom-plugin-zoom-cobrowse-sdk","zoom-plugin-zoom-general","zoom-plugin-zoom-mcp","zoom-plugin-zoom-oauth","zoom-plugin-zoom-rtms","mermaid","multi-agent-orchestration"]"#;

/// What 054 leaves of it (the curated 23), and what 055 then leaves of that —
/// the two differ by `pdf-viewer-view-pdf`, 055's only dev removal. Both carry
/// the order migration 049 and 051 produced (mermaid and multi-agent-
/// orchestration appended at the end), not the source array's order.
const DEV_PRESET_AFTER_054: &str = r#"["data-sql-queries","decompose-and-execute","diagnosing-bugs","engineering-architecture","engineering-code-review","engineering-debug","engineering-deploy-checklist","engineering-documentation","engineering-incident-response","engineering-standup","engineering-system-design","engineering-tech-debt","engineering-testing-strategy","grilling","handoff","karpathy-guidelines","pdf-viewer-view-pdf","resolving-merge-conflicts","skill-security-auditor","universal-scraping-architect","writing-for-agents","mermaid","multi-agent-orchestration"]"#;

const DEV_PRESET_FINAL: &str = r#"["data-sql-queries","decompose-and-execute","diagnosing-bugs","engineering-architecture","engineering-code-review","engineering-debug","engineering-deploy-checklist","engineering-documentation","engineering-incident-response","engineering-standup","engineering-system-design","engineering-tech-debt","engineering-testing-strategy","grilling","handoff","karpathy-guidelines","resolving-merge-conflicts","skill-security-auditor","universal-scraping-architect","writing-for-agents","mermaid","multi-agent-orchestration"]"#;

/// The office preset as 054 leaves it (41 names) and as 055 leaves it (33),
/// in the order migrations 046 + 049 + 051 built it. Used as a seed, the first
/// shape is what an install that already ran 054 carries into 055.
const OFFICE_PRESET_AFTER_054: &str = r#"["brand-voice-brand-voice-enforcement","brand-voice-discover-brand","brand-voice-guideline-generation","data-data-visualization","data-sql-queries","data-statistical-analysis","finance-audit-support","finance-close-management","finance-reconciliation","finance-variance-analysis","human-resources-interview-prep","human-resources-org-planning","human-resources-recruiting-pipeline","legal-legal-risk-assessment","legal-meeting-briefing","legal-review-contract","marketing-content-creation","operations-compliance-tracking","operations-process-optimization","operations-risk-assessment","pdf-viewer-view-pdf","product-management-product-brainstorming","productivity-memory-management","productivity-start","productivity-task-management","productivity-update","morph-ppt","morph-ppt-3d","officecli-academic-paper","officecli-data-dashboard","officecli-docx","officecli-financial-model","officecli-pitch-deck","officecli-pptx","officecli-word-form","officecli-xlsx","pdf","weixin-file-send","x-recruiter","xiaohongshu-recruiter","multi-agent-orchestration"]"#;

const OFFICE_PRESET_FINAL: &str = r#"["brand-voice-brand-voice-enforcement","brand-voice-guideline-generation","data-data-visualization","data-sql-queries","data-statistical-analysis","finance-audit-support","finance-close-management","finance-reconciliation","finance-variance-analysis","human-resources-interview-prep","human-resources-org-planning","human-resources-recruiting-pipeline","legal-legal-risk-assessment","legal-meeting-briefing","legal-review-contract","marketing-content-creation","operations-compliance-tracking","operations-process-optimization","operations-risk-assessment","product-management-product-brainstorming","morph-ppt","morph-ppt-3d","officecli-academic-paper","officecli-data-dashboard","officecli-docx","officecli-financial-model","officecli-pitch-deck","officecli-pptx","officecli-word-form","officecli-xlsx","pdf","weixin-file-send","multi-agent-orchestration"]"#;

/// The design (aionrs) preset before 055 (19 names) and after it (12). 054
/// leaves design alone even though the design list shares seven names with what
/// dev drops (data-build-dashboard, data-create-viz, data-data-visualization,
/// productivity-memory-management, productivity-start, productivity-task-
/// management, productivity-update) and two with what office drops
/// (data-build-dashboard, data-create-viz) — a guard that lost its engine scope
/// would visibly strip those names.
const DESIGN_PRESET_BEFORE_055: &str = r#"["brand-voice-brand-voice-enforcement","brand-voice-discover-brand","brand-voice-guideline-generation","data-build-dashboard","data-create-viz","data-data-visualization","design-accessibility-review","design-design-critique","design-design-handoff","design-design-system","design-research-synthesis","design-user-research","design-ux-copy","pdf-viewer-view-pdf","productivity-memory-management","productivity-start","productivity-task-management","productivity-update","multi-agent-orchestration"]"#;

const DESIGN_PRESET_FINAL: &str = r#"["brand-voice-brand-voice-enforcement","brand-voice-guideline-generation","data-build-dashboard","data-data-visualization","design-accessibility-review","design-design-critique","design-design-handoff","design-design-system","design-research-synthesis","design-user-research","design-ux-copy","multi-agent-orchestration"]"#;

/// Build a file-backed DB with migrations 001..=053 applied, then run each
/// `seed` statement in order. Closes the pool before returning so the caller
/// can reopen it through the staged-init path.
async fn build_db_at_053(path: &Path, seed: &[&str]) {
    let url = format!("sqlite://{}?mode=rwc", path.display());
    let pool = SqlitePoolOptions::new().max_connections(1).connect(&url).await.unwrap();
    sqlx::query("PRAGMA foreign_keys = OFF").execute(&pool).await.unwrap();
    let full = Migrator::new(Path::new("migrations")).await.unwrap();
    let subset = full
        .migrations
        .iter()
        .filter(|m| m.version <= 53)
        .cloned()
        .collect::<Vec<_>>();
    let migrator = Migrator {
        migrations: Cow::Owned(subset),
        ignore_missing: false,
        locking: true,
        no_tx: false,
    };
    migrator.run(&pool).await.unwrap();
    for sql in seed {
        sqlx::query(sql).execute(&pool).await.unwrap();
    }
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&pool).await.ok();
    pool.close().await;
}

/// A definition row with every non-defaulted column filled in. `agent_sql`
/// picks the agent row the definition hangs off — the trims are scoped by
/// engine, so which engine a row belongs to is what each case is about.
fn definition_insert(id: &str, agent_sql: &str, skill_ids: &str) -> String {
    definition_row(id, agent_sql, skill_ids, "generated", "system", "fixed")
}

/// The same row with the three remaining guard columns spelled out: a trim
/// must fire only on generated, system-owned rows in `fixed` mode.
fn definition_row(id: &str, agent_sql: &str, skill_ids: &str, source: &str, owner_type: &str, mode: &str) -> String {
    format!(
        "INSERT INTO assistant_definitions (\
             id, assistant_id, source, owner_type, source_ref, name, agent_id, rule_resource_type, \
             default_model_mode, default_permission_mode, default_skills_mode, default_skill_ids, \
             default_mcps_mode, created_at, updated_at\
         ) VALUES (\
             '{id}', 'bare:{id}', '{source}', '{owner_type}', '{id}-agent', '{id}', \
             ({agent_sql}), 'user_file', \
             'auto', 'auto', '{mode}', '{skill_ids}', 'auto', 1, 1\
         )"
    )
}

async fn skill_ids_of(db: &aionui_db::Database, id: &str) -> String {
    sqlx::query_scalar("SELECT default_skill_ids FROM assistant_definitions WHERE id = ?")
        .bind(id)
        .fetch_one(db.pool())
        .await
        .unwrap()
}

/// Advance a database already at 053 through migration `cap` and close the
/// pool. The trim cases cap at 55 so 056's reset cannot erase the state they
/// assert; the reset cases go through `init_database_staged` instead, which
/// runs the chain to the end exactly like a real upgrade.
async fn run_migrations_through(path: &Path, cap: i64) {
    let url = format!("sqlite://{}?mode=rwc", path.display());
    let pool = SqlitePoolOptions::new().max_connections(1).connect(&url).await.unwrap();
    let full = Migrator::new(Path::new("migrations")).await.unwrap();
    let subset = full
        .migrations
        .iter()
        .filter(|m| m.version <= cap)
        .cloned()
        .collect::<Vec<_>>();
    let migrator = Migrator {
        migrations: Cow::Owned(subset),
        ignore_missing: false,
        locking: true,
        no_tx: false,
    };
    migrator.run(&pool).await.unwrap();
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&pool).await.ok();
    pool.close().await;
}

/// Read one row's `default_skill_ids` through a raw pool — the trimmed-database
/// counterpart of [`skill_ids_of`], which needs the staged-init `Database`.
async fn skill_ids_at(path: &Path, id: &str) -> String {
    let url = format!("sqlite://{}?mode=rwc", path.display());
    let pool = SqlitePoolOptions::new().max_connections(1).connect(&url).await.unwrap();
    let value: String =
        sqlx::query_scalar("SELECT default_skill_ids FROM assistant_definitions WHERE id = ?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    pool.close().await;
    value
}

/// `agent_id` is nullable, so an engine the seed SQL failed to resolve would
/// silently leave the row unguarded; the raw-pool counterpart of
/// [`agent_id_of`], for the capped-chain cases.
async fn agent_id_at(path: &Path, id: &str) -> Option<String> {
    let url = format!("sqlite://{}?mode=rwc", path.display());
    let pool = SqlitePoolOptions::new().max_connections(1).connect(&url).await.unwrap();
    let value: Option<String> =
        sqlx::query_scalar("SELECT agent_id FROM assistant_definitions WHERE id = ?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    pool.close().await;
    value
}

/// `agent_id` is nullable, so an engine the seed SQL failed to resolve would
/// silently leave the row unguarded; the design case asserts it resolved.
async fn agent_id_of(db: &aionui_db::Database, id: &str) -> Option<String> {
    sqlx::query_scalar("SELECT agent_id FROM assistant_definitions WHERE id = ?")
        .bind(id)
        .fetch_one(db.pool())
        .await
        .unwrap()
}

#[tokio::test]
async fn office_preset_drops_the_trimmed_names_and_keeps_the_rest_in_order() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("aionui-backend.db");
    build_db_at_053(
        &path,
        &[&definition_insert(
            "office",
            OPENCODE_AGENT,
            r#"["sales-call-prep","small-business-plan-payroll","apollo-prospect","pdf","data-analyze","finance-journal-entry","finance-reconciliation","officecli-docx","officecli-pptx","small-business-tax-prep","multi-agent-orchestration","morph-ppt"]"#,
        )],
    )
    .await;

    run_migrations_through(&path, 55).await;
    assert_eq!(
        skill_ids_at(&path, "office").await,
        r#"["pdf","finance-reconciliation","officecli-docx","officecli-pptx","multi-agent-orchestration","morph-ppt"]"#,
        "trimmed names removed, survivors keep their original order"
    );
}

#[tokio::test]
async fn hand_edited_emptied_other_engine_and_unmanaged_lists_survive() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("aionui-backend.db");
    // Carries a name 055 would drop, and no sentinel of either migration: the
    // pair of guards is what keeps a hand-edited list whole, dead names and all.
    let office_edited = r#"["sales-call-prep","x-recruiter"]"#;
    let empty = "[]";
    let dev_edited = r#"["mermaid","grilling","zoom-plugin-debug-zoom"]"#;
    // Carries 054's office sentinel, so only the source / owner / mode guards
    // stand between it and the filter.
    let unmanaged = r#"["small-business-plan-payroll","pdf","sales-call-prep"]"#;
    // Names 054 drops from office and dev, and 055 drops from design — but no
    // sentinel of either, so the row must come through both trims untouched.
    // That is what proves each migration's list stays inside its engine.
    let design_untouched = r#"["data-create-viz","data-data-visualization","productivity-start"]"#;
    build_db_at_053(
        &path,
        &[
            &definition_insert("office-edited", OPENCODE_AGENT, office_edited),
            &definition_insert("office-empty", OPENCODE_AGENT, empty),
            &definition_insert("dev-edited", CLAUDE_AGENT, dev_edited),
            &definition_insert("design", AIONRS_AGENT, design_untouched),
            &definition_row("office-user-copy", OPENCODE_AGENT, unmanaged, "user", "user", "fixed"),
            &definition_row(
                "office-auto-mode",
                OPENCODE_AGENT,
                unmanaged,
                "generated",
                "system",
                "auto",
            ),
        ],
    )
    .await;

    run_migrations_through(&path, 55).await;
    assert_eq!(
        skill_ids_at(&path, "office-edited").await,
        office_edited,
        "a list whose sentinels are gone was edited by hand — leave it alone, dead names included"
    );
    assert_eq!(
        skill_ids_at(&path, "office-empty").await,
        empty,
        "an emptied list stays empty"
    );
    assert_eq!(
        skill_ids_at(&path, "dev-edited").await,
        dev_edited,
        "the dev trims are keyed on their own sentinels too — a hand-edited dev list survives"
    );
    assert!(
        agent_id_at(&path, "design").await.is_some(),
        "the design row must be attached to the aionrs agent, or its case proves nothing"
    );
    assert_eq!(
        skill_ids_at(&path, "design").await,
        design_untouched,
        "design names that office and dev drop stay put without a design sentinel"
    );
    assert_eq!(
        skill_ids_at(&path, "office-user-copy").await,
        unmanaged,
        "a user's own copy is not a system preset, sentinel or not"
    );
    assert_eq!(
        skill_ids_at(&path, "office-auto-mode").await,
        unmanaged,
        "a row switched to auto mode keeps its list as the fallback"
    );
}

#[tokio::test]
async fn a_list_of_only_trimmed_names_collapses_to_an_empty_array() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("aionui-backend.db");
    build_db_at_053(
        &path,
        &[
            &definition_insert(
                "office",
                OPENCODE_AGENT,
                r#"["small-business-plan-payroll","apollo-prospect","finance-journal-entry-prep"]"#,
            ),
            &definition_insert(
                "dev",
                CLAUDE_AGENT,
                // productivity-start is kept in office and dropped in dev, so
                // this row is also a cross-check that the name sets stay apart.
                r#"["zoom-plugin-build-zoom-bot","zoom-plugin-zoom-rtms","productivity-start"]"#,
            ),
        ],
    )
    .await;

    run_migrations_through(&path, 55).await;
    assert_eq!(
        skill_ids_at(&path, "office").await,
        "[]",
        "an all-removed office list becomes '[]', never NULL"
    );
    assert_eq!(
        skill_ids_at(&path, "dev").await,
        "[]",
        "an all-removed dev list becomes '[]', never NULL"
    );
}

#[tokio::test]
async fn dev_preset_drops_the_zoom_family_then_the_dead_pdf_viewer_name() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("aionui-backend.db");
    build_db_at_053(&path, &[&definition_insert("dev", CLAUDE_AGENT, OLD_DEV_PRESET)]).await;

    run_migrations_through(&path, 55).await;
    assert_eq!(
        skill_ids_at(&path, "dev").await,
        DEV_PRESET_FINAL,
        "the untouched 73-name dev preset trims to the curated 22, in place"
    );
}

#[tokio::test]
async fn a_dev_preset_already_at_the_post_054_shape_still_loses_the_pdf_viewer() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("aionui-backend.db");
    // The state every install that ran 054 carries into 055.
    build_db_at_053(
        &path,
        &[&definition_insert("dev", CLAUDE_AGENT, DEV_PRESET_AFTER_054)],
    )
    .await;

    run_migrations_through(&path, 55).await;
    assert_eq!(
        skill_ids_at(&path, "dev").await,
        DEV_PRESET_FINAL,
        "055 keys on its own sentinel, so a row 054 already rewrote is not skipped"
    );
}

#[tokio::test]
async fn every_kept_office_name_survives_verbatim_next_to_removed_ones() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("aionui-backend.db");
    build_db_at_053(
        &path,
        &[&definition_insert(
            "office",
            OPENCODE_AGENT,
            r#"["apollo-prospect","brand-voice-brand-voice-enforcement","brand-voice-discover-brand","brand-voice-guideline-generation","data-data-visualization","data-sql-queries","bio-research-start","data-statistical-analysis","finance-audit-support","finance-close-management","finance-reconciliation","finance-variance-analysis","data-analyze","human-resources-interview-prep","human-resources-org-planning","human-resources-recruiting-pipeline","legal-legal-risk-assessment","legal-meeting-briefing","finance-journal-entry-prep","legal-review-contract","marketing-content-creation","morph-ppt","morph-ppt-3d","multi-agent-orchestration","small-business-plan-payroll","officecli-academic-paper","officecli-data-dashboard","officecli-docx","officecli-financial-model","officecli-pitch-deck","small-business-tax-prep","officecli-pptx","officecli-word-form","officecli-xlsx","operations-compliance-tracking","operations-process-optimization","sales-call-prep","operations-risk-assessment","pdf","pdf-viewer-view-pdf","product-management-product-brainstorming","productivity-memory-management","slack-slack-search","productivity-start","productivity-task-management","productivity-update","weixin-file-send","x-recruiter","xiaohongshu-recruiter"]"#,
        )],
    )
    .await;

    run_migrations_through(&path, 55).await;
    assert_eq!(
        skill_ids_at(&path, "office").await,
        // Spelled out rather than OFFICE_PRESET_FINAL: this fixture's order is
        // the hand-picked one below, not the order migrations 046/049/051 left
        // in a real database, and the survivors keep the fixture's positions.
        r#"["brand-voice-brand-voice-enforcement","brand-voice-guideline-generation","data-data-visualization","data-sql-queries","data-statistical-analysis","finance-audit-support","finance-close-management","finance-reconciliation","finance-variance-analysis","human-resources-interview-prep","human-resources-org-planning","human-resources-recruiting-pipeline","legal-legal-risk-assessment","legal-meeting-briefing","legal-review-contract","marketing-content-creation","morph-ppt","morph-ppt-3d","multi-agent-orchestration","officecli-academic-paper","officecli-data-dashboard","officecli-docx","officecli-financial-model","officecli-pitch-deck","officecli-pptx","officecli-word-form","officecli-xlsx","operations-compliance-tracking","operations-process-optimization","operations-risk-assessment","pdf","product-management-product-brainstorming","weixin-file-send"]"#,
        "every kept office name survives both trims verbatim, in its original position"
    );
}

#[tokio::test]
async fn an_office_preset_already_at_the_post_054_shape_trims_to_the_curated_33() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("aionui-backend.db");
    build_db_at_053(
        &path,
        &[&definition_insert("office", OPENCODE_AGENT, OFFICE_PRESET_AFTER_054)],
    )
    .await;

    run_migrations_through(&path, 55).await;
    assert_eq!(
        skill_ids_at(&path, "office").await,
        OFFICE_PRESET_FINAL,
        "the post-054 preset loses exactly the eight names 055 retires"
    );
}

#[tokio::test]
async fn the_design_preset_loses_its_dead_names_too() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("aionui-backend.db");
    build_db_at_053(
        &path,
        &[&definition_insert("design", AIONRS_AGENT, DESIGN_PRESET_BEFORE_055)],
    )
    .await;

    run_migrations_through(&path, 55).await;
    assert!(
        agent_id_at(&path, "design").await.is_some(),
        "the design row must be attached to the aionrs agent, or the trim never runs"
    );
    assert_eq!(
        skill_ids_at(&path, "design").await,
        DESIGN_PRESET_FINAL,
        "design drops the pdf-viewer, brand-discovery, productivity and data-create-viz names"
    );
}

#[tokio::test]
async fn dead_names_do_not_leak_across_engines() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("aionui-backend.db");
    // The office preset copied onto the dev engine: same sentinel, same dead
    // names, different engine. Only dev's own removal list may apply.
    build_db_at_053(
        &path,
        &[&definition_insert("dev", CLAUDE_AGENT, OFFICE_PRESET_AFTER_054)],
    )
    .await;

    run_migrations_through(&path, 55).await;
    let trimmed = skill_ids_at(&path, "dev").await;
    assert!(
        !trimmed.contains(r#""pdf-viewer-view-pdf""#),
        "the dev list drops its own sentinel"
    );
    for survivor in [
        "brand-voice-discover-brand",
        "productivity-start",
        "productivity-task-management",
        "productivity-memory-management",
        "productivity-update",
        "x-recruiter",
        "xiaohongshu-recruiter",
    ] {
        assert!(
            trimmed.contains(&format!(r#""{survivor}""#)),
            "{survivor} is dropped by office, not by dev, and this row is a dev row"
        );
    }
}

#[tokio::test]
async fn the_reset_clears_all_three_engine_presets_on_a_full_chain_upgrade() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("aionui-backend.db");
    // The exact shapes an install that already ran 054 carries through 055
    // into 056 — which is every real upgrade path, since the reset landed
    // while 055 was itself unreleased.
    build_db_at_053(
        &path,
        &[
            &definition_insert("office", OPENCODE_AGENT, OFFICE_PRESET_AFTER_054),
            &definition_insert("dev", CLAUDE_AGENT, OLD_DEV_PRESET),
            &definition_insert("design", AIONRS_AGENT, DESIGN_PRESET_BEFORE_055),
        ],
    )
    .await;

    let db = init_database_staged(&path).await.expect("the chain must apply cleanly");
    for (id, engine) in [("office", "office"), ("dev", "dev"), ("design", "design")] {
        assert!(
            agent_id_of(&db, id).await.is_some(),
            "the {engine} row must be attached to its engine agent, or the reset never runs"
        );
        assert_eq!(
            skill_ids_of(&db, id).await,
            "[]",
            "the reset clears the {engine} preset to '[]', never NULL"
        );
    }
    db.close().await;
}

#[tokio::test]
async fn the_reset_is_content_blind_so_reordered_and_hand_edited_lists_go_too() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("aionui-backend.db");
    // Two shapes no sentinel can key: an office list whose order the skills
    // hub rewrote (the installed database carries exactly this), and a dev
    // list hand-edited down to three unrelated names. Both are generated,
    // system-owned, fixed-mode rows on shipped engines, so the reset takes
    // them — that is the point of the pass, and sentinel-guarding it would
    // strand exactly these rows.
    let office_reordered = r#"["multi-agent-orchestration","officecli-xlsx","pdf","officecli-docx","weixin-file-send","morph-ppt","data-sql-queries"]"#;
    let dev_hand_edited = r#"["mermaid","grilling","handoff"]"#;
    build_db_at_053(
        &path,
        &[
            &definition_insert("office", OPENCODE_AGENT, office_reordered),
            &definition_insert("dev", CLAUDE_AGENT, dev_hand_edited),
        ],
    )
    .await;

    let db = init_database_staged(&path).await.expect("the chain must apply cleanly");
    assert_eq!(
        skill_ids_of(&db, "office").await,
        "[]",
        "a reordered preset is still a system preset — cleared"
    );
    assert_eq!(
        skill_ids_of(&db, "dev").await,
        "[]",
        "a hand-edited list on a fixed-mode system row is cleared too"
    );
    db.close().await;
}

#[tokio::test]
async fn the_reset_leaves_empty_user_auto_and_fourth_engine_rows_alone() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("aionui-backend.db");
    let unmanaged = r#"["officecli-docx","grilling"]"#;
    build_db_at_053(
        &path,
        &[
            // Already empty: the guard skips it, and it must still be '[]'
            // (never NULL) afterwards.
            &definition_insert("office-empty", OPENCODE_AGENT, "[]"),
            // A user's own copy is not a system preset.
            &definition_row("office-user-copy", OPENCODE_AGENT, unmanaged, "user", "user", "fixed"),
            // A row switched to auto mode keeps its list as the fallback.
            &definition_row("office-auto-mode", OPENCODE_AGENT, unmanaged, "generated", "system", "auto"),
            // A fourth engine is none of the reset's business, fixed mode or
            // not — the three WHERE clauses scope by shipped backend.
            "INSERT INTO agent_metadata (\
                 id, agent_id, name, backend, agent_type, agent_source, enabled, created_at, updated_at\
             ) VALUES (\
                 'agent-gemini', 'agent-gemini', 'Gemini', 'gemini', 'acp', 'custom', 1, 1, 1\
             )",
            &definition_row(
                "gemini-mode",
                "SELECT id FROM agent_metadata WHERE backend = 'gemini'",
                unmanaged,
                "generated",
                "system",
                "fixed",
            ),
        ],
    )
    .await;

    let db = init_database_staged(&path).await.expect("the chain must apply cleanly");
    assert_eq!(skill_ids_of(&db, "office-empty").await, "[]", "an emptied list stays empty");
    assert_eq!(
        skill_ids_of(&db, "office-user-copy").await,
        unmanaged,
        "a user's own copy is not the product's to clear"
    );
    assert_eq!(
        skill_ids_of(&db, "office-auto-mode").await,
        unmanaged,
        "a row switched to auto mode keeps its list as the fallback"
    );
    assert_eq!(
        skill_ids_of(&db, "gemini-mode").await,
        unmanaged,
        "a fixed-mode row on a non-shipped engine is outside the reset's scope"
    );
    db.close().await;
}
