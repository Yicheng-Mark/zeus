use std::collections::HashSet;
use std::path::{Path, PathBuf};

use aionui_api_types::{
    CreateKnowledgeNoteRequest, KnowledgeNote, KnowledgeNoteSummary, KnowledgeReindexResponse,
    UpdateKnowledgeNoteRequest,
};
use regex::Regex;
use sqlx::SqlitePool;

use crate::error::SystemError;

/// Obsidian-compatible knowledge base.
///
/// Notes are plain markdown files under `{data_dir}/knowledge/{user_id}/` —
/// a directory the user can open in Obsidian as a vault. The DB tables are a
/// derived index (one row per file + the [[wikilink]] graph); files edited
/// externally are reconciled by [`KnowledgeService::reindex`].
///
/// Unlike the repo-per-service pattern used for providers, this service owns
/// its (small) SQL directly: two tables, no cross-crate reuse to speak of, and
/// a repo layer would only re-export these queries.
#[derive(Clone)]
pub struct KnowledgeService {
    pool: SqlitePool,
    /// Root vault directory; per-user vaults live one level below.
    vault_root: PathBuf,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct NoteRow {
    id: String,
    title: String,
    file_name: String,
    content: String,
    tags: String,
    created_at: i64,
    updated_at: i64,
}

impl From<NoteRow> for KnowledgeNoteSummary {
    fn from(row: NoteRow) -> Self {
        Self {
            id: row.id,
            title: row.title,
            file_name: row.file_name,
            tags: decode_tags(&row.tags),
            updated_at: row.updated_at,
        }
    }
}

impl From<NoteRow> for KnowledgeNote {
    fn from(row: NoteRow) -> Self {
        Self {
            id: row.id,
            title: row.title,
            file_name: row.file_name,
            content: row.content,
            tags: decode_tags(&row.tags),
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

fn decode_tags(raw: &str) -> Vec<String> {
    serde_json::from_str(raw).unwrap_or_default()
}

fn sanitize_title(title: &str) -> String {
    let cleaned: String = title
        .trim()
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            c if (c as u32) < 0x20 => '-',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim_matches(|c: char| c == '-' || c.is_whitespace()).to_string();
    let mut result = trimmed.chars().take(80).collect::<String>();
    if result.is_empty() {
        result = "untitled".to_string();
    }
    result
}

/// Extract [[wikilink]] targets from a note body: `[[Target]]`,
/// `[[path/Target]]`, `[[Target#heading]]` and `[[Target|alias]]` all resolve
/// to `Target`.
fn extract_wikilink_targets(body: &str) -> Vec<String> {
    static PATTERN: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = PATTERN.get_or_init(|| Regex::new(r"\[\[([^\]]+)\]\]").expect("wikilink regex"));
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for cap in re.captures_iter(body) {
        let raw = cap.get(1).map(|m| m.as_str()).unwrap_or_default();
        let target = raw
            .split('|')
            .next()
            .unwrap_or_default()
            .split('#')
            .next()
            .unwrap_or_default()
            .rsplit('/')
            .next()
            .unwrap_or_default()
            .trim();
        if !target.is_empty() && seen.insert(target.to_string()) {
            result.push(target.to_string());
        }
    }
    result
}

/// Serialize a note to markdown: minimal YAML frontmatter (title/tags) + body.
fn render_note_md(title: &str, tags: &[String], body: &str) -> String {
    let tags_inline = if tags.is_empty() {
        "[]".to_string()
    } else {
        format!("[{}]", tags.iter().map(|t| t.replace(',', "\\,")).collect::<Vec<_>>().join(", "))
    };
    format!("---\ntitle: {title}\ntags: {tags_inline}\n---\n\n{body}\n")
}

/// Parse the frontmatter we write (best-effort; external files without
/// frontmatter fall back to the file stem as title).
fn parse_note_md(raw: &str) -> (Option<String>, Vec<String>, String) {
    let trimmed = raw.trim_start_matches('\u{feff}');
    let mut lines = trimmed.splitn(3, "\n---");
    let first = lines.next().unwrap_or_default();
    if !first.trim_end().starts_with("---") {
        return (None, Vec::new(), trimmed.to_string());
    }
    let Some(frontmatter) = lines.next().map(str::trim) else {
        return (None, Vec::new(), trimmed.to_string());
    };
    let body = lines.next().unwrap_or_default().trim_start_matches('\n');
    let mut title = None;
    let mut tags = Vec::new();
    for line in frontmatter.lines() {
        if let Some(value) = line.strip_prefix("title:") {
            title = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("tags:") {
            let inner = value.trim().trim_start_matches('[').trim_end_matches(']');
            tags = inner
                .split(',')
                .map(str::trim)
                .filter(|t| !t.is_empty() && !t.starts_with('\\'))
                .map(|t| t.replace("\\,", ","))
                .collect();
        }
    }
    (title, tags, body.to_string())
}

impl KnowledgeService {
    pub fn new(pool: SqlitePool, data_dir: impl AsRef<Path>) -> Self {
        Self {
            pool,
            vault_root: data_dir.as_ref().join("knowledge"),
        }
    }

    fn vault_dir(&self, user_id: &str) -> PathBuf {
        // user ids are internal identifiers; keep the directory name filesystem-safe.
        self.vault_root.join(user_id.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_"))
    }

    async fn get_row(&self, user_id: &str, id: &str) -> Result<NoteRow, SystemError> {
        sqlx::query_as::<_, NoteRow>("SELECT * FROM knowledge_notes WHERE user_id = ? AND id = ?")
            .bind(user_id)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| SystemError::Internal(format!("knowledge note lookup: {e}")))?
            .ok_or_else(|| SystemError::NotFound(format!("knowledge note '{id}' not found")))
    }

    async fn replace_links(&self, note_id: &str, targets: &[String]) -> Result<(), SystemError> {
        sqlx::query("DELETE FROM knowledge_links WHERE source_note_id = ?")
            .bind(note_id)
            .execute(&self.pool)
            .await
            .map_err(internal)?;
        for target in targets {
            sqlx::query("INSERT OR IGNORE INTO knowledge_links (source_note_id, target_name) VALUES (?, ?)")
                .bind(note_id)
                .bind(target)
                .execute(&self.pool)
                .await
                .map_err(internal)?;
        }
        Ok(())
    }

    /// List notes (newest first). `q` filters across title and body.
    pub async fn list(&self, user_id: &str, q: Option<&str>) -> Result<Vec<KnowledgeNoteSummary>, SystemError> {
        let rows = if let Some(q) = q.map(str::trim).filter(|v| !v.is_empty()) {
            let like = format!("%{}%", q.replace('%', "\\%"));
            sqlx::query_as::<_, NoteRow>(
                "SELECT * FROM knowledge_notes WHERE user_id = ? AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\') \
                 ORDER BY updated_at DESC LIMIT 100",
            )
            .bind(user_id)
            .bind(&like)
            .bind(&like)
            .fetch_all(&self.pool)
            .await
            .map_err(internal)?
        } else {
            sqlx::query_as::<_, NoteRow>("SELECT * FROM knowledge_notes WHERE user_id = ? ORDER BY updated_at DESC")
                .bind(user_id)
                .fetch_all(&self.pool)
                .await
                .map_err(internal)?
        };
        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn get(&self, user_id: &str, id: &str) -> Result<KnowledgeNote, SystemError> {
        Ok(self.get_row(user_id, id).await?.into())
    }

    /// Create a note: pick a collision-free `<title>.md` inside the vault,
    /// write the file, then index it (row + wikilinks).
    pub async fn create(&self, user_id: &str, req: CreateKnowledgeNoteRequest) -> Result<KnowledgeNote, SystemError> {
        let title = req.title.trim();
        if title.is_empty() {
            return Err(SystemError::BadRequest("title is required".into()));
        }
        let dir = self.vault_dir(user_id);
        std::fs::create_dir_all(&dir).map_err(|e| SystemError::Internal(format!("create vault dir: {e}")))?;
        let existing = self.existing_file_names(user_id).await?;
        let file_name = unique_file_name(title, &existing);
        let id = aionui_common::generate_prefixed_id("kn");
        let now = aionui_common::now_ms();
        let body = render_note_md(title, &req.tags, &req.content);
        std::fs::write(dir.join(&file_name), body)
            .map_err(|e| SystemError::Internal(format!("write note file: {e}")))?;

        sqlx::query(
            "INSERT INTO knowledge_notes (id, user_id, title, file_name, content, tags, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(user_id)
        .bind(title)
        .bind(&file_name)
        .bind(&req.content)
        .bind(serde_json::to_string(&req.tags).unwrap_or_else(|_| "[]".into()))
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(internal)?;
        self.replace_links(&id, &extract_wikilink_targets(&req.content)).await?;
        Ok(self.get_row(user_id, &id).await?.into())
    }

    /// Update a note; a title change renames the vault file (links by the old
    /// name will dangle — same as an external rename without Obsidian's
    /// link-rewrite).
    pub async fn update(&self, user_id: &str, id: &str, req: UpdateKnowledgeNoteRequest) -> Result<KnowledgeNote, SystemError> {
        let existing = self.get_row(user_id, id).await?;
        let new_title = req
            .title
            .as_deref()
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .unwrap_or(&existing.title)
            .to_string();
        if req.title.as_deref().is_some_and(|t| t.trim().is_empty()) {
            return Err(SystemError::BadRequest("title cannot be empty".into()));
        }
        let new_content = req.content.unwrap_or(existing.content.clone());
        let new_tags = req.tags.unwrap_or_else(|| decode_tags(&existing.tags));
        let now = aionui_common::now_ms();

        let dir = self.vault_dir(user_id);
        let title_changed = new_title != existing.title;
        let file_name = if title_changed {
            let mut names = self.existing_file_names(user_id).await?;
            names.retain(|name| name != &existing.file_name);
            unique_file_name(&new_title, &names)
        } else {
            existing.file_name.clone()
        };
        std::fs::create_dir_all(&dir).map_err(|e| SystemError::Internal(format!("create vault dir: {e}")))?;
        std::fs::write(dir.join(&file_name), render_note_md(&new_title, &new_tags, &new_content))
            .map_err(|e| SystemError::Internal(format!("write note file: {e}")))?;
        if title_changed && file_name != existing.file_name {
            let _ = std::fs::remove_file(dir.join(&existing.file_name));
        }

        sqlx::query(
            "UPDATE knowledge_notes SET title = ?, file_name = ?, content = ?, tags = ?, updated_at = ? \
             WHERE user_id = ? AND id = ?",
        )
        .bind(&new_title)
        .bind(&file_name)
        .bind(&new_content)
        .bind(serde_json::to_string(&new_tags).unwrap_or_else(|_| "[]".into()))
        .bind(now)
        .bind(user_id)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(internal)?;
        self.replace_links(id, &extract_wikilink_targets(&new_content)).await?;
        Ok(self.get_row(user_id, id).await?.into())
    }

    pub async fn delete(&self, user_id: &str, id: &str) -> Result<(), SystemError> {
        let existing = self.get_row(user_id, id).await?;
        let _ = std::fs::remove_file(self.vault_dir(user_id).join(&existing.file_name));
        sqlx::query("DELETE FROM knowledge_links WHERE source_note_id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(internal)?;
        sqlx::query("DELETE FROM knowledge_notes WHERE user_id = ? AND id = ?")
            .bind(user_id)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(internal)?;
        Ok(())
    }

    /// Notes whose [[wikilinks]] point at this note (by title or file stem).
    pub async fn backlinks(&self, user_id: &str, id: &str) -> Result<Vec<KnowledgeNoteSummary>, SystemError> {
        let note = self.get_row(user_id, id).await?;
        let stem = note.file_name.trim_end_matches(".md").to_string();
        let rows = sqlx::query_as::<_, NoteRow>(
            "SELECT n.* FROM knowledge_notes n \
             JOIN knowledge_links l ON l.source_note_id = n.id \
             WHERE n.user_id = ? AND l.target_name IN (?, ?) \
             ORDER BY n.updated_at DESC",
        )
        .bind(user_id)
        .bind(&note.title)
        .bind(&stem)
        .fetch_all(&self.pool)
        .await
        .map_err(internal)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    /// Resync the index with the vault directory: pick up files created or
    /// edited externally (e.g. in Obsidian), drop rows for deleted files.
    pub async fn reindex(&self, user_id: &str) -> Result<KnowledgeReindexResponse, SystemError> {
        let dir = self.vault_dir(user_id);
        std::fs::create_dir_all(&dir).map_err(|e| SystemError::Internal(format!("create vault dir: {e}")))?;
        let mut on_disk = HashSet::new();
        let entries = std::fs::read_dir(&dir).map_err(|e| SystemError::Internal(format!("read vault dir: {e}")))?;
        let mut indexed = 0usize;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let Some(file_name) = path.file_name().and_then(|n| n.to_str()).map(str::to_owned) else {
                continue;
            };
            on_disk.insert(file_name.clone());
            let raw = std::fs::read_to_string(&path).unwrap_or_default();
            let (fm_title, fm_tags, body) = parse_note_md(&raw);
            let stem = file_name.trim_end_matches(".md").to_string();
            let title = fm_title.filter(|t| !t.trim().is_empty()).unwrap_or(stem);
            let now = aionui_common::now_ms();
            let known = sqlx::query_as::<_, NoteRow>(
                "SELECT * FROM knowledge_notes WHERE user_id = ? AND file_name = ?",
            )
            .bind(user_id)
            .bind(&file_name)
            .fetch_optional(&self.pool)
            .await
            .map_err(internal)?;
            match known {
                Some(row) => {
                    if row.content != body || row.title != title {
                        sqlx::query(
                            "UPDATE knowledge_notes SET title = ?, content = ?, tags = ?, updated_at = ? \
                             WHERE id = ?",
                        )
                        .bind(&title)
                        .bind(&body)
                        .bind(serde_json::to_string(&fm_tags).unwrap_or_else(|_| "[]".into()))
                        .bind(now)
                        .bind(&row.id)
                        .execute(&self.pool)
                        .await
                        .map_err(internal)?;
                        self.replace_links(&row.id, &extract_wikilink_targets(&body)).await?;
                        indexed += 1;
                    }
                }
                None => {
                    let id = aionui_common::generate_prefixed_id("kn");
                    sqlx::query(
                        "INSERT INTO knowledge_notes (id, user_id, title, file_name, content, tags, created_at, updated_at) \
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    )
                    .bind(&id)
                    .bind(user_id)
                    .bind(&title)
                    .bind(&file_name)
                    .bind(&body)
                    .bind(serde_json::to_string(&fm_tags).unwrap_or_else(|_| "[]".into()))
                    .bind(now)
                    .bind(now)
                    .execute(&self.pool)
                    .await
                    .map_err(internal)?;
                    self.replace_links(&id, &extract_wikilink_targets(&body)).await?;
                    indexed += 1;
                }
            }
        }

        // Drop index rows whose files no longer exist.
        let rows = sqlx::query_as::<_, NoteRow>("SELECT * FROM knowledge_notes WHERE user_id = ?")
            .bind(user_id)
            .fetch_all(&self.pool)
            .await
            .map_err(internal)?;
        let mut removed = 0usize;
        for row in rows {
            if !on_disk.contains(&row.file_name) {
                sqlx::query("DELETE FROM knowledge_links WHERE source_note_id = ?")
                    .bind(&row.id)
                    .execute(&self.pool)
                    .await
                    .map_err(internal)?;
                sqlx::query("DELETE FROM knowledge_notes WHERE id = ?")
                    .bind(&row.id)
                    .execute(&self.pool)
                    .await
                    .map_err(internal)?;
                removed += 1;
            }
        }
        Ok(KnowledgeReindexResponse { indexed, removed })
    }

    async fn existing_file_names(&self, user_id: &str) -> Result<HashSet<String>, SystemError> {
        let rows = sqlx::query_as::<_, NoteRow>("SELECT * FROM knowledge_notes WHERE user_id = ?")
            .bind(user_id)
            .fetch_all(&self.pool)
            .await
            .map_err(internal)?;
        Ok(rows.into_iter().map(|r| r.file_name).collect())
    }

    /// Absolute vault path for a note (used by the API to expose file paths).
    pub fn note_path(&self, user_id: &str, file_name: &str) -> PathBuf {
        self.vault_dir(user_id).join(file_name)
    }
}

fn internal(e: sqlx::Error) -> SystemError {
    SystemError::Internal(format!("knowledge query: {e}"))
}

/// Pick `Title.md`, or `Title-2.md`, `Title-3.md`, ... until free.
fn unique_file_name(title: &str, existing: &HashSet<String>) -> String {
    let base = sanitize_title(title);
    let candidate = format!("{base}.md");
    if !existing.contains(&candidate) {
        return candidate;
    }
    for n in 2.. {
        let candidate = format!("{base}-{n}.md");
        if !existing.contains(&candidate) {
            return candidate;
        }
    }
    unreachable!("file name space exhausted")
}

#[cfg(test)]
mod tests {
    use super::*;
    use aionui_db::init_database_memory;

    const USER: &str = "system_default_user";

    async fn setup() -> (KnowledgeService, PathBuf) {
        let db = init_database_memory().await.unwrap();
        let pool = db.pool().clone();
        std::mem::forget(db);
        let dir = std::env::temp_dir().join(format!("kb-test-{}", aionui_common::generate_prefixed_id("t")));
        std::fs::create_dir_all(&dir).unwrap();
        (KnowledgeService::new(pool, &dir), dir)
    }

    #[test]
    fn wikilink_extraction_handles_all_obsidian_forms() {
        let targets = extract_wikilink_targets("see [[Target]] and [[path/Nested|alias]] plus [[Anchor#heading]] and [[Dupe]] [[Dupe]]");
        assert_eq!(targets, vec!["Target".to_string(), "Nested".to_string(), "Anchor".to_string(), "Dupe".to_string()]);
    }

    #[test]
    fn title_sanitize_replaces_windows_unsafe_chars() {
        assert_eq!(sanitize_title("a<b>:c\"/d|e?f*.md"), "a-b--c--d-e-f-.md");
        assert_eq!(sanitize_title("   "), "untitled");
    }

    #[tokio::test]
    async fn create_writes_file_and_indexes_links() {
        let (svc, dir) = setup().await;
        let note = svc
            .create(
                USER,
                CreateKnowledgeNoteRequest {
                    title: "会议记录".into(),
                    content: "链接 [[项目A]] 与 [[项目B]]".into(),
                    tags: vec!["工作".into()],
                },
            )
            .await
            .unwrap();
        let path = svc.note_path(USER, &note.file_name);
        assert!(path.exists(), "vault file must exist");
        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(raw.contains("title: 会议记录"));

        let backlinks_a = svc
            .create(USER, CreateKnowledgeNoteRequest { title: "项目A".into(), content: "内容".into(), tags: vec![] })
            .await
            .unwrap();
        let links = svc.backlinks(USER, &backlinks_a.id).await.unwrap();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].title, "会议记录");

        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn duplicate_titles_get_suffixed_file_names() {
        let (svc, dir) = setup().await;
        let a = svc.create(USER, CreateKnowledgeNoteRequest { title: "Same".into(), content: "1".into(), tags: vec![] }).await.unwrap();
        let b = svc.create(USER, CreateKnowledgeNoteRequest { title: "Same".into(), content: "2".into(), tags: vec![] }).await.unwrap();
        assert_ne!(a.file_name, b.file_name);
        assert_eq!(a.title, b.title, "titles stay identical; only file names differ");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn update_renames_file_and_recomputes_links() {
        let (svc, dir) = setup().await;
        let note = svc
            .create(USER, CreateKnowledgeNoteRequest { title: "Old Name".into(), content: "body [[X]]".into(), tags: vec![] })
            .await
            .unwrap();
        let updated = svc
            .update(
                USER,
                &note.id,
                UpdateKnowledgeNoteRequest {
                    title: Some("New Name".into()),
                    content: Some("body [[Y]]".into()),
                    tags: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(updated.title, "New Name");
        assert_ne!(updated.file_name, note.file_name);
        assert!(!svc.note_path(USER, &note.file_name).exists(), "old file removed after rename");
        assert!(svc.note_path(USER, &updated.file_name).exists());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn search_matches_title_and_body() {
        let (svc, dir) = setup().await;
        svc.create(USER, CreateKnowledgeNoteRequest { title: "架构".into(), content: "网关设计".into(), tags: vec![] }).await.unwrap();
        svc.create(USER, CreateKnowledgeNoteRequest { title: "周报".into(), content: "本周架构评审".into(), tags: vec![] }).await.unwrap();
        let hits = svc.list(USER, Some("架构")).await.unwrap();
        assert_eq!(hits.len(), 2, "title hit + body hit");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn reindex_picks_up_external_edits_and_obeys_deletions() {
        let (svc, dir) = setup().await;
        let vault = dir.join("knowledge").join(USER);
        std::fs::create_dir_all(&vault).unwrap();
        // A note written by an external editor (Obsidian), no frontmatter.
        std::fs::write(vault.join("外部笔记.md"), "来自 Obsidian 的 [[会议记录]]").unwrap();

        let report = svc.reindex(USER).await.unwrap();
        assert_eq!(report.indexed, 1);
        let notes = svc.list(USER, None).await.unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].title, "外部笔记");

        // Delete the file externally; reindex drops the row.
        std::fs::remove_file(vault.join("外部笔记.md")).unwrap();
        let report = svc.reindex(USER).await.unwrap();
        assert_eq!(report.removed, 1);
        assert!(svc.list(USER, None).await.unwrap().is_empty());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn create_rejects_blank_title() {
        let (svc, dir) = setup().await;
        let err = svc
            .create(USER, CreateKnowledgeNoteRequest { title: "  ".into(), content: String::new(), tags: vec![] })
            .await
            .unwrap_err();
        assert!(matches!(err, SystemError::BadRequest(_)));
        let _ = std::fs::remove_dir_all(dir);
    }
}
