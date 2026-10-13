//! Migration 045/048 — Zeus keeps only the three shipped engines
//! (设计/aionrs internal, 开发/Claude Code, 办公/OpenCode — role names and
//! icons applied by 048). These tests run the full migration chain through
//! the production init path (pragma setup included) on a fresh in-memory
//! database and assert the final catalog state, so a future migration that
//! accidentally reintroduces a builtin row or resurrects the butler
//! definition fails here first.

use aionui_db::init_database_memory;
use sqlx::Row;

#[tokio::test]
async fn agent_metadata_keeps_only_the_three_zeus_engines() {
    let db = init_database_memory().await.unwrap();

    let rows: Vec<(String, String, String)> =
        sqlx::query_as("SELECT agent_id, agent_source, name FROM agent_metadata ORDER BY sort_order")
            .fetch_all(db.pool())
            .await
            .unwrap();

    assert_eq!(
        rows,
        vec![
            ("632f31d2".to_string(), "internal".to_string(), "设计".to_string()),
            ("2d23ff1c".to_string(), "builtin".to_string(), "开发".to_string()),
            ("53861a53".to_string(), "builtin".to_string(), "办公".to_string()),
        ],
        "expected exactly 设计(aionrs), 开发(Claude Code) and 办公(OpenCode) after the full chain"
    );
}

#[tokio::test]
async fn builtin_assistant_definitions_are_gone_after_045() {
    let db = init_database_memory().await.unwrap();

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM assistant_definitions WHERE source = 'builtin'")
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(count, 0, "045 must remove every builtin definition (butler included)");
}

#[tokio::test]
async fn orphan_overlays_and_preferences_are_cleaned() {
    let db = init_database_memory().await.unwrap();

    let orphan_overlays: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM assistant_overlays
         WHERE assistant_definition_id NOT IN (SELECT id FROM assistant_definitions)",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(orphan_overlays, 0);

    let orphan_prefs: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM assistant_preferences
         WHERE assistant_definition_id NOT IN (SELECT id FROM assistant_definitions)",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(orphan_prefs, 0);
}

#[tokio::test]
async fn kept_claude_row_still_carries_its_spawn_configuration() {
    let db = init_database_memory().await.unwrap();

    // Claude is a direct-CLI row: `command` is NULL and the binary is resolved
    // from agent_source_info.binary_name, so assert that survives the sweep.
    // The role name/icon come from 048.
    let row = sqlx::query(
        "SELECT name, backend, icon,
                json_extract(agent_source_info, '$.binary_name') AS binary_name
         FROM agent_metadata WHERE agent_id = '2d23ff1c'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(row.get::<String, _>("name"), "开发");
    assert_eq!(row.get::<String, _>("icon"), "/api/assets/logos/zeus/dev.png");
    assert_eq!(row.get::<String, _>("backend"), "claude");
    assert_eq!(row.get::<String, _>("binary_name"), "claude");

    let row = sqlx::query("SELECT name, icon, agent_type FROM agent_metadata WHERE agent_id = '632f31d2'")
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(row.get::<String, _>("name"), "设计");
    assert_eq!(row.get::<String, _>("icon"), "/api/assets/logos/zeus/design.png");
    assert_eq!(row.get::<String, _>("agent_type"), "aionrs");
}
