-- Zeus fork: clear the three mode skill presets outright — the third
-- curation pass, a reset rather than a trim.
--
-- 054 removed the connector-bound names and 055 the names whose tooling the
-- product does not ship; both keyed on a sentinel carried by the untouched
-- preset so a hand-edited list was left alone. This pass is deliberately
-- different: the owner asked for a clean slate to reconfigure the three
-- assistants from scratch, so every generated, system-owned, fixed-mode
-- skill list on the three shipped engines goes to '[]' regardless of its
-- content. No sentinel can key this one — the skills hub rewrites these rows
-- (the installed office row already carries a reordered copy of its preset),
-- so no single name is guaranteed present or absent — hence the
-- content-blind clear.
--
-- Scoped like 054/055: generated + system-owned + fixed mode, per engine.
-- Rows already at '[]' match nothing (idempotent), rows switched to auto
-- mode keep their list as the fallback, and user-owned rows are never
-- touched. Nothing leaves the corpus: every name stays in
-- `aionui-app/assets/builtin-skills/`, one toggle away in the skills hub and
-- the assistant editor. The compile-time presets in
-- aionui-assistant/zeus_mode_presets.rs carry the same reset, so fresh
-- installs are born empty, and the reconcile pass never re-seeds a row that
-- is already in fixed mode.

-- office (OpenCode)
UPDATE assistant_definitions
SET default_skill_ids = '[]',
    updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND owner_type = 'system'
  AND default_skills_mode = 'fixed'
  AND default_skill_ids <> '[]'
  AND agent_id IN (SELECT id FROM agent_metadata WHERE backend = 'opencode');

-- dev (Claude Code)
UPDATE assistant_definitions
SET default_skill_ids = '[]',
    updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND owner_type = 'system'
  AND default_skills_mode = 'fixed'
  AND default_skill_ids <> '[]'
  AND agent_id IN (SELECT id FROM agent_metadata WHERE backend = 'claude');

-- design (Zeus aionrs)
UPDATE assistant_definitions
SET default_skill_ids = '[]',
    updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND owner_type = 'system'
  AND default_skills_mode = 'fixed'
  AND default_skill_ids <> '[]'
  AND agent_id IN (SELECT id FROM agent_metadata WHERE backend IS NULL AND agent_type = 'aionrs');
