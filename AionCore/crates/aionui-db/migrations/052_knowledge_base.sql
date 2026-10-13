-- Zeus fork: Obsidian-compatible knowledge base.
--
-- Notes live as plain markdown files in a vault directory (default
-- `{data_dir}/knowledge`, openable in Obsidian directly). The DB is a derived
-- index: one row per note file plus the [[wikilink]] graph for backlinks.
-- Reindex reconciles the index with files edited externally.

CREATE TABLE IF NOT EXISTS knowledge_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_notes_user_updated
    ON knowledge_notes(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_links (
    source_note_id TEXT NOT NULL,
    target_name TEXT NOT NULL,
    PRIMARY KEY (source_note_id, target_name)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_links_target
    ON knowledge_links(target_name);
