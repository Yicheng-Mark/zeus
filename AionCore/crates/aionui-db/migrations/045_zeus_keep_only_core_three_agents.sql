-- Zeus fork: trim the catalog to the three shipped engines.
--
-- Keep: Claude Code (2d23ff1c), OpenCode (53861a53), and the internal Zeus
-- aionrs row (632f31d2, agent_source='internal' so untouched by the guard).
-- Delete every other builtin agent row — the 001 seed plus the later additions
-- from 011/023/025/029/031/034 — and every assistant definition that is not
-- one of the three bare-CLI generated assistants. Builtin definitions (the
-- butler and the legacy knowledge-work presets) and user-created definitions
-- are removed as well: Zeus ships a fixed three-engine catalog.
--
-- Rows are addressed by agent_id (NOT NULL since 030; mirrors id for builtin
-- agent rows and equals the agent's id on generated definitions — verified
-- against live data) and guarded by agent_source / source so user-created
-- custom agents can never be caught by the sweep. Overlays/preferences for
-- removed definitions are cleaned explicitly because SQLite only enforces the
-- declared FKs when PRAGMA foreign_keys is on, which is not guaranteed for the
-- migration connection.

DELETE FROM agent_metadata
WHERE agent_source = 'builtin'
  AND agent_id NOT IN ('2d23ff1c', '53861a53');

DELETE FROM assistant_definitions
WHERE NOT (source = 'generated' AND agent_id IN ('632f31d2', '2d23ff1c', '53861a53'));

DELETE FROM assistant_overlays
WHERE assistant_definition_id NOT IN (SELECT id FROM assistant_definitions);

DELETE FROM assistant_preferences
WHERE assistant_definition_id NOT IN (SELECT id FROM assistant_definitions);
