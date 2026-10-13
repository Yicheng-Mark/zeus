use serde::{Deserialize, Serialize};

/// Summary row for `GET /api/knowledge/notes`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KnowledgeNoteSummary {
    pub id: String,
    pub title: String,
    pub file_name: String,
    pub tags: Vec<String>,
    pub updated_at: i64,
}

/// Full note for `GET /api/knowledge/notes/{id}`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KnowledgeNote {
    pub id: String,
    pub title: String,
    pub file_name: String,
    pub content: String,
    pub tags: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Request body for `POST /api/knowledge/notes`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateKnowledgeNoteRequest {
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Request body for `PUT /api/knowledge/notes/{id}`. All fields optional —
/// partial update semantics.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateKnowledgeNoteRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub tags: Option<Vec<String>>,
}

/// Response for `GET /api/knowledge/notes/{id}/backlinks`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KnowledgeBacklinksResponse {
    /// Notes whose body contains a [[wikilink]] resolving to this note.
    pub notes: Vec<KnowledgeNoteSummary>,
}

/// Response for `POST /api/knowledge/reindex` — resync the index with the
/// vault directory (files may be edited externally, e.g. in Obsidian).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KnowledgeReindexResponse {
    pub indexed: usize,
    pub removed: usize,
}

/// Query params for `GET /api/knowledge/notes?q=`.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct KnowledgeListQuery {
    pub q: Option<String>,
}
