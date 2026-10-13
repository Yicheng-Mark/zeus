-- Zeus fork: append the multi-agent-orchestration skill to all three mode
-- presets (aionui-assistant/zeus_mode_presets.rs adds the same name, so fresh
-- installs seed it via reconcile; this tops up databases whose three generated
-- definitions already exist).
--
-- The orchestration skill teaches each engine to decompose tasks and dispatch
-- sub-agents itself, so the user only sends a task. Same string-surgery append
-- and idempotent sentinel guard as migration 049; lists the user deliberately
-- emptied ('[]') are skipped.

-- office (OpenCode)
UPDATE assistant_definitions
SET default_skill_ids = substr(default_skill_ids, 1, length(default_skill_ids) - 1)
  || ',"multi-agent-orchestration"]',
  updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND owner_type = 'system'
  AND default_skills_mode = 'fixed'
  AND default_skill_ids <> '[]'
  AND default_skill_ids NOT LIKE '%multi-agent-orchestration%'
  AND agent_id IN (SELECT id FROM agent_metadata WHERE backend = 'opencode');

-- design (Zeus internal)
UPDATE assistant_definitions
SET default_skill_ids = substr(default_skill_ids, 1, length(default_skill_ids) - 1)
  || ',"multi-agent-orchestration"]',
  updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND owner_type = 'system'
  AND default_skills_mode = 'fixed'
  AND default_skill_ids <> '[]'
  AND default_skill_ids NOT LIKE '%multi-agent-orchestration%'
  AND agent_id IN (SELECT id FROM agent_metadata WHERE backend IS NULL AND agent_type = 'aionrs');

-- dev (Claude Code)
UPDATE assistant_definitions
SET default_skill_ids = substr(default_skill_ids, 1, length(default_skill_ids) - 1)
  || ',"multi-agent-orchestration"]',
  updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND owner_type = 'system'
  AND default_skills_mode = 'fixed'
  AND default_skill_ids <> '[]'
  AND default_skill_ids NOT LIKE '%multi-agent-orchestration%'
  AND agent_id IN (SELECT id FROM agent_metadata WHERE backend = 'claude');
